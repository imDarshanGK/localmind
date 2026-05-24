"""
RAG Service v2 — LangChain + ChromaDB + sentence-transformers.

This module turns uploaded files into searchable vector indexes and later
retrieves the most relevant chunks for a user question.

Example:
    >>> chunks_indexed = index_document("notes.pdf", session_id="abc123")
    >>> context, sources = retrieve_context("What are the key ideas?", "abc123")
    >>> delete_session_index("abc123")

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
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

CHROMA_PATH = os.getenv("CHROMADB_DIR", "./data/chromadb")
EMBED_MODEL  = "all-MiniLM-L6-v2"

os.makedirs(CHROMA_PATH, exist_ok=True)

chroma_client = chromadb.PersistentClient(
    path=CHROMA_PATH,
    settings=Settings(anonymized_telemetry=False),
)
embedder = SentenceTransformer(EMBED_MODEL)

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
    """Return the Chroma collection that stores vectors for a chat session.

    Args:
        session_id (str): Unique chat session identifier.

    Returns:
        chromadb.api.models.Collection.Collection: Existing or newly created
        Chroma collection using cosine distance.
    """
    return chroma_client.get_or_create_collection(
        name=f"lm_{session_id.replace('-', '_')}",
        metadata={"hnsw:space": "cosine"},
    )


def index_document(file_path: str, session_id: str) -> int:
    """Load, chunk, embed, and store an uploaded document for RAG lookup.

    Args:
        file_path (str): Path to the document that should be indexed.
        session_id (str): Chat session that owns the document index.

    Returns:
        int: Number of text chunks stored in ChromaDB.

    Raises:
        ValueError: If the file extension does not have a configured loader.
    """
    ext = Path(file_path).suffix.lower()
    loader_cls = LOADERS.get(ext)
    if not loader_cls:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {list(LOADERS)}")

    # Load the source file into LangChain Document objects, then split long
    # content into overlapping chunks so retrieval can return focused context.
    docs   = loader_cls(file_path).load()
    chunks = SPLITTER.split_documents(docs)
    if not chunks:
        return 0

    # Convert each chunk to a vector embedding. Chroma stores the raw text,
    # vector, and lightweight metadata together for later similarity search.
    texts      = [c.page_content for c in chunks]
    embeddings = embedder.encode(texts, show_progress_bar=False).tolist()
    ids        = [f"{session_id}_{i}" for i in range(len(texts))]
    metadatas  = [{"source": Path(file_path).name, "chunk": i} for i in range(len(texts))]

    # Upsert makes repeated indexing idempotent for the same session/chunk IDs.
    col = _collection(session_id)
    col.upsert(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
    logger.info(f"Indexed {len(chunks)} chunks for session={session_id}")
    return len(chunks)


def retrieve_context(query: str, session_id: str, top_k: int = 4) -> tuple[str, list[str]]:
    """Retrieve the most relevant indexed chunks for a user query.

    Args:
        query (str): User question to match against indexed document chunks.
        session_id (str): Chat session whose collection should be searched.
        top_k (int): Maximum number of chunks to retrieve.

    Returns:
        tuple[str, list[str]]: A context string assembled from matching chunks
        and a de-duplicated list of source filenames.
    """
    col = _collection(session_id)
    if col.count() == 0:
        return "", []

    # Embed the query with the same model used for document chunks, then ask
    # Chroma for the nearest vectors in the session-specific collection.
    q_emb   = embedder.encode([query]).tolist()
    results = col.query(
        query_embeddings=q_emb,
        n_results=min(top_k, col.count()),
        include=["documents", "metadatas"],
    )

    docs  = results["documents"][0] if results["documents"] else []
    metas = results["metadatas"][0]  if results["metadatas"] else []

    # Separate chunks with a visible delimiter so the LLM can distinguish
    # independent excerpts, and report which files contributed context.
    context = "\n\n---\n\n".join(docs)
    sources = list({m.get("source", "unknown") for m in metas})
    return context, sources


def delete_session_index(session_id: str):
    """Remove all vectors for a chat session.

    Args:
        session_id (str): Chat session whose collection should be deleted.

    Returns:
        None
    """
    try:
        chroma_client.delete_collection(f"lm_{session_id.replace('-', '_')}")
    except Exception:
        pass


def get_indexed_count(session_id: str) -> int:
    """Return the number of indexed chunks for a chat session.

    Args:
        session_id (str): Chat session whose collection should be counted.

    Returns:
        int: Number of vectors currently stored for the session.
    """
    return _collection(session_id).count()
