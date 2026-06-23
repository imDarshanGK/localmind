"""Chat routes — /api/chat — supports normal + streaming"""

import json
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.schemas import ChatRequest, ChatResponse
from services import ollama_service, db_service

router = APIRouter()


def _retrieve_context(*args, **kwargs):
    from services import rag_service as rag_service_module

    return rag_service_module.retrieve_context(*args, **kwargs)


rag_service = SimpleNamespace(retrieve_context=_retrieve_context)

# Global fallback message string
OLLAMA_OFFLINE_FALLBACK = (
    "⚠️ I'm currently unable to process your request because the local AI engine (Ollama) is offline. "
    "Please open your terminal and run `ollama serve` to start it back up!"
)


@router.post("/", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Standard (non-streaming) chat endpoint."""
    if not await ollama_service.is_ollama_running():
        # Save interaction to database to preserve conversation state continuity
        db_service.create_session(req.session_id, model=req.model)
        db_service.save_message(req.session_id, "user", req.message)
        db_service.save_message(req.session_id, "assistant", OLLAMA_OFFLINE_FALLBACK)
        
        return ChatResponse(reply=OLLAMA_OFFLINE_FALLBACK, session_id=req.session_id, model=req.model, sources=[])

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
        # Save conversation history tracking rows
        db_service.create_session(req.session_id, model=req.model)
        db_service.save_message(req.session_id, "user", req.message)
        db_service.save_message(req.session_id, "assistant", OLLAMA_OFFLINE_FALLBACK)

        # Create a generator that simulates the stream over SSE tokens
        async def fallback_event_stream():
            yield f"data: {json.dumps({'token': OLLAMA_OFFLINE_FALLBACK})}\n\n"
            yield f"data: {json.dumps({'done': True, 'sources': []})}\n\n"

        return StreamingResponse(fallback_event_stream(), media_type="text/event-stream")

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