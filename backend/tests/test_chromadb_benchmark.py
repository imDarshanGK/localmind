"""
Benchmark for ChromaDB retrieval latency.
"""
import time
import statistics
import uuid
import pytest
import os

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

# ── Setup ─────────────────────────────────────────────────────────────────────

CHROMA_PATH = "./data/chromadb_benchmark_test"
EMBED_MODEL = "all-MiniLM-L6-v2"

os.makedirs(CHROMA_PATH, exist_ok=True)

chroma_client = chromadb.PersistentClient(
    path=CHROMA_PATH,
    settings=Settings(anonymized_telemetry=False),
)
embedder = SentenceTransformer(EMBED_MODEL)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_collection(session_id: str):
    safe_name = f"bench_{session_id}".replace(" ", "_").replace("-", "_")
    return chroma_client.get_or_create_collection(
        name=safe_name,
        metadata={"hnsw:space": "cosine"},
    )

def _seed_collection(session_id: str, num_chunks: int = 50):
    col = _get_collection(session_id)
    texts = [
        f"Synthetic chunk {i} about topic {i % 10} and subtopic {i % 5}."
        for i in range(num_chunks)
    ]
    embeddings = embedder.encode(texts, show_progress_bar=False).tolist()
    ids = [f"{session_id}_{i}" for i in range(num_chunks)]
    metadatas = [{"source": f"doc_{i % 5}.txt", "chunk": i} for i in range(num_chunks)]
    col.upsert(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)


def _retrieve(session_id: str, query: str, top_k: int = 4):
    col = _get_collection(session_id)
    if col.count() == 0:
        return "", []
    q_emb = embedder.encode([query]).tolist()
    results = col.query(
        query_embeddings=q_emb,
        n_results=min(top_k, col.count()),
        include=["documents", "metadatas"],
    )
    docs = results["documents"][0] if results["documents"] else []
    return "\n\n".join(docs), docs


def _measure_latency(session_id: str, query: str, top_k: int = 4, runs: int = 10) -> dict:
    latencies = []
    for _ in range(runs):
        start = time.perf_counter()
        _retrieve(session_id, query, top_k=top_k)
        elapsed = (time.perf_counter() - start) * 1000
        latencies.append(elapsed)
    return {
        "min_ms": round(min(latencies), 3),
        "max_ms": round(max(latencies), 3),
        "mean_ms": round(statistics.mean(latencies), 3),
        "median_ms": round(statistics.median(latencies), 3),
        "stdev_ms": round(statistics.stdev(latencies), 3) if len(latencies) > 1 else 0.0,
        "runs": runs,
    }


def _cleanup(session_id: str):
    try:
        chroma_client.delete_collection(f"bench_{session_id}")
    except Exception:
        pass


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def session_id():
    sid = uuid.uuid4().hex[:8]
    yield sid
    _cleanup(sid)


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestChromaDBRetrievalLatency:
    """Benchmark tests for ChromaDB retrieval latency."""

    def test_single_query_latency(self, session_id):
        """Single retrieval completes within acceptable time."""
        _seed_collection(session_id, num_chunks=50)
        start = time.perf_counter()
        context, docs = _retrieve("document information topic", session_id, top_k=4)
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f"\nSingle query latency: {elapsed_ms:.3f}ms")
        assert elapsed_ms < 5000
        assert isinstance(context, str)

    def test_repeated_query_latency(self, session_id):
        """Average latency over multiple queries is acceptable."""
        _seed_collection(session_id, num_chunks=50)
        stats = _measure_latency(session_id, "synthetic chunk topic", top_k=4, runs=10)
        print(f"\nLatency stats: mean={stats['mean_ms']}ms median={stats['median_ms']}ms stdev={stats['stdev_ms']}ms")
        assert stats["mean_ms"] < 5000
        assert stats["max_ms"] < 10000

    def test_latency_small_collection(self, session_id):
        """Benchmark retrieval on small collection (10 chunks)."""
        _seed_collection(session_id, num_chunks=10)
        stats = _measure_latency(session_id, "topic information", top_k=4, runs=5)
        print(f"\nSmall collection (10 chunks) mean: {stats['mean_ms']}ms")
        assert stats["mean_ms"] < 5000

    def test_latency_large_collection(self, session_id):
        """Benchmark retrieval on large collection (200 chunks)."""
        _seed_collection(session_id, num_chunks=200)
        stats = _measure_latency(session_id, "topic subtopic chunk", top_k=4, runs=5)
        print(f"\nLarge collection (200 chunks) mean: {stats['mean_ms']}ms")
        assert stats["mean_ms"] < 10000

    def test_latency_top_k_variation(self, session_id):
        """Latency with different top_k values."""
        _seed_collection(session_id, num_chunks=100)
        for top_k in [1, 4, 8]:
            stats = _measure_latency(session_id, "document chunk topic", top_k=top_k, runs=5)
            print(f"\ntop_k={top_k} mean: {stats['mean_ms']}ms")
            assert stats["mean_ms"] < 10000

    def test_empty_collection_latency(self, session_id):
        """Retrieval on empty collection is fast."""
        start = time.perf_counter()
        context, docs = _retrieve("any query", session_id, top_k=4)
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f"\nEmpty collection latency: {elapsed_ms:.3f}ms")
        assert elapsed_ms < 1000
        assert context == ""

    def test_latency_consistency(self, session_id):
        """Latency is consistent across runs."""
        _seed_collection(session_id, num_chunks=50)
        stats = _measure_latency(session_id, "information topic chunk", top_k=4, runs=10)
        print(f"\nConsistency stdev: {stats['stdev_ms']}ms")
        assert stats["stdev_ms"] < stats["mean_ms"] * 2


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
