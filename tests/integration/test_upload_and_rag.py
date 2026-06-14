"""
Integration tests — Upload → RAG index → Chat end-to-end
=========================================================
This is the key end-to-end test described in issue #197:

  1. Upload a real PDF (fixtures/sample.pdf) that contains known facts
  2. Wait until the background RAG indexer marks the document "completed"
  3. Send a chat question whose answer is in the PDF
  4. Assert the reply contains the expected answer keyword

The mock-ollama server echoes relevant keywords back, so as long as
the RAG pipeline retrieves the right chunk and passes it to Ollama,
the keyword will appear in the reply.
"""

import time

import pytest


POLL_INTERVAL = 2     # seconds between status polls
INDEX_TIMEOUT = 60    # seconds to wait for background indexing


# ─── Upload helpers ──────────────────────────────────────────────────────────

def _upload_pdf(client, session_id: str, pdf_path) -> dict:
    """POST the sample PDF to /api/upload/ and return the response body."""
    with open(pdf_path, "rb") as fh:
        r = client.post(
            "/api/upload/",
            files={"file": ("sample.pdf", fh, "application/pdf")},
            data={"session_id": session_id},
            timeout=30,
        )
    assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
    return r.json()


def _wait_for_indexing(client, session_id: str, timeout: int = INDEX_TIMEOUT) -> dict:
    """
    Poll GET /api/sessions/{id}/documents until at least one document
    reaches status 'completed', then return that document dict.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/sessions/{session_id}/documents", timeout=10)
        if r.status_code == 200:
            body = r.json()
            # API returns {"session_id": ..., "documents": [...]}
            docs = body.get("documents", []) if isinstance(body, dict) else body
            if isinstance(docs, list) and docs:
                completed = [d for d in docs if d.get("status") == "completed"]
                if completed:
                    return completed[0]
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Document indexing did not complete within {timeout}s")


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_upload_valid_pdf(client, new_session, sample_pdf_path):
    """Upload a PDF and verify the immediate API response is well-formed."""
    body = _upload_pdf(client, new_session["id"], sample_pdf_path)

    assert body["filename"] == "sample.pdf"
    assert body["status"] in ("queued", "completed")
    assert body["file_size_kb"] > 0
    assert "message" in body


def test_upload_invalid_file_type_rejected(client, new_session):
    """Non-allowed file types must return 400."""
    r = client.post(
        "/api/upload/",
        files={"file": ("malware.exe", b"\x00\x01\x02", "application/octet-stream")},
        data={"session_id": new_session["id"]},
    )
    assert r.status_code == 400


def test_upload_oversized_file_rejected(client, new_session):
    """Files > MAX_BYTES (50 MB) must return 413 (or 400)."""
    big_data = b"x" * (51 * 1024 * 1024)  # 51 MB
    r = client.post(
        "/api/upload/",
        files={"file": ("big.txt", big_data, "text/plain")},
        data={"session_id": new_session["id"]},
        timeout=120,
    )
    assert r.status_code in (413, 400)


def test_upload_txt_file(client, new_session):
    """Plain-text files should also be accepted."""
    txt_content = b"LocalMind is a fully offline AI assistant.\n" * 10
    r = client.post(
        "/api/upload/",
        files={"file": ("notes.txt", txt_content, "text/plain")},
        data={"session_id": new_session["id"]},
    )
    assert r.status_code == 200
    assert r.json()["filename"] == "notes.txt"


# ─── THE KEY E2E TEST ────────────────────────────────────────────────────────

def test_upload_pdf_then_chat_rag_answer_contains_expected_content(
    client, new_session, sample_pdf_path
):
    """
    Full pipeline:
      upload PDF → wait for indexing → ask question → assert answer.

    The sample PDF states "The capital of France is Paris."
    The mock-ollama echoes 'Paris' when it sees 'capital' or 'france'
    in the context passed to it — confirming RAG retrieved the right chunk.
    """
    sid = new_session["id"]

    # Step 1 — Upload
    upload_body = _upload_pdf(client, sid, sample_pdf_path)
    assert upload_body["status"] in ("queued", "completed")

    # Step 2 — Wait for background indexing
    doc = _wait_for_indexing(client, sid)
    assert doc["status"] == "completed"
    assert doc["chunks_indexed"] > 0

    # Step 3 — Chat with RAG enabled
    r = client.post(
        "/api/chat/",
        json={
            "message": "What is the capital of France?",
            "session_id": sid,
            "model": "llama3",
            "use_documents": True,
            "language": "en",
        },
        timeout=60,
    )
    assert r.status_code == 200
    reply = r.json()["reply"]

    # Step 4 — Verify the answer contains expected content
    assert "Paris" in reply, (
        f"Expected 'Paris' in RAG reply but got: {reply!r}"
    )


def test_rag_sources_returned_when_documents_used(client, new_session, sample_pdf_path):
    """
    When use_documents=True, the response should include sources
    listing the uploaded file name.
    """
    sid = new_session["id"]
    _upload_pdf(client, sid, sample_pdf_path)
    _wait_for_indexing(client, sid)

    r = client.post(
        "/api/chat/",
        json={
            "message": "Tell me about Python.",
            "session_id": sid,
            "model": "llama3",
            "use_documents": True,
        },
        timeout=60,
    )
    assert r.status_code == 200
    body = r.json()
    # Sources should be a list (may be empty if no match, but should exist)
    assert "sources" in body
    assert isinstance(body["sources"], list)
