"""Upload routes — /api/upload"""

import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from models.schemas import UploadResponse
from services import rag_service, db_service

router = APIRouter()

ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    session_id: str = Form(...),
):
    """Upload a document and index it for RAG."""

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: PDF, TXT, CSV, DOCX",
        )

    # Save file locally
    upload_dir = f"./data/uploads/{session_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as f:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 50MB)")
        f.write(content)

    # Index document into ChromaDB
    chunks = rag_service.index_document(file_path, session_id)

    # Save record in DB
    db_service.create_session(session_id)
    db_service.save_document(session_id, file.filename, file_path, chunks)

    return UploadResponse(
        filename=file.filename,
        status="success",
        chunks_indexed=chunks,
        message=f"Document indexed successfully! {chunks} chunks ready for Q&A.",
    )


@router.get("/{session_id}/documents")
async def list_documents(session_id: str):
    """List documents uploaded to a session."""
    upload_dir = f"./data/uploads/{session_id}"
    if not os.path.exists(upload_dir):
        return {"documents": []}
    files = os.listdir(upload_dir)
    return {"session_id": session_id, "documents": files}
