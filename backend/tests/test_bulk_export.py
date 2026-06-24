import tempfile
from fastapi.testclient import TestClient
import services.db_service as db
from app import app

# Setup temporary database for bulk export tests
_tmp = tempfile.mktemp(suffix=".db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app)


def test_bulk_export_json_success():
    # 1. Create two test sessions
    db.create_session("sess_1", title="Session One", model="llama3", language="en")
    db.create_session("sess_2", title="Session Two", model="mistral", language="fr")

    db.save_message("sess_1", "user", "Hello from user 1")
    db.save_message("sess_1", "assistant", "Response 1")

    db.save_message("sess_2", "user", "Bonjour")
    db.save_message("sess_2", "assistant", "Salut")

    # 2. Call bulk export
    response = client.post(
        "/api/export/sessions",
        json={"session_ids": ["sess_1", "sess_2"], "format": "json"}
    )
    assert response.status_code == 200
    assert response.headers["Content-Type"].startswith("application/json")
    assert "Content-Disposition" in response.headers
    assert "attachment; filename=" in response.headers["Content-Disposition"]
    assert "localmind_bulk_export_" in response.headers["Content-Disposition"]

    payload = response.json()
    assert "exported_at" in payload
    assert "sessions" in payload
    assert len(payload["sessions"]) == 2

    # Check structure
    sess_1_data = payload["sessions"][0]
    assert sess_1_data["session"]["id"] == "sess_1"
    assert sess_1_data["session"]["title"] == "Session One"
    assert len(sess_1_data["messages"]) == 2
    assert sess_1_data["messages"][0]["content"] == "Hello from user 1"

    sess_2_data = payload["sessions"][1]
    assert sess_2_data["session"]["id"] == "sess_2"
    assert sess_2_data["session"]["title"] == "Session Two"
    assert len(sess_2_data["messages"]) == 2
    assert sess_2_data["messages"][0]["content"] == "Bonjour"


def test_bulk_export_markdown_success():
    # Setup some session
    db.create_session("sess_md", title="Markdown Chat", model="llama3")
    db.save_message("sess_md", "user", "MD user message")
    db.save_message("sess_md", "assistant", "MD assistant response")

    response = client.post(
        "/api/export/sessions",
        json={"session_ids": ["sess_md"], "format": "markdown"}
    )
    assert response.status_code == 200
    assert response.headers["Content-Type"].startswith("text/markdown")
    assert "attachment; filename=" in response.headers["Content-Disposition"]
    assert ".md" in response.headers["Content-Disposition"]

    content = response.content.decode("utf-8")
    assert "# Markdown Chat" in content
    assert "MD user message" in content
    assert "MD assistant response" in content


def test_bulk_export_txt_success():
    # Setup some session
    db.create_session("sess_txt", title="TXT Chat", model="mistral")
    db.save_message("sess_txt", "user", "TXT user message")

    response = client.post(
        "/api/export/sessions",
        json={"session_ids": ["sess_txt"], "format": "txt"}
    )
    assert response.status_code == 200
    assert response.headers["Content-Type"].startswith("text/plain")
    assert "attachment; filename=" in response.headers["Content-Disposition"]
    assert ".txt" in response.headers["Content-Disposition"]

    content = response.content.decode("utf-8")
    assert "LocalMind Export — TXT Chat" in content
    assert "[YOU]" in content
    assert "TXT user message" in content


def test_bulk_export_validation_empty_ids():
    response = client.post(
        "/api/export/sessions",
        json={"session_ids": [], "format": "json"}
    )
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("session_ids" in err["loc"] for err in errors)


def test_bulk_export_validation_invalid_format():
    response = client.post(
        "/api/export/sessions",
        json={"session_ids": ["sess_1"], "format": "html"}
    )
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("format" in err["loc"] for err in errors)


def test_bulk_export_mixed_valid_invalid():
    # sess_1 exists, sess_invalid does not
    db.create_session("sess_1", title="Valid Session")
    db.save_message("sess_1", "user", "Hello")

    response = client.post(
        "/api/export/sessions",
        json={"session_ids": ["sess_1", "sess_invalid"], "format": "json"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["sessions"]) == 1
    assert payload["sessions"][0]["session"]["id"] == "sess_1"


def test_bulk_export_all_invalid():
    response = client.post(
        "/api/export/sessions",
        json={"session_ids": ["invalid_1", "invalid_2"], "format": "json"}
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "No valid sessions found for the given IDs"


def test_bulk_export_single_valid_session():
    # Verifies edge case where only one session is provided
    db.create_session("sess_single", title="Single Session Chat")
    db.save_message("sess_single", "user", "Single user query")

    response = client.post(
        "/api/export/sessions",
        json={"session_ids": ["sess_single"], "format": "json"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["sessions"]) == 1
    assert payload["sessions"][0]["session"]["id"] == "sess_single"
