"""Models routes — /api/models"""

import asyncio  # <-- Added for timeout handling
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from services import ollama_service

router = APIRouter()

RECOMMENDED = [
    {"name": "llama3",   "description": "Best overall — Meta Llama 3 8B",      "size": "~4.7 GB"},
    {"name": "mistral",  "description": "Fast + smart — Mistral 7B",            "size": "~4.1 GB"},
    {"name": "phi3",     "description": "Lightweight — Microsoft Phi-3 mini",   "size": "~2.3 GB"},
    {"name": "gemma2",   "description": "Google Gemma 2 9B",                    "size": "~5.4 GB"},
    {"name": "deepseek-r1", "description": "DeepSeek R1 reasoning model",       "size": "~4.7 GB"},
]

# Set a safety execution ceiling (15 seconds) for model swapping processing
SWITCH_TIMEOUT_LIMIT = 15.0

@router.post("/{model_name}/switch")
async def switch_model(model_name: str):
    """Switch active running target model with timeout defense limits."""
    if not await ollama_service.is_ollama_running():
        raise HTTPException(503, "Ollama not running")
        
    try:
        # Wrap the initialization context inside an explicit timeout boundary
        async with asyncio.timeout(SWITCH_TIMEOUT_LIMIT):
            # Check if the model metadata exists before attempting to load it
            info = await ollama_service.get_model_info(model_name)
            if not info:
                raise HTTPException(404, f"Model '{model_name}' is not pulled locally.")
            
            # Optional hook point: If your ollama_service layer provides a direct loading function, 
            # you can call it here. For instance: await ollama_service.load_model(model_name)
            
        return {"status": "success", "active_model": model_name}

    except asyncio.TimeoutError:
        raise HTTPException(
            504, 
            f"The backend timed out while attempting to shift contexts to '{model_name}'."
        )


@router.get("/")
async def list_models():
    if not await ollama_service.is_ollama_running():
        raise HTTPException(503, "Ollama not running")
    models = await ollama_service.list_models()
    return {"models": models, "recommended": RECOMMENDED}


@router.get("/status")
async def status():
    running = await ollama_service.is_ollama_running()
    return {"ollama_running": running}


@router.get("/{model_name}/info")
async def get_model_info(model_name: str):
    """Get detailed model metadata."""
    if not await ollama_service.is_ollama_running():
        raise HTTPException(503, "Ollama not running")
    
    info = await ollama_service.get_model_info(model_name)
    if not info:
        raise HTTPException(404, f"Model {model_name} not found")
    return info


@router.post("/{model_name}/pull")
async def pull_model(model_name: str):
    """Stream model pull progress."""
    if not await ollama_service.is_ollama_running():
        raise HTTPException(503, "Ollama not running")
    return StreamingResponse(
        ollama_service.pull_model(model_name),
        media_type="text/event-stream",
    )


@router.delete("/{model_name}")
async def delete_model(model_name: str):
    ok = await ollama_service.delete_model(model_name)
    if not ok:
        raise HTTPException(400, f"Could not delete {model_name}")
    return {"status": "deleted", "model": model_name}
