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
    """Get or create a ChromaDB collection for the given session.
    
    Each session gets its own collection, keyed by a sanitized session ID.
    Collections use cosine distance for similarity search.
    """
    return chroma_client.get_or_create_collection(
        name=f"lm_{session_id.replace('-', '_')}",
        metadata={"hnsw:space": "cosine"},
    )


def index_document(file_path: str, session_id: str) -> int:
    """Index a document into the RAG pipeline.
    
    Steps:
    1. Load the document using the appropriate loader for its file type
    2. Split the document into overlapping text chunks
    3. Generate embeddings for each chunk using sentence-transformers
    4. Store chunks, embeddings, and metadata in ChromaDB
    
    Returns the number of chunks indexed.
    """
    # Step 1: Select the right document loader based on file extension
    ext = Path(file_path).suffix.lower()
    loader_cls = LOADERS.get(ext)
    if not loader_cls:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {list(LOADERS)}")

    # Step 1b: Load the document into LangChain Document objects
    docs   = loader_cls(file_path).load()
    # Step 2: Split the document into overlapping chunks for better retrieval
    chunks = SPLITTER.split_documents(docs)
    if not chunks:
        return 0

    # Step 3: Extract text from chunks and generate embeddings
    texts      = [c.page_content for c in chunks]
    # Generate dense vector embeddings using sentence-transformers (all-MiniLM-L6-v2)
    embeddings = embedder.encode(texts, show_progress_bar=False).tolist()
    # Step 4: Store everything in ChromaDB for similarity search
    ids        = [f"{session_id}_{i}" for i in range(len(texts))]
    metadatas  = [{"source": Path(file_path).name, "chunk": i} for i in range(len(texts))]

    col = _collection(session_id)
    # Upsert: add new chunks or update existing ones in the collection
    col.upsert(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
    logger.info(f"Indexed {len(chunks)} chunks for session={session_id}")
    return len(chunks)


def retrieve_context(query: str, session_id: str, top_k: int = 4) -> tuple[str, list[str]]:
    col = _collection(session_id)
    if col.count() == 0:
        return "", []

    q_emb   = embedder.encode([query]).tolist()
    # Step 2: Query ChromaDB for the most similar chunks
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
