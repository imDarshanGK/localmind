"""Sessions routes — /api/sessions — full CRUD"""

import uuid
from fastapi import APIRouter, HTTPException
from models.schemas import SessionCreate, SessionUpdate, BulkSessionRenameRequest
from services import db_service
# from backend.models.schemas import BulkSessionRenameRequest  # Adjust if other items are imported from here

router = APIRouter()


@router.get("/")
async def list_sessions():
    return db_service.get_all_sessions()


@router.post("/")
async def create_session(body: SessionCreate):
    sid = str(uuid.uuid4())
    session = db_service.create_session(sid, title=body.title, model=body.model)
    return session


@router.get("/{session_id}")
async def get_session(session_id: str):
    s = db_service.get_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.patch("/{session_id}")
async def update_session(session_id: str, body: SessionUpdate):
    db_service.update_session(session_id, title=body.title, model=body.model)
    return db_service.get_session(session_id)


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    db_service.delete_session(session_id)
    try:
        from services import rag_service

        rag_service.delete_session_index(session_id)
    except Exception:
        pass
    return {"status": "deleted", "session_id": session_id}


@router.get("/{session_id}/messages")
async def get_messages(session_id: str):
    messages = db_service.get_messages_full(session_id)
    return {"session_id": session_id, "messages": messages, "count": len(messages)}


@router.delete("/{session_id}/messages")
async def clear_messages(session_id: str):
    db_service.clear_messages(session_id)
    return {"status": "cleared"}


@router.get("/{session_id}/documents")
async def get_documents(session_id: str):
    docs = db_service.get_documents(session_id)
    return {"session_id": session_id, "documents": docs}


@router.get("/{session_id}/rag-stats")
async def rag_stats(session_id: str):
    try:
        from services import rag_service

        count = rag_service.get_indexed_count(session_id)
    except Exception:
        count = 0
    return {"session_id": session_id, "indexed_chunks": count}


@router.patch("/bulk-rename")
async def bulk_rename_sessions(body: BulkSessionRenameRequest):
    try:
        # Loop through each session block in the request payload body
        for item in body.sessions:
            # We fetch the current session to preserve its model configuration while updating the title
            current_session = db_service.get_session(item.session_id)
            if current_session:
                # Use the project's native db_service wrapper to update the record safely
                db_service.update_session(
                    session_id=item.session_id, 
                    title=item.new_title, 
                    model=current_session.get("model")  # Keeps the existing model value intact
                )
        
        return {"status": "success", "message": f"Successfully renamed {len(body.sessions)} sessions."}
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Bulk rename failed: {str(e)}"
        )