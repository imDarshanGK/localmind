"""Upload routes — /api/upload"""

import os
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from models.schemas import UploadResponse
import logging
from services import db_service

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "text/markdown": ".md",
    "text/html": ".html",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/", response_model=UploadResponse)
async def upload(file: UploadFile = File(...), session_id: str = Form(...), background_tasks: BackgroundTasks = None):
    # FastAPI dependency injection handles background_tasks automatically when type hinted
    # We use None default for test compatibility if needed, but FastAPI injects it properly.
    content_type = file.content_type or ""
    # Be lenient — also allow by extension
    ext = Path(file.filename).suffix.lower()
    if content_type not in ALLOWED and ext not in ALLOWED.values():
        raise HTTPException(400, "Unsupported file. Allowed: PDF, TXT, CSV, DOCX, MD, HTML")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 50 MB)")

    upload_dir = f"./data/uploads/{session_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as f:
        f.write(content)

    size_kb = round(len(content) / 1024, 1)

    db_service.create_session(session_id)
    doc_id = db_service.save_document(session_id, file.filename, file_path, 0, size_kb, status="queued")

    if background_tasks:
        background_tasks.add_task(process_document_task, doc_id, file_path, session_id)
    else:
        # Fallback if somehow not injected
        process_document_task(doc_id, file_path, session_id)

    return UploadResponse(
        filename=file.filename,
        status="queued",
        chunks_indexed=0,
        message=f"'{file.filename}' queued for background indexing.",
        file_size_kb=size_kb,
    )

def process_document_task(doc_id: int, file_path: str, session_id: str):
    try:
        from services import rag_service
        db_service.update_document_status(doc_id, "processing")
        chunks = rag_service.index_document(file_path, session_id, doc_id=doc_id)
        db_service.update_document_status(doc_id, "completed", chunks_indexed=chunks)
    except Exception as e:
        logger.error(f"Error processing document {doc_id}: {e}")
        db_service.update_document_status(doc_id, "failed")



@router.delete("/{doc_id}")
async def delete_document(doc_id: int):
    db_service.delete_document(doc_id)
    return {"status": "deleted", "doc_id": doc_id}
