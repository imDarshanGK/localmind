import os
import tempfile
import shutil
import asyncio
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import pytest

import services.db_service as db
from app import app

_tmp = tempfile.mktemp(suffix=".db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_teardown():
    # Setup: ensure uploads folder exists
    os.makedirs("./data/uploads", exist_ok=True)
    yield
    # Teardown: clean up uploads and temp database
    if os.path.exists("./data/uploads"):
        shutil.rmtree("./data/uploads")
    if os.path.exists(_tmp):
        try:
            os.remove(_tmp)
        except Exception:
            pass

def test_preview_success():
    session_id = "session_success"
    filename = "success.txt"
    dir_path = f"./data/uploads/{session_id}"
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, filename)
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("Hello, LocalMind!")

    response = client.get(f"/api/upload/preview?filename={filename}&session_id={session_id}")
    assert response.status_code == 200
    assert response.json()["content"] == "Hello, LocalMind!"

def test_preview_transient_failure_then_success():
    session_id = "session_transient"
    filename = "transient.txt"
    dir_path = f"./data/uploads/{session_id}"
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, filename)
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("Recovered Content")

    call_count = 0
    original_open = open

    def mock_open(file, *args, **kwargs):
        nonlocal call_count
        if filename in str(file):
            call_count += 1
            if call_count == 1:
                raise PermissionError("Simulated temporary sharing lock")
        return original_open(file, *args, **kwargs)

    with patch("builtins.open", side_effect=mock_open):
        # We also mock asyncio.sleep to run the test instantly
        with patch("asyncio.sleep", return_value=None) as mock_sleep:
            response = client.get(f"/api/upload/preview?filename={filename}&session_id={session_id}")
            assert response.status_code == 200
            assert response.json()["content"] == "Recovered Content"
            assert call_count == 2
            mock_sleep.assert_called_once()

def test_preview_retry_exhaustion():
    session_id = "session_exhaust"
    filename = "locked.txt"
    dir_path = f"./data/uploads/{session_id}"
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, filename)
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("Locked Content")

    call_count = 0
    def mock_open(file, *args, **kwargs):
        nonlocal call_count
        if filename in str(file):
            call_count += 1
            raise PermissionError("Always locked")
        raise FileNotFoundError()

    with patch("builtins.open", side_effect=mock_open):
        with patch("asyncio.sleep", return_value=None) as mock_sleep:
            response = client.get(f"/api/upload/preview?filename={filename}&session_id={session_id}")
            assert response.status_code == 500
            assert "Failed to read file contents" in response.json()["detail"]
            assert call_count == 3
            assert mock_sleep.call_count == 2

def test_preview_file_not_found():
    session_id = "session_not_found"
    filename = "nonexistent.txt"
    
    # Check that os.path.exists is called 3 times (due to retries) and then returns 404
    with patch("os.path.exists", return_value=False) as mock_exists:
        with patch("asyncio.sleep", return_value=None) as mock_sleep:
            response = client.get(f"/api/upload/preview?filename={filename}&session_id={session_id}")
            assert response.status_code == 404
            assert "Document storage path not found" in response.json()["detail"]
            assert mock_exists.call_count == 3
            assert mock_sleep.call_count == 2

def test_preview_timeout_exhaustion():
    session_id = "session_timeout_exhaust"
    filename = "timeout_exhaust.txt"
    dir_path = f"./data/uploads/{session_id}"
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, filename)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("Timeout Content")
        
    def mock_read(*args, **kwargs):
        import time
        time.sleep(0.05)
        return {"content": "Timeout Content"}
        
    with patch("routes.upload.read_file_sync", side_effect=mock_read):
        with patch("asyncio.sleep", return_value=None) as mock_sleep:
            response = client.get(f"/api/upload/preview?filename={filename}&session_id={session_id}&timeout=0.01")
            assert response.status_code == 408
            assert "Preview request timed out" in response.json()["detail"]
            assert mock_sleep.call_count == 2

def test_preview_timeout_transient_recovery():
    session_id = "session_timeout_transient"
    filename = "timeout_transient.txt"
    dir_path = f"./data/uploads/{session_id}"
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, filename)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("Recovered Content")
        
    call_count = 0
    def mock_read(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            import time
            time.sleep(0.05)
        return {"content": "Recovered Content"}
        
    with patch("routes.upload.read_file_sync", side_effect=mock_read):
        with patch("asyncio.sleep", return_value=None) as mock_sleep:
            response = client.get(f"/api/upload/preview?filename={filename}&session_id={session_id}&timeout=0.01")
            assert response.status_code == 200
            assert response.json()["content"] == "Recovered Content"
            assert call_count == 2
            mock_sleep.assert_called_once()
