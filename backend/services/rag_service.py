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
    PyPDFLoader, TextLoader, CSVLoader, UnstructuredHTMLLoader,
)
from services.docx_loader import DocxWithTablesLoader
from services.embeddings import get_embedding_provider

from services.citation_utils import build_sources

logger = logging.getLogger(__name__)

CHROMA_PATH = os.getenv("CHROMADB_DIR", "./data/chromadb")

os.makedirs(CHROMA_PATH, exist_ok=True)

chroma_client = chromadb.PersistentClient(
    path=CHROMA_PATH,
    settings=Settings(anonymized_telemetry=False),
)

LOADERS = {
    ".pdf":  PyPDFLoader,
    ".txt":  TextLoader,
    ".md":   TextLoader,
    ".csv":  CSVLoader,
    ".docx": DocxWithTablesLoader,
    ".html": UnstructuredHTMLLoader,
    ".srt":  TextLoader,  # Handle SubRip video/audio transcripts natively
    ".vtt":  TextLoader,  # Handle WebVTT audio transcripts natively
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
    
    # Fetch live chunk overlap bounds configuration directly from database cache settings
    from services.db_service import get_settings
    current_settings = get_settings()
    overlap_val = current_settings.get("rag_chunk_overlap", 50)

    # Initialize a clean dynamic splitter configured to the user's current settings preference
    dynamic_splitter = RecursiveCharacterTextSplitter(
        chunk_size=600,
        chunk_overlap=int(overlap_val),
        separators=["\n\n", "\n", ". ", " "],
    )
    
    chunks = dynamic_splitter.split_documents(docs)
    if not chunks:
        return 0

    texts = [c.page_content for c in chunks]
    ids = [f"{session_id}_{i}" for i in range(len(texts))]
    metadatas = [{"source": Path(file_path).name, "chunk": i} for i in range(len(texts))]

    col = _collection(session_id)
    provider = get_embedding_provider()
    
    batch_size = 200
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i + batch_size]
        batch_ids = ids[i:i + batch_size]
        batch_metas = metadatas[i:i + batch_size]
        
        batch_embeddings = provider.embed_documents(batch_texts)
        col.upsert(ids=batch_ids, documents=batch_texts, embeddings=batch_embeddings, metadatas=batch_metas)
        if doc_id is not None:
            from services import db_service
            db_service.update_document_status(doc_id, "processing", chunks_indexed=(i + len(batch_texts)))
        time.sleep(0.05)  # Yield GIL to allow event loop to process other requests

    logger.info(f"Indexed {len(chunks)} chunks for session={session_id} using chunk_overlap={overlap_val}")
    return len(chunks)


def retrieve_context(query: str, session_id: str, top_k: int = 4) -> tuple[str, list[dict]]:
    col = _collection(session_id)
    if col.count() == 0:
        return "", []

    provider = get_embedding_provider()
    q_emb    = [provider.embed_query(query)]
    results = col.query(
        query_embeddings=q_emb,
        n_results=min(top_k, col.count()),
        include=["documents", "metadatas"],
    )

    docs  = results["documents"][0] if results["documents"] else []
    metas = results["metadatas"][0]  if results["metadatas"] else []

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