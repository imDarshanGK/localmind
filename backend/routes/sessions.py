"""Sessions routes — /api/sessions — full CRUD"""

import os
import shutil
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
    session = db_service.create_session(sid, title=body.title, model=body.model, language=body.language)
    return session

@router.patch("/bulk-rename")
async def bulk_rename_sessions(body: BulkSessionRenameRequest):
    try:
        updated_count = 0
        missing_sessions = []
        
        for item in body.sessions:
            # 1. Strict Session Handling: Check if it actually exists in the DB
            current_session = db_service.get_session(item.session_id)
            
            if not current_session:
                # Track the missing session instead of using an unsafe fallback model
                missing_sessions.append(item.session_id)
                continue
                
            # 2. Safe Update: Use the verified existing model configuration
            db_service.update_session(
                session_id=item.session_id, 
                title=item.new_title, 
                model=current_session.get("model")
            )
            # 3. Correct Success Count: Only increment if the database update actually fired
            updated_count += 1
            
        # If some requested sessions weren't found, alert the client transparently
        if missing_sessions:
            return {
                "status": "partial_success",
                "message": f"Successfully renamed {updated_count} sessions. {len(missing_sessions)} session(s) were not found.",
                "missing_session_ids": missing_sessions
            }
        
        return {
            "status": "success", 
            "message": f"Successfully processed all {updated_count} session updates."
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Bulk rename failed: {str(e)}"
        )
    
    
@router.get("/{session_id}")
async def get_session(session_id: str):
    s = db_service.get_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s

@router.post("/{session_id}/clone")
async def clone_session(session_id: str):
    s = db_service.get_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    new_id = str(uuid.uuid4())
    db_service.create_session(new_id, title=f"{s['title']} (Copy)", model=s["model"], language=s.get("language", "en"))
    messages = db_service.get_messages_full(session_id)
    for msg in messages:
        db_service.save_message(
            new_id,
            msg["role"],
            msg["content"],
            msg["sources"]
        )
    return db_service.get_session(new_id)

@router.patch("/{session_id}")
async def update_session(session_id: str, body: SessionUpdate):
    db_service.update_session(session_id, title=body.title, model=body.model, language=body.language)
    return db_service.get_session(session_id)


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    db_service.delete_session(session_id)
    try:
        from services import rag_service

        rag_service.delete_session_index(session_id)
    except Exception:
        pass
        
    upload_dir = f"./data/uploads/{session_id}"
    if os.path.exists(upload_dir):
        try:
            shutil.rmtree(upload_dir)
        except Exception:
            # Continue even if directory deletion fails (e.g. file lock)
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


@router.delete("/{session_id}/messages/{message_id}")
async def delete_message(session_id: str, message_id: int):
    deleted = db_service.delete_message(session_id, message_id)
    if not deleted:
        raise HTTPException(404, "Message not found")
    return {"status": "deleted", "session_id": session_id, "message_id": message_id}


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


@router.delete("/")
async def clear_all_sessions():
    db_service.clear_all_sessions()
    return {"message": "All sessions cleared"}

