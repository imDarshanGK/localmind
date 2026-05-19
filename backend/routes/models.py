"""Models routes — /api/models"""

from fastapi import APIRouter, HTTPException
from services import ollama_service

router = APIRouter()

RECOMMENDED_MODELS = [
    {"name": "llama3", "description": "Best overall — Meta Llama 3 8B", "size": "~4.7 GB"},
    {"name": "mistral", "description": "Fast and smart — Mistral 7B", "size": "~4.1 GB"},
    {"name": "phi3", "description": "Lightweight — Microsoft Phi-3 mini", "size": "~2.3 GB"},
    {"name": "gemma2", "description": "Google Gemma 2 9B", "size": "~5.4 GB"},
]


@router.get("/")
async def list_models():
    """List all locally available Ollama models."""
    if not await ollama_service.is_ollama_running():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running. Start it with: `ollama serve`",
        )
    models = await ollama_service.list_models()
    return {"models": models, "recommended": RECOMMENDED_MODELS}


@router.get("/status")
async def ollama_status():
    """Check if Ollama is running."""
    running = await ollama_service.is_ollama_running()
    return {
        "ollama_running": running,
        "message": "Ollama is running ✅" if running else "Ollama not found. Install from https://ollama.ai",
    }
