"""
RAG Service v2 — LangChain + ChromaDB + sentence-transformers
Supports: PDF, TXT, CSV, DOCX, MD, HTML
"""

import os
import logging
from pathlib import Path
import chromadb
from chromadb.config import Settings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    PyPDFLoader, TextLoader, CSVLoader, Docx2txtLoader, UnstructuredHTMLLoader,
)
from services.embeddings import get_embedding_provider

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
    ".docx": Docx2txtLoader,
    ".html": UnstructuredHTMLLoader,
}

SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=600,
    chunk_overlap=80,
    separators=["\n\n", "\n", ". ", " "],
)


def _collection(session_id: str):
    return chroma_client.get_or_create_collection(
        name=f"lm_{session_id.replace('-', '_')}",
        metadata={"hnsw:space": "cosine"},
    )


def index_document(file_path: str, session_id: str) -> int:
    ext = Path(file_path).suffix.lower()
    loader_cls = LOADERS.get(ext)
    if not loader_cls:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {list(LOADERS)}")

    docs   = loader_cls(file_path).load()
    chunks = SPLITTER.split_documents(docs)
    if not chunks:
        return 0

    texts      = [c.page_content for c in chunks]
    provider   = get_embedding_provider()
    embeddings = provider.embed_documents(texts)
    ids        = [f"{session_id}_{i}" for i in range(len(texts))]
    metadatas  = [{"source": Path(file_path).name, "chunk": i} for i in range(len(texts))]

    col = _collection(session_id)
    col.upsert(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
    logger.info(f"Indexed {len(chunks)} chunks for session={session_id}")
    return len(chunks)


def retrieve_context(query: str, session_id: str, top_k: int = 4) -> tuple[str, list[str]]:
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
    sources = list({m.get("source", "unknown") for m in metas})
    return context, sources


def delete_session_index(session_id: str):
    """Remove all vectors for a session."""
    try:
        chroma_client.delete_collection(f"lm_{session_id.replace('-', '_')}")
    except Exception:
        pass


def get_indexed_count(session_id: str) -> int:
    return _collection(session_id).count()
