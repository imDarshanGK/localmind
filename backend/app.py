"""
LocalMind — Offline AI Assistant Platform
Backend: FastAPI + Ollama + LangChain + ChromaDB
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from routes.chat import router as chat_router
from routes.upload import router as upload_router
from routes.models import router as models_router
from services.db_service import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB and resources on startup."""
    logger.info("🧠 Starting LocalMind backend...")
    init_db()
    logger.info("✅ LocalMind ready!")
    yield
    logger.info("👋 Shutting down LocalMind...")


app = FastAPI(
    title="LocalMind API",
    description="Offline AI Assistant — Chat with your documents locally",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
app.include_router(upload_router, prefix="/api/upload", tags=["Upload"])
app.include_router(models_router, prefix="/api/models", tags=["Models"])


@app.get("/")
async def root():
    return {
        "app": "LocalMind",
        "version": "1.0.0",
        "status": "running",
        "message": "Your private AI assistant is ready 🧠",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
