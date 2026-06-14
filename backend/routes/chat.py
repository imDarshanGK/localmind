"""Chat routes — /api/chat — supports normal + streaming"""

import asyncio
import time
import json
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.schemas import ChatRequest, ChatResponse
from services import ollama_service, db_service

import psutil

def _get_memory_usage():
    mem = psutil.virtual_memory()
    return round(mem.used / (1024 ** 3), 1), round(mem.total / (1024 ** 3), 1)

router = APIRouter()

def _retrieve_context(*args, **kwargs):
    from services import rag_service as rag_service_module

    return rag_service_module.retrieve_context(*args, **kwargs)


rag_service = SimpleNamespace(retrieve_context=_retrieve_context)


# Global registry for active streams
ACTIVE_STREAMS = {}


class StreamBuffer:
    def __init__(self, session_id: str, prompt: str):
        self.session_id = session_id
        self.prompt = prompt
        self.buffer = ""
        self.completed = False
        self.listeners = set()
        self.created_at = time.time()
        self.updated_at = time.time()
        self.completed_at = None
        self.error = None
        self.sources = []


async def clean_expired_streams():
    while True:
        try:
            await asyncio.sleep(10)
            now = time.time()
            for session_id, buffer in list(ACTIVE_STREAMS.items()):
                # Evict completed or failed streams after 120 seconds (2 minutes)
                if (buffer.completed or buffer.error is not None) and buffer.completed_at:
                    if now - buffer.completed_at > 120:
                        ACTIVE_STREAMS.pop(session_id, None)
                # Evict abandoned or running streams after 300 seconds (5 minutes)
                elif now - buffer.created_at > 300:
                    ACTIVE_STREAMS.pop(session_id, None)
        except asyncio.CancelledError:
            break
        except Exception:
            pass


async def background_generator(buffer: StreamBuffer, req, context, history, sources, start_time: float):
    first_token_time = None
    token_count = 0
    try:
        async for token in ollama_service.chat_stream(
            message=req.message,
            model=req.model,
            context=context,
            history=history,
            language=req.language,
            temperature=req.temperature,
        ):
            if first_token_time is None:
                first_token_time = time.perf_counter()
            token_count += 1
            buffer.buffer += token
            buffer.updated_at = time.time()
            # Push token to all active listeners
            for listener in list(buffer.listeners):
                await listener.put({"token": token})

        end_time = time.perf_counter()
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

        # Save successfully completed message
        db_service.save_message(buffer.session_id, "assistant", buffer.buffer, sources, benchmarks)
        buffer.completed = True
        buffer.sources = sources
        buffer.benchmarks = benchmarks
        buffer.completed_at = time.time()

        for listener in list(buffer.listeners):
            await listener.put({"done": True, "sources": sources, "benchmarks": benchmarks})

    except Exception as e:
        buffer.error = str(e)
        buffer.completed_at = time.time()
        # Save partial response
        if buffer.buffer:
            db_service.save_message(buffer.session_id, "assistant", buffer.buffer, sources)
        for listener in list(buffer.listeners):
            await listener.put({"error": str(e)})


async def stream_from_buffer(buffer: StreamBuffer, resume_offset: int):
    # 1. Send already accumulated tokens from resume_offset
    accumulated = buffer.buffer
    if resume_offset < len(accumulated):
        yield f"data: {json.dumps({'token': accumulated[resume_offset:]})}\n\n"

    # 2. If already finished, stop
    if buffer.completed:
        yield f"data: {json.dumps({'done': True, 'sources': buffer.sources, 'benchmarks': getattr(buffer, 'benchmarks', None)})}\n\n"
        return
    if buffer.error:
        yield f"data: {json.dumps({'error': buffer.error})}\n\n"
        return

    # 3. Wait for new tokens
    listener = asyncio.Queue()
    buffer.listeners.add(listener)
    try:
        while True:
            event = await listener.get()
            if "error" in event:
                yield f"data: {json.dumps({'error': event['error']})}\n\n"
                break
            if "token" in event:
                yield f"data: {json.dumps({'token': event['token']})}\n\n"
            if "done" in event:
                yield f"data: {json.dumps({'done': True, 'sources': event['sources'], 'benchmarks': event.get('benchmarks')})}\n\n"
                break
    finally:
        buffer.listeners.discard(listener)


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
    
    start_time = time.perf_counter()

    resume_offset = req.resume_offset or 0
    is_resume = resume_offset > 0

    # 1. Check active stream buffers
    buffer = ACTIVE_STREAMS.get(req.session_id)
    if buffer and buffer.prompt == req.message:
        return StreamingResponse(stream_from_buffer(buffer, resume_offset), media_type="text/event-stream")

    # 2. Check completed stream in SQLite
    history = db_service.get_history(req.session_id)
    if is_resume and history:
        if history[-1]["role"] == "assistant" and len(history) >= 2:
            prev_msg = history[-2]
            if prev_msg["role"] == "user" and prev_msg["content"] == req.message:
                async def stream_from_db():
                    full_content = history[-1]["content"]
                    sources = []
                    benchmarks = None
                    messages_full = db_service.get_messages_full(req.session_id)
                    if messages_full:
                        sources = messages_full[-1].get("sources", [])
                        benchmarks = messages_full[-1].get("benchmarks", None)
                    if resume_offset < len(full_content):
                        yield f"data: {json.dumps({'token': full_content[resume_offset:]})}\n\n"
                    yield f"data: {json.dumps({'done': True, 'sources': sources, 'benchmarks': benchmarks})}\n\n"
                return StreamingResponse(stream_from_db(), media_type="text/event-stream")

    # 3. Deduplicate user message
    user_msg_exists = False
    if history:
        if history[-1]["role"] == "user" and history[-1]["content"] == req.message:
            user_msg_exists = True
        elif len(history) >= 2 and history[-1]["role"] == "assistant" and history[-2]["role"] == "user" and history[-2]["content"] == req.message:
            user_msg_exists = True

    db_service.create_session(req.session_id, model=req.model)
    if not user_msg_exists:
        db_service.save_message(req.session_id, "user", req.message)
        history = db_service.get_history(req.session_id)

    # 4. Clean history
    cleaned_history = []
    if history and history[-1]["role"] == "assistant":
        cleaned_history = history[:-1]
    else:
        cleaned_history = history

    context, sources = "", []
    if req.use_documents:
        context, sources = rag_service.retrieve_context(req.message, req.session_id)

    # Create new stream buffer and task
    buffer = StreamBuffer(req.session_id, req.message)
    ACTIVE_STREAMS[req.session_id] = buffer

    asyncio.create_task(background_generator(
        buffer=buffer,
        req=req,
        context=context,
        history=cleaned_history,
        sources=sources,
        start_time=start_time
    ))

    return StreamingResponse(stream_from_buffer(buffer, resume_offset), media_type="text/event-stream")

