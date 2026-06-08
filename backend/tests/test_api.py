"""LocalMind v2 Tests — run: pytest -v"""

import json
import tempfile
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import services.db_service as db
from app import app


_tmp = tempfile.mktemp(suffix=".db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app)


# ─── Health ──────────────────────────────────────────────
def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["version"] == "2.0.0"


def test_health():
    r = client.get("/health")
    assert r.json()["status"] == "healthy"


# ─── Sessions ────────────────────────────────────────────
def test_create_session():
    r = client.post("/api/sessions/", json={"title": "Test Chat", "model": "llama3"})
    assert r.status_code == 200
    assert "id" in r.json()


def test_list_sessions():
    r = client.get("/api/sessions/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_session_not_found():
    r = client.get("/api/sessions/nonexistent")
    assert r.status_code == 404


def test_update_session():
    r = client.post("/api/sessions/", json={"title": "Old Title"})
    sid = r.json()["id"]
    r2 = client.patch(f"/api/sessions/{sid}", json={"title": "New Title"})
    assert r2.json()["title"] == "New Title"


def test_delete_session():
    r = client.post("/api/sessions/", json={"title": "To Delete"})
    sid = r.json()["id"]
    r2 = client.delete(f"/api/sessions/{sid}")
    assert r2.status_code == 200


def test_get_messages_empty():
    r = client.post("/api/sessions/", json={"title": "Msg Test"})
    sid = r.json()["id"]
    r2 = client.get(f"/api/sessions/{sid}/messages")
    assert r2.json()["count"] == 0

def test_clear_messages():
    r = client.post("/api/sessions/", json={"title": "Clear Test"})
    sid = r.json()["id"]
    db.save_message(sid, "user", "hello")
    r2 = client.delete(f"/api/sessions/{sid}/messages")
    assert r2.status_code == 200


# ─── Upload ──────────────────────────────────────────────
def test_upload_invalid_type():
    files = {"file": ("bad.exe", b"data", "application/octet-stream")}
    r = client.post("/api/upload/", files=files, data={"session_id": "s1"})
    assert r.status_code == 400

def test_upload_too_large(monkeypatch):
    import routes.upload as up
    monkeypatch.setattr(up, "MAX_BYTES", 5)
    files = {"file": ("big.txt", b"x" * 10, "text/plain")}
    r = client.post("/api/upload/", files=files, data={"session_id": "s1"})
    assert r.status_code == 413


# ─── Plugins ─────────────────────────────────────────────
def test_list_plugins():
    r = client.get("/api/plugins/")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["plugins"]]
    assert "calculator" in ids

def test_calculator_basic():
    r = client.post("/api/plugins/run", json={"plugin":"calculator","input":"2+2"})
    assert "4" in r.json()["output"]

def test_calculator_advanced():
    r = client.post("/api/plugins/run", json={"plugin":"calculator","input":"sqrt(144)"})
    assert "12" in r.json()["output"]

def test_calculator_blocked():
    r = client.post("/api/plugins/run", json={"plugin":"calculator","input":"__import__('os')"})
    assert "Unsafe" in r.json()["output"] or not r.json()["success"]

def test_wordcount():
    r = client.post("/api/plugins/run", json={"plugin":"wordcount","input":"hello world foo bar"})
    assert "Words: 4" in r.json()["output"]

def test_jsonformat_valid():
    r = client.post("/api/plugins/run", json={"plugin":"jsonformat","input":'{"a":1}'})
    assert '"a"' in r.json()["output"]

def test_jsonformat_invalid():
    r = client.post("/api/plugins/run", json={"plugin":"jsonformat","input":"not json"})
    assert "Invalid" in r.json()["output"]

def test_summarizer():
    long_text = "The quick brown fox jumps over the lazy dog. " * 20
    r = client.post("/api/plugins/run", json={"plugin":"summarizer","input":long_text})
    assert r.json()["success"]

def test_unknown_plugin():
    r = client.post("/api/plugins/run", json={"plugin":"unknown","input":"test"})
    assert r.status_code == 400


# ─── Settings ────────────────────────────────────────────
def test_get_settings():
    r = client.get("/api/settings/")
    assert r.status_code == 200
    assert "default_model" in r.json()

def test_save_settings():
    r = client.put("/api/settings/", json={
        "default_model":"mistral","default_language":"hi",
        "temperature":0.5,"max_history_turns":8,"rag_top_k":3,"theme":"dark"
    })
    assert r.json()["default_model"] == "mistral"


# ─── Models (mocked) ─────────────────────────────────────
@patch("routes.models.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=False)
def test_models_ollama_down(mock):
    r = client.get("/api/models/")
    assert r.status_code == 503

@patch("routes.models.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.models.ollama_service.list_models", new_callable=AsyncMock, return_value=[{"name":"llama3","size":"4.7 GB","status":"available"}])
def test_models_list(m1, m2):
    r = client.get("/api/models/")
    assert r.status_code == 200
    assert len(r.json()["models"]) == 1


# ─── Chat (mocked Ollama) ────────────────────────────────
@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=False)
def test_chat_ollama_down(mock):
    r = client.post("/api/chat/", json={"message":"hi","session_id":"x","model":"llama3"})
    assert r.status_code == 503

@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat", new_callable=AsyncMock, return_value="Hello! I'm LocalMind.")
@patch("routes.chat.rag_service.retrieve_context", return_value=("",  []))
def test_chat_ok(m1, m2, m3):
    r = client.post("/api/sessions/", json={"title": "t"})
    sid = r.json()["id"]
    r2 = client.post("/api/chat/", json={"message": "hello", "session_id": sid, "model": "llama3"})
    assert r2.status_code == 200
    assert "LocalMind" in r2.json()["reply"]


# ─── Export ──────────────────────────────────────────────
def test_export_not_found():
    r = client.get("/api/export/nonexistent/markdown")
    assert r.status_code == 404

def test_export_json():
    r = client.post("/api/sessions/", json={"title": "Export Test"})
    sid = r.json()["id"]
    db.save_message(sid, "user", "hello")
    db.save_message(sid, "assistant", "hi there")
    r2 = client.get(f"/api/export/{sid}/json")
    assert r2.status_code == 200
    data = json.loads(r2.content)
    assert len(data["messages"]) == 2

def test_export_markdown():
    r = client.post("/api/sessions/", json={"title": "MD Export"})
    sid = r.json()["id"]
    db.save_message(sid, "user", "Test question")
    r2 = client.get(f"/api/export/{sid}/markdown")
    assert r2.status_code == 200
    assert b"Test question" in r2.content

def test_export_txt():
    r = client.post("/api/sessions/", json={"title": "TXT Export"})
    sid = r.json()["id"]
    db.save_message(sid, "user", "Plain text export")
    r2 = client.get(f"/api/export/{sid}/txt")
    assert r2.status_code == 200
    assert b"Plain text export" in r2.content

# ─── Prompt Templates ────────────────────────────────────────
def test_create_prompt_template():
    r = client.post("/api/prompt-templates/", json={
        "prompt_title": "Code Reviewer",
        "prompt": "Review this code for bugs and suggest improvements."
    })
    assert r.status_code == 200
    assert r.json()["prompt_title"] == "Code Reviewer"
    assert "id" in r.json()


def test_list_prompt_templates():
    r = client.get("/api/prompt-templates/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_update_prompt_template():
    r = client.post("/api/prompt-templates/", json={
        "prompt_title": "Old Title",
        "prompt": "Old prompt text"
    })
    tid = r.json()["id"]
    r2 = client.put(f"/api/prompt-templates/{tid}", json={
        "prompt_title": "New Title"
    })
    assert r2.json()["prompt_title"] == "New Title"


def test_delete_prompt_template():
    r = client.post("/api/prompt-templates/", json={
        "prompt_title": "To Delete",
        "prompt": "This will be deleted."
    })
    tid = r.json()["id"]
    r2 = client.delete(f"/api/prompt-templates/{tid}")
    assert r2.status_code == 200
    assert r2.json()["status"] == "deleted"


def test_get_prompt_template_not_found():
    r = client.put("/api/prompt-templates/99999", json={
        "prompt_title": "Nope"
    })
    assert r.status_code == 404


def test_delete_prompt_template_not_found():
    r = client.delete("/api/prompt-templates/99999")
    assert r.status_code == 404


def test_create_prompt_template_empty_title():
    r = client.post("/api/prompt-templates/", json={
        "prompt_title": "",
        "prompt": "Some prompt"
    })
    assert r.status_code == 422
