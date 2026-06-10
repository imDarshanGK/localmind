"""Chat routes — /api/chat — supports normal + streaming"""

import json
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.schemas import ChatRequest, ChatResponse
from services import ollama_service, db_service

import time 
import psutil

def _get_memory_usage():
    mem = psutil.virtual_memory()
    return round(mem.used / (1024 ** 3), 1), round(mem.total / (1024 ** 3), 1)

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
    
    first_token_time = None 
    start_time = time.perf_counter()

    db_service.create_session(req.session_id, model=req.model)
    history = db_service.get_history(req.session_id)

    context, sources = "", []
    if req.use_documents:
        context, sources = rag_service.retrieve_context(req.message, req.session_id)

    db_service.save_message(req.session_id, "user", req.message)

    full_reply = []

    async def event_stream():
        nonlocal first_token_time
        token_count = 0
        async for token in ollama_service.chat_stream(
            message=req.message,
            model=req.model,
            context=context,
            history=history,
            language=req.language,
            temperature=req.temperature,
        ):
            if first_token_time == None:
                first_token_time = time.perf_counter()
            full_reply.append(token)
            token_count += 1
            yield f"data: {json.dumps({'token': token})}\n\n"

        end_time = time.perf_counter()

        complete = "".join(full_reply)
        ttft_ms = round((first_token_time - start_time) * 1000) if first_token_time else 0
        total_duration_ms = round((end_time - start_time) * 1000)
        memory_used_gb, memory_total_gb = _get_memory_usage()

        benchmarks = {
            "ttft_ms": ttft_ms,
            "total_duration_ms": total_duration_ms,
            "token_count": token_count,
            "memory_used_gb": memory_used_gb,
            "memory_total_gb": memory_total_gb,
        }

        db_service.save_message(req.session_id, "assistant", complete, sources, benchmarks)
        yield f"data: {json.dumps({'done': True, 'sources': sources, 'benchmarks': benchmarks})}\n\n"
        

    return StreamingResponse(event_stream(), media_type="text/event-stream")
