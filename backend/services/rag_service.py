"""
RAG (Retrieval-Augmented Generation) Service
Handles document indexing and semantic search using ChromaDB + sentence-transformers
"""

import os
import logging
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    CSVLoader,
    Docx2txtLoader,
)
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

CHROMA_DB_PATH = "./data/chromadb"
UPLOADS_PATH = "./data/uploads"
EMBED_MODEL = "all-MiniLM-L6-v2"  # fast, local, no API needed

os.makedirs(CHROMA_DB_PATH, exist_ok=True)
os.makedirs(UPLOADS_PATH, exist_ok=True)

# Initialize ChromaDB (fully local)
chroma_client = chromadb.PersistentClient(
    path=CHROMA_DB_PATH,
    settings=Settings(anonymized_telemetry=False),
)

# Local embedding model — no internet needed
embedder = SentenceTransformer(EMBED_MODEL)


def get_collection(session_id: str):
    """Get or create a ChromaDB collection per session."""
    return chroma_client.get_or_create_collection(
        name=f"session_{session_id}",
        metadata={"hnsw:space": "cosine"},
    )


def load_document(file_path: str) -> list:
    """Load document based on file extension."""
    ext = Path(file_path).suffix.lower()
    loaders = {
        ".pdf": PyPDFLoader,
        ".txt": TextLoader,
        ".csv": CSVLoader,
        ".docx": Docx2txtLoader,
    }
    loader_class = loaders.get(ext)
    if not loader_class:
        raise ValueError(f"Unsupported file type: {ext}")

    loader = loader_class(file_path)
    return loader.load()


def index_document(file_path: str, session_id: str) -> int:
    """
    Split document into chunks and store in ChromaDB.
    Returns number of chunks indexed.
    """
    logger.info(f"Indexing document: {file_path} for session: {session_id}")

    docs = load_document(file_path)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        separators=["\n\n", "\n", ".", " "],
    )
    chunks = splitter.split_documents(docs)

    if not chunks:
        return 0

    texts = [chunk.page_content for chunk in chunks]
    embeddings = embedder.encode(texts).tolist()
    ids = [f"{session_id}_{i}" for i in range(len(texts))]
    metadatas = [
        {"source": file_path, "chunk": i} for i in range(len(texts))
    ]

    collection = get_collection(session_id)
    collection.upsert(
        ids=ids,
        documents=texts,
        embeddings=embeddings,
        metadatas=metadatas,
    )

    logger.info(f"Indexed {len(chunks)} chunks for session {session_id}")
    return len(chunks)


def retrieve_context(query: str, session_id: str, top_k: int = 4) -> tuple[str, list[str]]:
    """
    Retrieve relevant document chunks for a query.
    Returns (context_text, list_of_sources)
    """
    collection = get_collection(session_id)

    if collection.count() == 0:
        return "", []

    query_embedding = embedder.encode([query]).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas"],
    )

    documents = results["documents"][0] if results["documents"] else []
    metadatas = results["metadatas"][0] if results["metadatas"] else []

    context = "\n\n---\n\n".join(documents)
    sources = list({m.get("source", "unknown") for m in metadatas})

    return context, sources
