"""
RAG Service v2 — LangChain + ChromaDB + sentence-transformers
Supports: PDF, TXT, CSV, DOCX, MD, HTML, SRT, VTT
"""

import os
import logging
import time
from pathlib import Path
import chromadb
from chromadb.config import Settings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    UnstructuredHTMLLoader,
)
from services.csv_loader import CleanCSVLoader
from services.docx_loader import DocxWithTablesLoader
from sentence_transformers import SentenceTransformer

from services.citation_utils import build_sources

logger = logging.getLogger(__name__)

CHROMA_PATH = os.getenv("CHROMADB_DIR", "./data/chromadb")
EMBED_MODEL = "all-MiniLM-L6-v2"

os.makedirs(CHROMA_PATH, exist_ok=True)

chroma_client = chromadb.PersistentClient(
    path=CHROMA_PATH,
    settings=Settings(anonymized_telemetry=False),
)
embedder = SentenceTransformer(EMBED_MODEL)

LOADERS = {
    ".pdf": PyPDFLoader,
    ".txt": TextLoader,
    ".md": TextLoader,
    ".csv": CleanCSVLoader,
    ".docx": DocxWithTablesLoader,
    ".html": UnstructuredHTMLLoader,
    ".srt": TextLoader,  # Handle SubRip video/audio transcripts natively
    ".vtt": TextLoader,  # Handle WebVTT audio transcripts natively
}


def _collection(session_id: str):
    return chroma_client.get_or_create_collection(
        name=f"lm_{session_id.replace('-', '_')}",
        metadata={"hnsw:space": "cosine"},
    )


def index_document(file_path: str, session_id: str, doc_id: int = None) -> int:
    ext = Path(file_path).suffix.lower()
    loader_cls = LOADERS.get(ext)
    if not loader_cls:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {list(LOADERS)}")

    docs = loader_cls(file_path).load()

    # Fetch live chunking configuration directly from database cache settings.
    # Both `rag_chunk_size` (target characters per chunk) and
    # `rag_chunk_overlap` (sliding-window overlap to preserve context at
    # boundaries) are tunable via `/api/settings` and validated in
    # `routes/settings.py` (issue #932).
    from services.db_service import get_settings

    current_settings = get_settings()
    overlap_val = current_settings.get("rag_chunk_overlap", 50)
    chunk_size_val = current_settings.get("rag_chunk_size", 600)

    # Sanity-clamp the live values to the same bounds the API route enforces
    # so a stale/legacy database row can't crash the splitter.
    try:
        chunk_size_val = int(chunk_size_val)
    except (TypeError, ValueError):
        chunk_size_val = 600
    if not 200 <= chunk_size_val <= 2000:
        chunk_size_val = 600

    try:
        overlap_val = int(overlap_val)
    except (TypeError, ValueError):
        overlap_val = 50
    if not 0 <= overlap_val <= 200:
        overlap_val = 50
    if overlap_val >= chunk_size_val:
        # Defensive: avoid zero-progress splitter windows if a legacy DB row
        # stored an overlap that was equal to or larger than the chunk size.
        overlap_val = max(0, chunk_size_val // 10)

    # Initialize a clean dynamic splitter configured to the user's current settings preference
    dynamic_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size_val,
        chunk_overlap=overlap_val,
        separators=["\n\n", "\n", ". ", " "],
    )

    chunks = dynamic_splitter.split_documents(docs)
    if not chunks:
        return 0

    texts = [c.page_content for c in chunks]
    ids = [f"{session_id}_{i}" for i in range(len(texts))]
    metadatas = [
        {"source": Path(file_path).name, "chunk": i} for i in range(len(texts))
    ]

    col = _collection(session_id)

    batch_size = 200
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i : i + batch_size]
        batch_ids = ids[i : i + batch_size]
        batch_metas = metadatas[i : i + batch_size]

        batch_embeddings = embedder.encode(
            batch_texts, show_progress_bar=False
        ).tolist()
        col.upsert(
            ids=batch_ids,
            documents=batch_texts,
            embeddings=batch_embeddings,
            metadatas=batch_metas,
        )
        if doc_id is not None:
            from services import db_service

            db_service.update_document_status(
                doc_id, "processing", chunks_indexed=(i + len(batch_texts))
            )
        time.sleep(0.05)  # Yield GIL to allow event loop to process other requests

    logger.info(
        "Indexed %d chunks for session=%s using chunk_size=%d chunk_overlap=%d",
        len(chunks),
        session_id,
        chunk_size_val,
        overlap_val,
    )
    return len(chunks)


def retrieve_context(
    query: str, session_id: str, top_k: int = 4
) -> tuple[str, list[dict]]:
    col = _collection(session_id)
    if col.count() == 0:
        return "", []

    q_emb = embedder.encode([query]).tolist()
    results = col.query(
        query_embeddings=q_emb,
        n_results=min(top_k, col.count()),
        include=["documents", "metadatas"],
    )

    docs = results["documents"][0] if results["documents"] else []
    metas = results["metadatas"][0] if results["metadatas"] else []

    context = "\n\n---\n\n".join(docs)

    # Build structured source list: one entry per unique (filename, chunk) pair,
    # preserving a short preview of the retrieved text for inline citation display.
    sources = build_sources(docs, metas)
    return context, sources


def delete_session_index(session_id: str):
    """Remove all vectors for a session."""
    try:
        chroma_client.delete_collection(f"lm_{session_id.replace('-', '_')}")
    except Exception:
        pass


def get_indexed_count(session_id: str) -> int:
    return _collection(session_id).count()
