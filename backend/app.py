"""
LocalMind v2.0 — Offline AI Assistant Platform
Backend: FastAPI + Ollama + LangChain + ChromaDB + WebSockets
"""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
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
from services.db_service import init_db

# --- Issue #284 Engine Stability: Contextual Thread-Safe Log Formatter ---
class CorrelationIdFormatter(logging.Formatter):
    def format(self, record):
        # Safely defaults to GLOBAL without colliding with factory dictionary keys
        if not hasattr(record, "correlation_id"):
            record.correlation_id = "GLOBAL"
        return super().format(record)

# Initialize a standard console stream log handler
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(
    CorrelationIdFormatter("%(asctime)s | %(levelname)s | [%(correlation_id)s] | %(name)s | %(message)s")
)

# Apply our stream configuration directly onto the base application root logger scope
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
# Clear out any default pre-existing basic handlers to prevent duplicate printouts
root_logger.handlers = [stream_handler]

logger = logging.getLogger(__name__)
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", "/app/frontend/dist"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LocalMind v2.0...")
    os.makedirs("./data/uploads", exist_ok=True)
    os.makedirs("./data/chromadb", exist_ok=True)
    os.makedirs("./data/exports", exist_ok=True)
    init_db()
    logger.info("LocalMind v2.0 ready!")
    yield
    logger.info("👋 Shutting down...")


app = FastAPI(
    title="LocalMind API",
    description="Offline AI Assistant — v2.0",
    version="2.0.0",
    lifespan=lifespan,
)

# --- Issue #284: Custom Correlation Tracking Middleware Interceptor ---
@app.middleware("http")
async def add_request_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get("X-Correlation-ID", f"gen-{uuid.uuid4()}")
    
    # Safely attach tracking state directly onto the request state context loop
    request.state.correlation_id = correlation_id
    
    extra = {"correlation_id": correlation_id}
    logger.info(f"Incoming Request: {request.method} {request.url.path}", extra=extra)
    
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    return response


default_cors_origins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173"
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", default_cors_origins).split(",")
    if origin.strip()
]

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID"],
)

app.include_router(chat_router,     prefix="/api/chat",     tags=["Chat"])
app.include_router(upload_router,   prefix="/api/upload",   tags=["Upload"])
app.include_router(models_router,   prefix="/api/models",   tags=["Models"])
app.include_router(sessions_router, prefix="/api/sessions", tags=["Sessions"])
app.include_router(plugins_router,  prefix="/api/plugins",  tags=["Plugins"])
app.include_router(export_router,   prefix="/api/export",   tags=["Export"])
app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])


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