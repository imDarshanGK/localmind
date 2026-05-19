"""Chat routes — /api/chat"""

import uuid
from fastapi import APIRouter, HTTPException

from models.schemas import ChatRequest, ChatResponse
from services import rag_service, ollama_service, db_service

router = APIRouter()


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Send a message and get an AI reply (with optional RAG)."""

    if not await ollama_service.is_ollama_running():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running. Please start Ollama first: `ollama serve`",
        )

    # Ensure session exists
    db_service.create_session(request.session_id, request.model)

    # Get chat history for context
    history = db_service.get_history(request.session_id)

    # Retrieve document context if RAG is enabled
    context, sources = "", []
    if request.use_documents:
        context, sources = rag_service.retrieve_context(
            query=request.message,
            session_id=request.session_id,
        )

    # Save user message
    db_service.save_message(request.session_id, "user", request.message)

    # Get AI reply from Ollama
    reply = await ollama_service.chat(
        message=request.message,
        model=request.model,
        context=context,
        history=history,
    )

    # Save assistant reply
    db_service.save_message(request.session_id, "assistant", reply, sources)

    return ChatResponse(
        reply=reply,
        session_id=request.session_id,
        model=request.model,
        sources=sources,
    )


@router.get("/sessions")
async def list_sessions():
    """List all chat sessions."""
    return db_service.get_all_sessions()


@router.get("/sessions/{session_id}/history")
async def get_history(session_id: str):
    """Get chat history for a session."""
    history = db_service.get_history(session_id, limit=100)
    return {"session_id": session_id, "messages": history}


@router.post("/sessions/new")
async def new_session():
    """Create a new chat session."""
    session_id = str(uuid.uuid4())
    session = db_service.create_session(session_id)
    return session
