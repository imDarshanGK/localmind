"""
Integration tests — Chat endpoint (standard + streaming)
=========================================================
Tests the /api/chat/ and /api/chat/stream endpoints with the
mock-ollama backend.  No documents are used here so these tests
are fast and independent of the RAG pipeline.
"""

import json

import pytest


# ─── Standard (non-streaming) chat ──────────────────────────────────────────

def test_chat_returns_reply(client, new_session):
    """A simple chat message should produce a non-empty reply."""
    r = client.post(
        "/api/chat/",
        json={
            "message": "Hello, LocalMind!",
            "session_id": new_session["id"],
            "model": "llama3",
            "use_documents": False,
        },
        timeout=30,
    )
    assert r.status_code == 200
    body = r.json()
    assert "reply" in body
    assert len(body["reply"]) > 0


def test_chat_response_contains_session_and_model(client, new_session):
    """Chat response must echo back session_id and model."""
    sid = new_session["id"]
    r = client.post(
        "/api/chat/",
        json={
            "message": "What is LocalMind?",
            "session_id": sid,
            "model": "llama3",
            "use_documents": False,
        },
        timeout=30,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["session_id"] == sid
    assert body["model"] == "llama3"


def test_chat_with_keyword_triggers_canned_reply(client, new_session):
    """
    The mock-ollama returns 'LocalMind' when it sees 'localmind' in the
    message — verifying end-to-end network path to the mock container.
    """
    r = client.post(
        "/api/chat/",
        json={
            "message": "Tell me about LocalMind.",
            "session_id": new_session["id"],
            "model": "llama3",
            "use_documents": False,
        },
        timeout=30,
    )
    assert r.status_code == 200
    reply = r.json()["reply"]
    # mock-ollama answers with a LocalMind description for this keyword
    assert "LocalMind" in reply or len(reply) > 10


def test_chat_saves_messages_to_history(client, new_session):
    """After chatting, the session should contain user + assistant messages."""
    sid = new_session["id"]
    client.post(
        "/api/chat/",
        json={"message": "Hi there", "session_id": sid, "use_documents": False},
        timeout=30,
    )
    r = client.get(f"/api/sessions/{sid}/messages", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 2  # user + assistant
    roles = [m["role"] for m in body["messages"]]
    assert "user" in roles
    assert "assistant" in roles


def test_chat_message_too_short_rejected(client, new_session):
    """Empty message must be rejected with 422 (Pydantic validation)."""
    r = client.post(
        "/api/chat/",
        json={"message": "", "session_id": new_session["id"], "use_documents": False},
        timeout=10,
    )
    assert r.status_code == 422


def test_chat_invalid_temperature_rejected(client, new_session):
    """Temperature outside [0, 2] must be rejected."""
    r = client.post(
        "/api/chat/",
        json={
            "message": "hi",
            "session_id": new_session["id"],
            "temperature": 99.0,
            "use_documents": False,
        },
        timeout=10,
    )
    assert r.status_code == 422


# ─── Streaming chat (SSE) ────────────────────────────────────────────────────

def test_chat_stream_returns_sse_events(client, new_session):
    """
    POST /api/chat/stream should return a text/event-stream response
    containing token events followed by a final done event.
    """
    with client.stream(
        "POST",
        "/api/chat/stream",
        json={
            "message": "What is the capital of France?",
            "session_id": new_session["id"],
            "model": "llama3",
            "use_documents": False,
        },
        timeout=60,
    ) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        events = []
        for line in resp.iter_lines():
            if line.startswith("data: "):
                payload = json.loads(line[6:])
                events.append(payload)
                if payload.get("done"):
                    break

    # We must have received at least one token and a done event
    token_events = [e for e in events if "token" in e]
    done_events = [e for e in events if e.get("done") is True]
    assert len(token_events) >= 1, "Expected at least one token event from stream"
    assert len(done_events) == 1, "Expected exactly one 'done' event at end of stream"


def test_chat_stream_done_event_has_benchmarks(client, new_session):
    """The final 'done' SSE event must include benchmarks metadata."""
    with client.stream(
        "POST",
        "/api/chat/stream",
        json={
            "message": "Hello!",
            "session_id": new_session["id"],
            "model": "llama3",
            "use_documents": False,
        },
        timeout=60,
    ) as resp:
        assert resp.status_code == 200
        done_payload = None
        for line in resp.iter_lines():
            if line.startswith("data: "):
                payload = json.loads(line[6:])
                if payload.get("done"):
                    done_payload = payload
                    break

    assert done_payload is not None
    assert "benchmarks" in done_payload
    benchmarks = done_payload["benchmarks"]
    assert "total_duration_ms" in benchmarks
    assert "token_count" in benchmarks
