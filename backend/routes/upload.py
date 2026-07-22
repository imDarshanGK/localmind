"""Upload routes — /api/upload"""
import os
import time
import traceback
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query, BackgroundTasks
from models.schemas import UploadResponse
import logging
from services import db_service
from utils import audit_log

logger = logging.getLogger(__name__)


def _safe_audit(fn, **kwargs):
    """Extra call-site guard around audit_log hooks (Issue #797)."""
    try:
        fn(**kwargs)
    except Exception as e:
        logger.warning("audit_hook_failed hook=%s error=%s", getattr(fn, "__name__", fn), e)


router = APIRouter()

ALLOWED = {
    ".txt", ".md", ".pdf", ".docx", ".doc", ".html",
    ".htm", ".csv", ".json", ".xml", ".rtf", ".odt",
    ".epub", ".log", ".tsv", ".ini", ".cfg", ".yaml", ".yml"
}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/", response_model=UploadResponse)
async def upload(file: UploadFile = File(...), session_id: str = Form(...), background_tasks: BackgroundTasks = None):
    logger.info("upload_request route=/upload session=%s file=%s", session_id, file.filename)
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED:
        logger.warning("upload_rejected reason=unsupported_type ext=%s file=%s", ext, file.filename)
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed.")
    
    content = await file.read()
    if len(content) > MAX_BYTES:
        logger.warning("upload_rejected reason=file_too_large size_bytes=%s limit=%s", len(content), MAX_BYTES)
        raise HTTPException(status_code=413, detail="File too large (max 50MB).")
    
    file_path = UPLOAD_DIR / f"{session_id}_{file.filename}"
    file_path.write_bytes(content)
    size_kb = max(1, len(content) // 1024)
    
    # Restored original repository database calls:
    db_service.create_session(session_id)
    doc_id = db_service.save_document(session_id, file.filename, str(file_path), 0, size_kb, status="queued")
    
    logger.info(
        "document_queued route=/upload session=%s file=%s doc_id=%s size_kb=%s",
        session_id, file.filename, doc_id, size_kb,
    )

    # --- Issue #797: structured audit log — UPLOAD_QUEUED ---
    _safe_audit(
        audit_log.log_upload_queued,
        file_id=doc_id,
        file_size_bytes=len(content),
        user_id=session_id,  # no auth system yet; session_id stands in for user_id
    )

    if background_tasks:
        background_tasks.add_task(process_document_task, str(file_path), session_id, doc_id)
    else:
        process_document_task(str(file_path), session_id, doc_id)
        
    # Fixed Pydantic validation schema matching:
    return UploadResponse(
        doc_id=doc_id,
        filename=file.filename,
        file_size_kb=size_kb,
        chunks_indexed=0,
        status="queued",
        message=f"'{file.filename}' uploaded and processing started."
    )


def process_document_task(file_path: str, session_id: str, doc_id: int):
    start = time.perf_counter()

    # --- Issue #797: structured audit log — PROCESSING ---
    _safe_audit(audit_log.log_processing, file_id=doc_id, user_id=session_id)

    try:
        from services import rag_service
        db_service.update_document_status(doc_id, "processing")
        chunks = rag_service.index_document(file_path, session_id, doc_id=doc_id)
        # Restored original status completion name ("completed"):
        db_service.update_document_status(doc_id, "completed", chunks_indexed=chunks)
        
        logger.info(
            "document_indexed route=/upload session=%s doc_id=%s chunks=%s",
            session_id, doc_id, chunks,
        )

        # --- Issue #797: structured audit log — SUCCESS ---
        duration_ms = (time.perf_counter() - start) * 1000
        _safe_audit(
            audit_log.log_success,
            file_id=doc_id,
            user_id=session_id,
            duration_ms=duration_ms,
        )
    except Exception as e:
        logger.error(
            "document_failed route=/upload session=%s doc_id=%s error=%s",
            session_id, doc_id, e,
        )

        # --- Issue #797: structured audit log — FAILED ---
        duration_ms = (time.perf_counter() - start) * 1000
        _safe_audit(
            audit_log.log_failed,
            file_id=doc_id,
            user_id=session_id,
            duration_ms=duration_ms,
            error=str(e),
            stack_trace=traceback.format_exc(),
        )

        db_service.update_document_status(doc_id, "failed")


@router.get("/", response_model=list)
async def list_documents(session_id: str = Query(...)):
    return db_service.get_documents(session_id)


@router.delete("/{doc_id}")
async def delete_document(doc_id: int, session_id: str = Query(...)):
    doc = db_service.get_document_by_id(doc_id)
    if not doc or doc.get("session_id") != session_id:
        raise HTTPException(status_code=404, detail="Document not found.")
    
    file_path = doc.get("file_path", "")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError as e:
            logger.warning("file_delete_failed path=%s error=%s", file_path, e)
            
    db_service.delete_document(doc_id)
    return {"status": "success", "message": f"Document #{doc_id} deleted."}