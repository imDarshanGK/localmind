"""
LocalMind v2.0 — Offline AI Assistant Platform
Backend: FastAPI + Ollama + LangChain + ChromaDB + WebSockets
"""

import logging
import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import time

from fastapi import FastAPI,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from routes.chat import router as chat_router
from routes.upload import router as upload_router
from routes.models import router as models_router
from routes.sessions import router as sessions_router
from routes.plugins import router as plugins_router
from routes.export import router as export_router
from routes.settings import router as settings_router

from routes.prompt_templates import router as prompt_templates_router
from middleware.csrf import OriginValidationMiddleware
from services.db_service import init_db, get_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", "/app/frontend/dist"))


def run_preflight_checks():
    logger.info("========== LocalMind Preflight Checklist ==========")

    checks = []

    try:
        os.makedirs("./data/uploads", exist_ok=True)
        checks.append(("Uploads directory", True))
    except Exception:
        checks.append(("Uploads directory", False))

    try:
        os.makedirs("./data/chromadb", exist_ok=True)
        checks.append(("ChromaDB directory", True))
    except Exception:
        checks.append(("ChromaDB directory", False))

    try:
        os.makedirs("./data/exports", exist_ok=True)
        checks.append(("Exports directory", True))
    except Exception:
        checks.append(("Exports directory", False))

    try:
        init_db()
        with get_db() as conn:
            conn.execute("SELECT 1")
        checks.append(("SQLite database", True))
    except Exception:
        checks.append(("SQLite database", False))

    for name, ok in checks:
        status = "OK" if ok else "WARN"
        logger.info(f"[{status}] {name}")

    logger.info("=================================================")


# Starting lifespan code block
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LocalMind v2.0...")
    run_preflight_checks()
    
    # Start stream cleanup task
    from routes.chat import clean_expired_streams
    cleanup_task = asyncio.create_task(clean_expired_streams())
    
    logger.info("LocalMind v2.0 ready!")
    yield
    logger.info("👋 Shutting down...")
    
    # Cancel stream cleanup task
    cleanup_task.cancel()
    await asyncio.gather(cleanup_task, return_exceptions=True)


app = FastAPI(
    title="LocalMind API",
    description="Offline AI Assistant — v2.0",
    version="2.0.0",
    lifespan=lifespan,
)

default_cors_origins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://localhost:8000" 
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", default_cors_origins).split(",")
    if origin.strip()
]

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(OriginValidationMiddleware, allowed_origins=cors_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
RATE_LIMIT = 100
RATE_LIMIT_WINDOW = 60
rate_limits = {}

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "127.0.0.1"
    current_time = time.time()
    
    if client_ip not in rate_limits or current_time > rate_limits[client_ip]["reset_at"]:
        rate_limits[client_ip] = {"count": 0, "reset_at": current_time + RATE_LIMIT_WINDOW}
        
    rate_limits[client_ip]["count"] += 1
    remaining = max(0, RATE_LIMIT - rate_limits[client_ip]["count"])
    reset_time = int(rate_limits[client_ip]["reset_at"])
    
    response = await call_next(request)
    
    response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(reset_time)
    
    return response
app.include_router(chat_router,     prefix="/api/chat",     tags=["Chat"])
app.include_router(upload_router,   prefix="/api/upload",   tags=["Upload"])
app.include_router(models_router,   prefix="/api/models",   tags=["Models"])
app.include_router(sessions_router, prefix="/api/sessions", tags=["Sessions"])
app.include_router(plugins_router,  prefix="/api/plugins",  tags=["Plugins"])
app.include_router(export_router,   prefix="/api/export",   tags=["Export"])
app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])
app.include_router(prompt_templates_router, prefix="/api/prompt-templates", tags=["Prompt Templates"])

if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")


@app.get("/", tags=["Health"])
async def root():
    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"app": "LocalMind", "version": "2.0.0", "status": "running"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}

@app.get("/health/db", tags=["Health"])
async def db_health():
    try:
        with get_db() as conn:
            conn.execute("SELECT 1")
        return {"status": "healthy"}
    except Exception:
        return {"status": "unhealthy"}
