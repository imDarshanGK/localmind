import tempfile
import json
from unittest.mock import patch
from fastapi.testclient import TestClient
import services.db_service as db
from app import app

# Setup temporary database
_tmp = tempfile.mktemp(suffix=".db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app)


def test_export_session_audit_success():
    # 1. Create a test session
    db.create_session("audit_sess_1", title="Audit Single Session", model="llama3", language="en")
    db.save_message("audit_sess_1", "user", "Message 1")
    db.save_message("audit_sess_1", "assistant", "Response 1")

    # 2. Call single session export
    response = client.get("/api/export/audit_sess_1/json")
    assert response.status_code == 200

    # 3. Retrieve export logs
    logs_res = client.get("/api/export/logs?limit=5")
    assert logs_res.status_code == 200
    logs = logs_res.json()["logs"]
    
    assert len(logs) >= 1
    latest_log = logs[0]
    assert latest_log["session_id"] == "audit_sess_1"
    assert latest_log["format"] == "json"
    assert latest_log["export_type"] == "single"
    
    details = json.loads(latest_log["details"])
    assert details["success"] is True
    assert details["messages_count"] == 2
    assert details["error"] is None
    assert "duration_ms" in details


def test_bulk_export_audit_success():
    # 1. Create sessions
    db.create_session("audit_bulk_1", title="Bulk Session A")
    db.create_session("audit_bulk_2", title="Bulk Session B")

    # 2. Call bulk export
    response = client.post(
        "/api/export/sessions",
        json={"session_ids": ["audit_bulk_1", "audit_bulk_2"], "format": "json"}
    )
    assert response.status_code == 200

    # 3. Check log
    logs_res = client.get("/api/export/logs?limit=5")
    assert logs_res.status_code == 200
    logs = logs_res.json()["logs"]
    
    latest_log = logs[0]
    assert latest_log["session_id"] is None
    assert latest_log["format"] == "json"
    assert latest_log["export_type"] == "bulk"
    
    details = json.loads(latest_log["details"])
    assert details["success"] is True
    assert details["sessions_count"] == 2
    assert details["error"] is None


def test_export_messages_audit_success():
    # 1. Create a session and message
    db.create_session("audit_msg_sess", title="Msg Session")
    db.save_message("audit_msg_sess", "user", "Unique Msg A")
    
    # Get message ID
    msgs = db.get_messages_full("audit_msg_sess")
    msg_id = msgs[0]["id"]

    # 2. Call messages export
    response = client.post(
        "/api/export/messages",
        json={"message_ids": [str(msg_id)], "format": "markdown"}
    )
    assert response.status_code == 200

    # 3. Check log
    logs_res = client.get("/api/export/logs?limit=5")
    assert logs_res.status_code == 200
    logs = logs_res.json()["logs"]
    
    latest_log = logs[0]
    assert latest_log["format"] == "markdown"
    assert latest_log["export_type"] == "messages"
    
    details = json.loads(latest_log["details"])
    assert details["success"] is True
    assert details["messages_count"] == 1


def test_export_audit_failure_logged():
    # 1. Export nonexistent session
    response = client.get("/api/export/nonexistent_session/json")
    assert response.status_code == 404

    # 2. Check that the failure was logged
    logs_res = client.get("/api/export/logs?limit=5")
    assert logs_res.status_code == 200
    logs = logs_res.json()["logs"]
    
    latest_log = logs[0]
    assert latest_log["session_id"] == "nonexistent_session"
    assert latest_log["export_type"] == "single"
    
    details = json.loads(latest_log["details"])
    assert details["success"] is False
    assert details["error"] == "Session not found"


def test_audit_logging_resilience_to_failures():
    # If the logging function itself raises an exception, the export should NOT fail.
    # 1. Setup session
    db.create_session("audit_resilient_sess", title="Resilient Session")
    
    # 2. Mock db_service.log_export to raise an exception
    with patch("services.db_service.log_export", side_effect=Exception("Database lock error/disk full")):
        response = client.get("/api/export/audit_resilient_sess/json")
        # The export should still succeed even though audit logging raised an exception
        assert response.status_code == 200
