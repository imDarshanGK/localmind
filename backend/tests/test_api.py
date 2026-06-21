"""LocalMind v2 Tests — run: pytest -v"""

import json
import tempfile
import os
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


def test_db_health():
    r = client.get("/health/db")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"

# ─── Sessions ────────────────────────────────────────────
def test_create_session():
    r = client.post("/api/sessions/", json={"title": "Test Chat", "model": "llama3", "language": "hi"})
    assert r.status_code == 200
    assert "id" in r.json()
    assert r.json()["language"] == "hi"


def test_list_sessions():
    r = client.get("/api/sessions/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_session_not_found():
    r = client.get("/api/sessions/nonexistent")
    assert r.status_code == 404


def test_update_session():
    r = client.post("/api/sessions/", json={"title": "Old Title", "language": "hi"})
    sid = r.json()["id"]
    r2 = client.patch(f"/api/sessions/{sid}", json={"title": "New Title", "language": "ta"})
    assert r2.json()["title"] == "New Title"
    assert r2.json()["language"] == "ta"


def test_delete_session():
    r = client.post("/api/sessions/", json={"title": "To Delete"})
    sid = r.json()["id"]
    r2 = client.delete(f"/api/sessions/{sid}")
    assert r2.status_code == 200


def test_delete_session_removes_files():
    r = client.post("/api/sessions/", json={"title": "To Delete With Files"})
    sid = r.json()["id"]
    
    upload_dir = f"./data/uploads/{sid}"
    os.makedirs(upload_dir, exist_ok=True)
    with open(os.path.join(upload_dir, "test.txt"), "w") as f:
        f.write("dummy")
        
    assert os.path.exists(upload_dir)
    
    r2 = client.delete(f"/api/sessions/{sid}")
    assert r2.status_code == 200
    
    assert not os.path.exists(upload_dir)


def test_clone_session():
    r = client.post(
        "/api/sessions/",
        json={"title": "Original Chat", "model": "llama3", "language": "fr"}
    )
    sid = r.json()["id"]
    db.save_message(sid, "user", "Hello")
    db.save_message(sid, "assistant", "Hi there")
    clone = client.post(f"/api/sessions/{sid}/clone")
    assert clone.status_code == 200
    cloned = clone.json()
    assert cloned["id"] != sid
    assert cloned["title"] == "Original Chat (Copy)"
    assert cloned["model"] == "llama3"
    assert cloned["language"] == "fr"
    msgs = client.get(f"/api/sessions/{cloned['id']}/messages")
    assert msgs.status_code == 200
    assert msgs.json()["count"] == 2

def test_clone_session_not_found():
    r = client.post("/api/sessions/nonexistent/clone")
    assert r.status_code == 404
    
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


def test_session_title_trimming_emoji():
    # Test case 1: first message containing an emoji near the truncation boundary (40 graphemes)
    r = client.post("/api/sessions/", json={"title": "New Chat"})
    sid = r.json()["id"]
    msg = "This message has exactly 39 characters 💪🏾 next part"
    db.save_message(sid, "user", msg)
    sess = db.get_session(sid)
    assert sess["title"] == "This message has exactly 39 characters 💪🏾..."
    assert "\ufffd" not in sess["title"]

    # Test case 2: normal ASCII message -> title is trimmed and has "..." (no regression)
    r2 = client.post("/api/sessions/", json={"title": "New Chat"})
    sid2 = r2.json()["id"]
    msg2 = "This is a very long ASCII message that will definitely exceed the limit of forty characters."
    db.save_message(sid2, "user", msg2)
    sess2 = db.get_session(sid2)
    assert sess2["title"] == "This is a very long ASCII message that w..."

    # Test case 3: message shorter than limit -> title unchanged
    r3 = client.post("/api/sessions/", json={"title": "New Chat"})
    sid3 = r3.json()["id"]
    msg3 = "Short message"
    db.save_message(sid3, "user", msg3)
    sess3 = db.get_session(sid3)
    assert sess3["title"] == "Short message"


def test_delete_single_message():
    r = client.post("/api/sessions/", json={"title": "Del Msg Test"})
    sid = r.json()["id"]
    db.save_message(sid, "user", "first")
    db.save_message(sid, "assistant", "second")

    msgs = client.get(f"/api/sessions/{sid}/messages").json()["messages"]
    assert len(msgs) == 2
    target_id = msgs[0]["id"]

    r2 = client.delete(f"/api/sessions/{sid}/messages/{target_id}")
    assert r2.status_code == 200
    assert r2.json()["status"] == "deleted"

    remaining = client.get(f"/api/sessions/{sid}/messages").json()["messages"]
    assert len(remaining) == 1
    assert all(m["id"] != target_id for m in remaining)


def test_delete_message_not_found():
    r = client.post("/api/sessions/", json={"title": "Del 404 Test"})
    sid = r.json()["id"]
    r2 = client.delete(f"/api/sessions/{sid}/messages/999999")
    assert r2.status_code == 404


# ─── Upload ──────────────────────────────────────────────
def test_upload_invalid_type():
    files = {"file": ("bad.exe", b"data", "application/octet-stream")}
    r = client.post("/api/upload/", files=files, data={"session_id": "s1"})
    assert r.status_code == 400

def test_upload_document_flow():
    r = client.post(
        "/api/sessions/",
        json={"title": "Upload Flow Test"}
    )
    sid = r.json()["id"]

    files = {
        "file": ("sample.txt", b"hello localmind", "text/plain")
    }

    upload = client.post(
        "/api/upload/",
        files=files,
        data={"session_id": sid}
    )

    assert upload.status_code == 200
    assert upload.json()["filename"] == "sample.txt"

    docs = client.get(f"/api/sessions/{sid}/documents")

    assert docs.status_code == 200
    assert len(docs.json()["documents"]) == 1

    doc = docs.json()["documents"][0]

    assert doc["filename"] == "sample.txt"
    assert doc["session_id"] == sid

def test_upload_too_large(monkeypatch):
    import routes.upload as up
    monkeypatch.setattr(up, "MAX_BYTES", 5)
    files = {"file": ("big.txt", b"x" * 10, "text/plain")}
    r = client.post("/api/upload/", files=files, data={"session_id": "s1"})
    assert r.status_code == 413


def test_upload_emits_structured_logs(caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="routes.upload"):
        files = {"file": ("bad.exe", b"data", "application/octet-stream")}
        r = client.post("/api/upload/", files=files, data={"session_id": "log-test"})

    assert r.status_code == 400
    messages = [rec.getMessage() for rec in caplog.records]
    # Structured request log is emitted, with key=value fields.
    assert any("upload_request" in m and "session=log-test" in m for m in messages)
    # The unsupported-type rejection is logged as a structured warning.
    assert any("upload_rejected" in m and "reason=unsupported_type" in m for m in messages)


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


def test_coderunner_success():
    r = client.post("/api/plugins/run", json={"plugin": "coderunner", "input": "print('hello world')"})
    assert r.status_code == 200
    assert r.json()["success"]
    assert "hello world" in r.json()["output"]


def test_coderunner_timeout():
    r = client.post("/api/plugins/run", json={
        "plugin": "coderunner",
        "input": "import time\ntime.sleep(6)"
    })
    assert r.status_code == 200
    assert r.json()["success"]
    assert "Timeout" in r.json()["output"]


def test_get_plugin_logs():
    client.post("/api/plugins/run", json={
        "plugin": "calculator", 
        "input": "3+7", 
        "session_id": "test-audit-log"
    })
    r = client.get("/api/plugins/logs")
    
    assert r.status_code == 200
    logs = r.json()["logs"]
    
    assert len(logs) >= 1
    assert logs[0]["plugin"] == "calculator"
    assert logs[0]["input"] == "3+7"
    assert "10" in logs[0]["output"]
    assert logs[0]["success"] == 1

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

def test_export_complete_session_flow():
    
    r = client.post(
        "/api/sessions/",
        json={"title": "Integration Export"}
    )

    sid = r.json()["id"]

    db.save_message(
        sid,
        "user",
        "What is LocalMind?"
    )

    db.save_message(
        sid,
        "assistant",
        "LocalMind is an offline AI assistant."
    )

    export = client.get(
        f"/api/export/{sid}/json"
    )

    assert export.status_code == 200

    payload = json.loads(export.content)

    assert payload["session"]["id"] == sid
    assert payload["session"]["title"] == "Integration Export"
    assert "created_at" in payload["session"]
    assert "updated_at" in payload["session"]
    assert len(payload["messages"]) == 2

    assert payload["messages"][0]["content"] == "What is LocalMind?"
    assert payload["messages"][1]["content"] == "LocalMind is an offline AI assistant."

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

def test_clear_all_sessions():
    r1 = client.post("/api/sessions/", json={"title": "Session 1"})
    r2 = client.post("/api/sessions/", json={"title": "Session 2"})
    assert r1.status_code == 200
    assert r2.status_code == 200

    r_delete = client.delete("/api/sessions/")
    assert r_delete.status_code == 200
    assert r_delete.json() == {"message": "All sessions cleared"}

    r_list = client.get("/api/sessions/")
    assert r_list.status_code == 200
    assert len(r_list.json()) == 0


