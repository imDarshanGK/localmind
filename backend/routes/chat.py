"""Chat routes — /api/chat — supports normal + streaming"""
import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json
from models.schemas import ChatRequest, ChatResponse
from services import ollama_service, db_service

router = APIRouter()

# Security constants
MAX_MESSAGE_LENGTH = 2000
MIN_MESSAGE_LENGTH = 1
ALLOWED_MODELS = ["llama2", "llama3", "mistral", "phi", "gemma", "tinyllama"]

def validate_chat_input(req: ChatRequest):
    """
    Validates chat request input before processing.
    Prevents empty messages, excessively long inputs,
    and invalid model selection.
    """
    # Check message length
    if not req.message or len(req.message.strip()) < MIN_MESSAGE_LENGTH:
        raise HTTPException(400, "Message cannot be empty.")
    
    if len(req.message) > MAX_MESSAGE_LENGTH:
        raise HTTPException(400, f"Message too long. Maximum {MAX_MESSAGE_LENGTH} characters allowed.")
    
    # Check for null bytes or control characters
    if '\x00' in req.message:
        raise HTTPException(400, "Message contains invalid characters.")
    
    # Validate temperature range
    if req.temperature is not None:
        if req.temperature < 0.0 or req.temperature > 2.0:
            raise HTTPException(400, "Temperature must be between 0.0 and 2.0.")
    
    # Sanitize session_id
    if req.session_id and not req.session_id.replace("-", "").isalnum():
        raise HTTPException(400, "Invalid session ID format.")


@router.post("/", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Standard (non-streaming) chat endpoint."""
    
    # Input validation added for security
    validate_chat_input(req)
    
    if not await ollama_service.is_ollama_running():
        raise HTTPException(503, "Ollama not running. Run: `ollama serve`")

    db_service.create_session(req.session_id, model=req.model)
    history = db_service.get_history(req.session_id)
    context, sources = "", []

    if req.use_documents:
        from services import rag_service
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
    
    # Input validation added for security
    validate_chat_input(req)
    
    if not await ollama_service.is_ollama_running():
        raise HTTPException(503, "Ollama not running. Run: `ollama serve`")

    db_service.create_session(req.session_id, model=req.model)
    history = db_service.get_history(req.session_id)
    context, sources = "", []

    if req.use_documents:
        from services import rag_service
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
