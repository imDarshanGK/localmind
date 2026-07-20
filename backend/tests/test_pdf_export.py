import tempfile
import sys
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import services.db_service as db

# Setup temporary database for PDF export tests
_tmp = tempfile.mktemp(suffix=".db")
db.DB_PATH = _tmp
db.init_db()

from app import app
client = TestClient(app)

def test_pdf_export_session_success_whisper_present():
    # 1. Create a session and save a message
    db.create_session("sess_pdf_1", title="PDF Whisper Present Chat", model="llama3", language="en")
    db.save_message("sess_pdf_1", "user", "Hello PDF")
    db.save_message("sess_pdf_1", "assistant", "Response PDF", [{"source": "report.pdf", "chunk": 0}])

    # Mock whisper presence
    mock_whisper = MagicMock()
    with patch.dict(sys.modules, {"whisper": mock_whisper}):
        response = client.get("/api/export/sess_pdf_1/pdf")
        assert response.status_code == 200
        assert response.headers["Content-Type"] == "application/pdf"
        assert "Content-Disposition" in response.headers
        assert "attachment; filename=" in response.headers["Content-Disposition"]
        assert "pdf_whisper_present_chat.pdf" in response.headers["Content-Disposition"]
        assert len(response.content) > 0
        # Check standard PDF header prefix
        assert response.content.startswith(b"%PDF")

def test_pdf_export_session_success_whisper_missing():
    # 1. Create a session and save a message
    db.create_session("sess_pdf_2", title="PDF Whisper Missing Chat", model="llama3", language="en")
    db.save_message("sess_pdf_2", "user", "Hello PDF 2")
    db.save_message("sess_pdf_2", "assistant", "Response PDF 2")

    # Mock whisper missing
    with patch.dict(sys.modules, {"whisper": None}):
        sys.modules.pop("whisper", None)
        response = client.get("/api/export/sess_pdf_2/pdf")
        assert response.status_code == 200
        assert response.headers["Content-Type"] == "application/pdf"
        assert "pdf_whisper_missing_chat.pdf" in response.headers["Content-Disposition"]
        assert response.content.startswith(b"%PDF")

def test_pdf_export_messages_success_whisper_missing():
    # Save test messages and export them
    db.create_session("sess_pdf_3", title="PDF Message Export", model="llama3")
    db.save_message("sess_pdf_3", "user", "Standalone message to export")
    # Retrieve messages to get the correct message ID from the database
    messages = db.get_messages_full("sess_pdf_3")
    db_msg_id = str(messages[0]["id"])

    with patch.dict(sys.modules, {"whisper": None}):
        sys.modules.pop("whisper", None)
        response = client.post(
            "/api/export/messages",
            json={"message_ids": [db_msg_id], "format": "pdf"}
        )
        assert response.status_code == 200
        assert response.headers["Content-Type"] == "application/pdf"
        assert "localmind_messages_" in response.headers["Content-Disposition"]
        assert response.content.startswith(b"%PDF")
