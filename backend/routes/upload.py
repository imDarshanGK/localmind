"""Upload routes — /api/upload"""

import os
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from models.schemas import UploadResponse
from services import db_service

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
async def upload(file: UploadFile = File(...), session_id: str = Form(...)):
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

    from services import rag_service

    chunks  = rag_service.index_document(file_path, session_id)

    db_service.create_session(session_id)
    db_service.save_document(session_id, file.filename, file_path, chunks, size_kb)

    return UploadResponse(
        filename=file.filename,
        status="success",
        chunks_indexed=chunks,
        message=f"'{file.filename}' indexed — {chunks} chunks ready for Q&A.",
        file_size_kb=size_kb,
    )


@router.delete("/{doc_id}")
async def delete_document(doc_id: int):
    db_service.delete_document(doc_id)
    return {"status": "deleted", "doc_id": doc_id}


# --- Issue #265: Fetch Read-Only Document Preview Endpoint ---
@router.get("/preview")
async def preview_document(filename: str = Query(...), session_id: str = Query(...)):
    file_path = os.path.join(".", "data", "uploads", session_id, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Document storage path not found.")
        
    ext = Path(filename).suffix.lower()
    
    try:
        # If it's a standard clear-text format file layout, parse it cleanly
        if ext in [".txt", ".md", ".csv", ".html"]:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(50000) # Capped at 50k characters for UI fast loading optimization
            return {"content": content}
            
        # For non-trivial binary sets (PDFs/DOCX), offer a safe notice for version 1
        else:
            return {
                "content": f"[Binary Formatter Notice]\nPreviews for '{ext}' files are natively processed. Content indexed safely for Chat retrieval contexts."
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file contents: {str(e)}")