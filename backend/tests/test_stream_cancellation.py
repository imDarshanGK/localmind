import asyncio
import tempfile
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import services.db_service as db
from app import app

# ── shared test DB ─────────────────────────────
_tmp = tempfile.mktemp(suffix="_stream.db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app, raise_server_exceptions=True)

@pytest.mark.asyncio
async def test_stream_cancellation_saves_partial_content():
    """
    Test that when a client disconnects during a streaming request
    (simulated by the generator raising asyncio.CancelledError),
    the backend catches it and saves the partially generated string
    with a [Cancelled] marker.
    """
    
    async def mock_chat_stream(*args, **kwargs):
        yield "Hello"
        yield " World"
        # Simulate the client dropping the connection mid-stream
        raise asyncio.CancelledError()

    with patch("services.ollama_service.chat_stream", new=mock_chat_stream):
        with patch("services.ollama_service.is_ollama_running", return_value=True):
            r_create = client.post("/api/sessions/", json={"title": "Stream Cancel Test"})
            assert r_create.status_code == 200
            sid = r_create.json()["id"]

            try:
                # The TestClient consumes the stream until it finishes.
                # Because we are mocking it to raise CancelledError mid-way,
                # the exception will bubble up to the route handler, be caught 
                # by our new except block, save the message, and re-raise.
                with client.stream("POST", "/api/chat/stream", json={
                    "message": "Test cancel", 
                    "session_id": sid, 
                    "model": "llama3", 
                    "use_documents": False, 
                    "language": "en"
                }) as response:
                    for _ in response.iter_lines():
                        pass
            except BaseException:
                # We expect the CancelledError to be propagated or wrapped by the TestClient
                pass

            # Verify that the DB captured the partial content before the abort
            messages = db.get_messages_full(sid)
            assert len(messages) == 2  # 1 user message, 1 assistant message
            
            assistant_msg = messages[-1]
            assert assistant_msg["role"] == "assistant"
            assert "Hello World" in assistant_msg["content"]
            assert "[Cancelled]" in assistant_msg["content"]
