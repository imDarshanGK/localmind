"""
Tests for inline citation previews.

Covers:
- _build_sources() returns structured List[dict] with source/chunk/preview
- Preview is truncated to 300 chars + "..."
- Duplicate (source, chunk) pairs are collapsed to one entry
- ChatMessage.sources accepts both legacy List[str] and new List[dict] (backward compat)
- Chat endpoint returns SourceChunk-shaped objects in its JSON response
"""

import tempfile
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import services.db_service as db
from app import app
from models.schemas import ChatMessage, MessageRole, SourceChunk

# ─── Shared test client ──────────────────────────────────────────
_tmp = tempfile.mktemp(suffix="_citations.db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app)


# ─── _build_sources() pure helper ───────────────────────────────
# Import only the pure helper — no chromadb / sentence_transformers needed.
from services.citation_utils import build_sources  # noqa: E402


class TestBuildSources:
    """Unit-test the pure build_sources() helper in complete isolation."""

    def test_returns_list_of_dicts(self):
        docs = ["Hello world chunk text."]
        metas = [{"source": "file.pdf", "chunk": 0}]
        sources = build_sources(docs, metas)
        assert isinstance(sources, list)
        assert isinstance(sources[0], dict)

    def test_source_dict_has_required_keys(self):
        docs = ["Some retrieved text."]
        metas = [{"source": "notes.txt", "chunk": 3}]
        s = build_sources(docs, metas)[0]
        assert s["source"] == "notes.txt"
        assert s["chunk"] == 3
        assert "preview" in s

    def test_preview_includes_chunk_text(self):
        docs = ["The capital of France is Paris."]
        metas = [{"source": "geo.pdf", "chunk": 1}]
        s = build_sources(docs, metas)[0]
        assert "Paris" in s["preview"]

    def test_preview_truncated_at_300_chars(self):
        long_text = "A" * 400
        docs = [long_text]
        metas = [{"source": "big.txt", "chunk": 0}]
        s = build_sources(docs, metas)[0]
        assert len(s["preview"]) <= 304  # 300 chars + "..."
        assert s["preview"].endswith("...")

    def test_short_text_not_truncated(self):
        short = "Short text."
        docs = [short]
        metas = [{"source": "small.txt", "chunk": 0}]
        s = build_sources(docs, metas)[0]
        assert s["preview"] == short
        assert not s["preview"].endswith("...")

    def test_duplicate_source_chunk_collapsed(self):
        """Two rows with the same (filename, chunk) → one source entry."""
        docs = ["Chunk text A.", "Chunk text A."]
        metas = [
            {"source": "dup.pdf", "chunk": 2},
            {"source": "dup.pdf", "chunk": 2},
        ]
        assert len(build_sources(docs, metas)) == 1

    def test_different_chunks_same_file_kept_separate(self):
        docs = ["First chunk.", "Second chunk."]
        metas = [
            {"source": "report.pdf", "chunk": 0},
            {"source": "report.pdf", "chunk": 1},
        ]
        assert len(build_sources(docs, metas)) == 2

    def test_multiple_files(self):
        docs = ["Alpha.", "Beta."]
        metas = [
            {"source": "a.pdf", "chunk": 0},
            {"source": "b.pdf", "chunk": 0},
        ]
        sources = build_sources(docs, metas)
        names = {s["source"] for s in sources}
        assert names == {"a.pdf", "b.pdf"}

    def test_empty_inputs(self):
        assert build_sources([], []) == []

    def test_missing_metadata_keys_use_defaults(self):
        docs = ["Some text."]
        metas = [{}]  # no "source" or "chunk" keys
        s = build_sources(docs, metas)[0]
        assert s["source"] == "unknown"
        assert s["chunk"] == 0



# ─── Backward compatibility: ChatMessage accepts both shapes ─────

class TestChatMessageBackwardCompat:
    """ChatMessage.sources must accept legacy List[str] and new List[dict]."""

    def test_legacy_string_sources_accepted(self):
        msg = ChatMessage(
            role=MessageRole.assistant,
            content="Answer",
            sources=["report.pdf", "notes.txt"],
        )
        assert len(msg.sources) == 2
        assert all(isinstance(s, SourceChunk) for s in msg.sources)
        assert msg.sources[0].source == "report.pdf"

    def test_structured_dict_sources_accepted(self):
        msg = ChatMessage(
            role=MessageRole.assistant,
            content="Answer",
            sources=[{"source": "report.pdf", "chunk": 0, "preview": "Some text"}],
        )
        assert isinstance(msg.sources[0], SourceChunk)
        assert msg.sources[0].source == "report.pdf"

    def test_empty_sources_accepted(self):
        msg = ChatMessage(role=MessageRole.user, content="Hi")
        assert msg.sources == []

    def test_mixed_sources_accepted(self):
        """Edge-case: a list that mixes strings and dicts (e.g. partial migration)."""
        msg = ChatMessage(
            role=MessageRole.assistant,
            content="Answer",
            sources=["legacy.pdf", {"source": "new.txt", "chunk": 0, "preview": "text"}],
        )
        assert len(msg.sources) == 2


# ─── SourceChunk schema ──────────────────────────────────────────

class TestSourceChunkSchema:
    def test_defaults(self):
        sc = SourceChunk(source="file.pdf")
        assert sc.chunk == 0
        assert sc.preview == ""

    def test_full_construction(self):
        sc = SourceChunk(source="file.pdf", chunk=3, preview="Some extracted text.")
        assert sc.source == "file.pdf"
        assert sc.chunk == 3
        assert sc.preview == "Some extracted text."

    def test_serialization(self):
        sc = SourceChunk(source="doc.pdf", chunk=1, preview="Preview text.")
        d = sc.model_dump()
        assert d == {"source": "doc.pdf", "chunk": 1, "preview": "Preview text."}


# ─── Chat endpoint returns SourceChunk-shaped sources ────────────

@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat", new_callable=AsyncMock, return_value="Here is the answer.")
@patch(
    "routes.chat.rag_service.retrieve_context",
    return_value=(
        "context text",
        [{"source": "doc.pdf", "chunk": 0, "preview": "Relevant excerpt from doc."}],
    ),
)
def test_chat_endpoint_returns_source_chunks(m_rag, m_chat, m_ollama):
    r = client.post("/api/sessions/", json={"title": "Citation Test"})
    sid = r.json()["id"]

    r2 = client.post(
        "/api/chat/",
        json={"message": "What does the doc say?", "session_id": sid, "model": "llama3", "use_documents": True},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert len(data["sources"]) == 1
    src = data["sources"][0]
    assert src["source"] == "doc.pdf"
    assert src["chunk"] == 0
    assert "Relevant excerpt" in src["preview"]


@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat", new_callable=AsyncMock, return_value="No docs needed.")
@patch("routes.chat.rag_service.retrieve_context", return_value=("", []))
def test_chat_endpoint_no_documents_empty_sources(m_rag, m_chat, m_ollama):
    r = client.post("/api/sessions/", json={"title": "No Doc Test"})
    sid = r.json()["id"]

    r2 = client.post(
        "/api/chat/",
        json={"message": "Hello", "session_id": sid, "model": "llama3", "use_documents": False},
    )
    assert r2.status_code == 200
    assert r2.json()["sources"] == []


# ─── Round-trip: sources saved & loaded from SQLite ──────────────

def test_sources_roundtrip_structured():
    """Structured source dicts survive JSON serialization through db_service."""
    sources = [{"source": "report.pdf", "chunk": 2, "preview": "Some text here."}]
    r = client.post("/api/sessions/", json={"title": "RT Test"})
    sid = r.json()["id"]
    db.save_message(sid, "assistant", "An answer.", sources)
    msgs = db.get_messages_full(sid)
    loaded = msgs[-1]["sources"]
    assert loaded[0]["source"] == "report.pdf"
    assert loaded[0]["preview"] == "Some text here."


def test_sources_roundtrip_legacy_strings():
    """Legacy string sources survive JSON serialization through db_service."""
    sources = ["legacy.pdf", "old_notes.txt"]
    r = client.post("/api/sessions/", json={"title": "Legacy RT Test"})
    sid = r.json()["id"]
    db.save_message(sid, "assistant", "An answer.", sources)
    msgs = db.get_messages_full(sid)
    assert msgs[-1]["sources"] == ["legacy.pdf", "old_notes.txt"]
