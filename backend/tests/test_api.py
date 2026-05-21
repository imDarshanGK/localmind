"""
LocalMind Backend Tests
Run: pytest --tb=short -q
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app
from services.db_service import init_db, create_session, save_message, get_history

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    """Use a temporary DB for each test."""
    db_path = str(tmp_path / "test.db")
    monkeypatch.setenv("DB_PATH", db_path)
    import services.db_service as db
    db.DB_PATH = db_path
    init_db()


def test_root():
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["app"] == "LocalMind"


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_new_session():
    res = client.post("/api/chat/sessions/new")
    assert res.status_code == 200
    data = res.json()
    assert "id" in data


def test_get_history_empty():
    session_id = "test-session-123"
    create_session(session_id)
    res = client.get(f"/api/chat/sessions/{session_id}/history")
    assert res.status_code == 200
    assert res.json()["messages"] == []


def test_save_and_get_history():
    session_id = "test-session-history"
    create_session(session_id)
    save_message(session_id, "user", "Hello LocalMind!")
    save_message(session_id, "assistant", "Hello! How can I help?")

    history = get_history(session_id)
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[1]["role"] == "assistant"


def test_list_sessions():
    create_session("session-a")
    create_session("session-b")
    res = client.get("/api/chat/sessions")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=False)
def test_chat_ollama_not_running(mock_ollama):
    res = client.post("/api/chat/", json={
        "message": "Hello",
        "session_id": "test-session",
        "model": "llama3",
    })
    assert res.status_code == 503


@patch("routes.models.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.models.ollama_service.list_models", new_callable=AsyncMock, return_value=[
    {"name": "llama3", "size": "4.7 GB", "status": "available"}
])
def test_list_models(mock_list, mock_status):
    res = client.get("/api/models/")
    assert res.status_code == 200
    assert "models" in res.json()


def test_upload_invalid_type():
    files = {"file": ("test.exe", b"fake content", "application/octet-stream")}
    data = {"session_id": "test-session"}
    res = client.post("/api/upload/", files=files, data=data)
    assert res.status_code == 400
