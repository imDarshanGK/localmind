"""Chat routes — /api/chat — supports normal + streaming"""

import json
import logging
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.schemas import ChatRequest, ChatResponse
from services import ollama_service, db_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _retrieve_context(*args, **kwargs):
    from services import rag_service as rag_service_module

    return rag_service_module.retrieve_context(*args, **kwargs)


rag_service = SimpleNamespace(retrieve_context=_retrieve_context)


@router.post("/", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Standard (non-streaming) chat endpoint."""
    if not await ollama_service.is_ollama_running():
        raise HTTPException(503, "Ollama not running. Run: `ollama serve`")

    db_service.create_session(req.session_id, model=req.model)
    history = db_service.get_history(req.session_id)

    context, sources = "", []
    if req.use_documents:
        settings = db_service.get_settings()
        top_k = int(settings.get("rag_top_k", 4))
        context, sources = rag_service.retrieve_context(req.message, req.session_id, top_k)

    db_service.save_message(req.session_id, "user", req.message)

    reply = await ollama_service.chat(
        message=req.message,
        model=req.model,
        context=context,
        history=history,
        language=req.language,
        temperature=req.temperature,
    )

    db_service.save_message(req.session_id, "assistant", reply, sources)

    return ChatResponse(reply=reply, session_id=req.session_id, model=req.model, sources=sources)


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    """Streaming chat — returns Server-Sent Events."""
    if not await ollama_service.is_ollama_running():
        raise HTTPException(503, "Ollama not running. Run: `ollama serve`")

    db_service.create_session(req.session_id, model=req.model)
    history = db_service.get_history(req.session_id)

    context, sources = "", []
    if req.use_documents:
        context, sources = rag_service.retrieve_context(req.message, req.session_id)

    db_service.save_message(req.session_id, "user", req.message)

    full_reply = []

    async def event_stream():
        async for token in ollama_service.chat_stream(
            message=req.message,
            model=req.model,
            context=context,
            history=history,
            language=req.language,
            temperature=req.temperature,
        ):
            full_reply.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"

        complete = "".join(full_reply)
        db_service.save_message(req.session_id, "assistant", complete, sources)
        yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── Shareable Read-Only Session Links (Issue #270) ───────────

@router.post("/share/{session_id}")
async def api_create_share_link(session_id: str):
    """
    Generates a secure point-in-time public snapshot 
    for a given local conversation session thread.
    """
    try:
        share_id = db_service.create_shared_session(session_id)
        return {
            "success": True,
            "share_id": share_id,
            "share_url": f"/shared/{share_id}"  # The relative frontend link path
        }
    except ValueError as val_err:
        raise HTTPException(status_code=404, detail=str(val_err))
    except Exception as e:
        logger.error("Failed to generate shared snapshot: %s", str(e))
        raise HTTPException(status_code=500, detail="Internal server error processing share link request")


@router.get("/share/{share_id}")
async def api_get_shared_snapshot(share_id: str):
    """
    Publicly fetches a shared snapshot record to render in read-only view containers.
    """
    snapshot = db_service.get_shared_session(share_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="The requested shared chat conversation link does not exist or has expired")
    
    return {
        "success": True,
        "snapshot": snapshot
    }