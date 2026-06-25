"""Chat routes — /api/chat — supports normal + streaming + message reactions"""

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from types import SimpleNamespace

import psutil
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models.schemas import ChatRequest, ChatResponse
from pydantic import BaseModel
from services import db_service, ollama_service

logger = logging.getLogger(__name__)
router = APIRouter()

# Define the absolute or relative path where export files are saved on the server
EXPORT_DIR = Path(__file__).parent.parent / "localmind_exports"
os.makedirs(EXPORT_DIR, exist_ok=True)

def _get_memory_usage():
    mem = psutil.virtual_memory()
    return round(mem.used / (1024 ** 3), 1), round(mem.total / (1024 ** 3), 1)


def _retrieve_context(*args, **kwargs):
    from services import rag_service as rag_service_module
    return rag_service_module.retrieve_context(*args, **kwargs)


rag_service = SimpleNamespace(retrieve_context=_retrieve_context)

# Global fallback message string
OLLAMA_OFFLINE_FALLBACK = (
    "⚠️ I'm currently unable to process your request because the local AI engine (Ollama) is offline. "
    "Please open your terminal and run `ollama serve` to start it back up!"
)


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
        self.completed_at: float | None = None
        self.error: str | None = None
        self.sources = []
        self.benchmarks: dict | None = None
        self.cancelled = False

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
            if buffer.cancelled:
                break
            
            if first_token_time is None:
                first_token_time = time.perf_counter()
            token_count += 1
            buffer.buffer += token
            buffer.updated_at = time.time()
            # Push token to all active listeners
            for listener in list(buffer.listeners):
                await listener.put({"token": token})

        if buffer.cancelled:
            buffer.buffer += "\n\n[Generation Stopped]"

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

        # Save successfully completed message and get its autoincremented ID
        msg_id = db_service.save_message(buffer.session_id, "assistant", buffer.buffer, sources, benchmarks)
        
        buffer.completed = True
        buffer.sources = sources
        buffer.benchmarks = benchmarks
        buffer.completed_at = time.time()
        buffer.message_id = msg_id  # Store it on the buffer for any late attachments

        for listener in list(buffer.listeners):
            await listener.put({
                "done": True, 
                "message_id": msg_id,  # <--- Send the real DB ID to the frontend!
                "sources": sources, 
                "benchmarks": benchmarks
            })

    except Exception as e:
        buffer.error = str(e)
        buffer.completed_at = time.time()
        # Save partial response
        if buffer.buffer:
            msg_id = db_service.save_message(buffer.session_id, "assistant", buffer.buffer, sources)
            for listener in list(buffer.listeners):
                await listener.put({"error": str(e), "message_id": msg_id})
        else:
            for listener in list(buffer.listeners):
                await listener.put({"error": str(e)})


async def stream_from_buffer(buffer: StreamBuffer, resume_offset: int):
    # 1. Send already accumulated tokens from resume_offset
    accumulated = buffer.buffer
    if resume_offset < len(accumulated):
        yield f"data: {json.dumps({'token': accumulated[resume_offset:]})}\n\n"

    # 2. If already finished, stop
    if buffer.completed:
        yield f"data: {json.dumps({'done': True, 'message_id': getattr(buffer, 'message_id', None), 'sources': buffer.sources, 'benchmarks': getattr(buffer, 'benchmarks', None)})}\n\n"
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


# ─── New Reaction Schemas & Routes ──────────────────────────────────────────

class ReactionToggleRequest(BaseModel):
    message_id: int
    emoji: str

@router.post("/messages/toggle-reaction")
async def api_toggle_reaction(payload: ReactionToggleRequest):
    """Toggles an emoji reaction for a given message and returns updated arrays."""
    try:
        action = db_service.toggle_message_reaction(payload.message_id, payload.emoji)
        updated_reactions = db_service.get_reactions_for_message(payload.message_id)
        return {
            "success": True,
            "action": action,
            "message_id": payload.message_id,
            "reactions": updated_reactions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle reaction: {str(e)}")


@router.get("/{session_id}/messages")
async def get_session_messages(session_id: str):
    """Fetches full historical messages for a session bundled with active reactions."""
    try:
        messages = db_service.get_messages_full(session_id)
        reactions_map = db_service.get_session_reactions_map(session_id)
        
        for msg in messages:
            msg["reactions"] = reactions_map.get(msg["id"], [])
            
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch session messages: {str(e)}")


# ─── Standard Chat Operations ───────────────────────────────────────────────

@router.post("/", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Standard (non-streaming) chat endpoint."""
    logger.info(
        "chat_request route=/chat stream=false session=%s model=%s language=%s "
        "use_documents=%s prompt_chars=%d",
        req.session_id, req.model, req.language, req.use_documents, len(req.message or ""),
    )
    if not await ollama_service.is_ollama_running():
        # Save interaction to database to preserve conversation state continuity
        db_service.create_session(req.session_id, model=req.model)
        db_service.save_message(req.session_id, "user", req.message)
        db_service.save_message(req.session_id, "assistant", OLLAMA_OFFLINE_FALLBACK)
        
        return ChatResponse(reply=OLLAMA_OFFLINE_FALLBACK, session_id=req.session_id, model=req.model, sources=[])

    db_service.create_session(req.session_id, model=req.model, language=req.language)
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

    logger.info(
        "chat_completed route=/chat session=%s model=%s reply_chars=%d sources=%d",
        req.session_id, req.model, len(reply or ""), len(sources),
    )

    return ChatResponse(reply=reply, session_id=req.session_id, model=req.model, sources=sources)


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    """Streaming chat — returns Server-Sent Events."""
    logger.info(
        "chat_request route=/chat/stream stream=true session=%s model=%s language=%s "
        "use_documents=%s resume_offset=%d prompt_chars=%d",
        req.session_id, req.model, req.language, req.use_documents,
        req.resume_offset or 0, len(req.message or ""),
    )
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

    db_service.create_session(req.session_id, model=req.model, language=req.language)
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


@router.post("/cancel/{session_id}")
async def cancel_stream(session_id: str):
    """Explicitly cancels an active stream."""
    buffer = ACTIVE_STREAMS.get(session_id)
    if buffer and not buffer.completed:
        buffer.cancelled = True
        return {"status": "cancelled"}
    return {"status": "not_found_or_completed"}

@router.delete("/session/{session_id}")
async def api_delete_session(session_id: str):
    """Deletes a chat session from the database and removes all associated local export files."""
    try:
        # 1. Trigger the database deletion
        if hasattr(db_service, "delete_session"):
            db_service.delete_session(session_id)
        elif hasattr(db_service, "clear_session"):
            db_service.clear_session(session_id)
        else:
            logger.warning("No delete function found on db_service")

        # 2. Scan and remove orphaned export files matching the session_id
        deleted_files_count = 0
        if EXPORT_DIR.exists() and EXPORT_DIR.is_dir():
            for file_path in EXPORT_DIR.iterdir():
                # Checks if the file name contains our session identity string
                if session_id in file_path.name:
                    try:
                        file_path.unlink()  # Deletes the file off the disk
                        logger.info("Removed orphaned export file: %s", file_path.name)
                        deleted_files_count += 1
                    except Exception as file_err:
                        logger.error("Failed to delete file %s: %s", file_path.name, str(file_err))

        return {
            "success": True, 
            "session_id": session_id, 
            "orphaned_files_cleaned": deleted_files_count
        }

    except Exception as e:
        logger.error("Failed to delete session %s: %s", session_id, str(e))
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")



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
