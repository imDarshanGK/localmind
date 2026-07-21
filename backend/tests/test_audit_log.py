"""
Tests for Issue #797 — structured JSON audit logging on the upload queue.
"""
import io
import json
import logging
import logging.handlers
import sys
import tempfile
import types
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import services.db_service as db

_tmp = tempfile.mktemp(suffix=".db")
db.DB_PATH = _tmp
db.init_db()

import routes.upload as upload_module
import utils.audit_log as audit_log
from app import app

client = TestClient(app)



@pytest.fixture
def fake_rag_service(monkeypatch):
    """Controls services.rag_service.index_document for these tests.

    process_document_task does `from services import rag_service` lazily.
    Once ANY test in the session (e.g. test_citations.py) has done a real
    `import services.rag_service`, Python caches `rag_service` as an
    attribute on the `services` package object — and `from services import
    rag_service` checks that cached attribute before re-checking
    sys.modules. So swapping sys.modules["services.rag_service"] alone can
    silently be bypassed, letting the real (chromadb-backed) index_document
    run instead of our fake.

    To avoid that, we patch index_document IN PLACE on the real module when
    it's importable (true whenever the full ML dependency stack is
    installed, e.g. in CI). Only when the real module can't even be
    imported (e.g. no chromadb in a stripped-down local sandbox) do we fall
    back to injecting a standalone fake module via sys.modules — sufficient
    there because nothing else in that environment could have imported the
    real one first either.
    """
    try:
        import services.rag_service as real_rag_service
        monkeypatch.setattr(real_rag_service, "index_document", lambda *a, **kw: 5)
        return real_rag_service
    except ImportError:
        fake_module = types.ModuleType("services.rag_service")
        fake_module.index_document = lambda *a, **kw: 5  # default: succeeds with 5 chunks
        monkeypatch.setitem(sys.modules, "services.rag_service", fake_module)
        return fake_module

@pytest.fixture(autouse=True)
def _reset_listener():
    audit_log._stop_listener()
    yield
    audit_log._stop_listener()


@pytest.fixture
def captured_events(monkeypatch):
    events = []

    def fake_emit(event, fields):
        events.append((event, fields))

    monkeypatch.setattr(audit_log, "_safe_emit", fake_emit)
    return events


# --- Formatter / record shape ---------------------------------------------

def test_json_formatter_produces_valid_json_with_expected_fields():
    formatter = audit_log._JsonFormatter()
    record = logging.LogRecord(
        name="audit.upload_queue", level=logging.INFO, pathname=__file__,
        lineno=1, msg="UPLOAD_QUEUED", args=(), exc_info=None,
    )
    record.event = "UPLOAD_QUEUED"
    record.audit_fields = {
        "file_id": 42, "file_size_bytes": 1024, "user_id": "sess-1", "timestamp": "2026-07-20T00:00:00Z",
    }

    line = formatter.format(record)
    parsed = json.loads(line)

    assert parsed["event"] == "UPLOAD_QUEUED"
    assert parsed["file_id"] == 42
    assert parsed["file_size_bytes"] == 1024
    assert parsed["user_id"] == "sess-1"
    assert "logged_at" in parsed


def test_json_formatter_never_raises_on_unserializable_field():
    formatter = audit_log._JsonFormatter()
    record = logging.LogRecord(
        name="audit.upload_queue", level=logging.INFO, pathname=__file__,
        lineno=1, msg="FAILED", args=(), exc_info=None,
    )
    record.event = "FAILED"
    record.audit_fields = {"bad": object()}

    line = formatter.format(record)
    parsed = json.loads(line)
    assert "event" in parsed


# --- Async / non-blocking wiring -------------------------------------------

def test_audit_logger_uses_queue_handler_not_synchronous_handler():
    audit_log._ensure_started()
    handlers = audit_log._audit_logger.handlers
    assert len(handlers) == 1
    assert isinstance(handlers[0], logging.handlers.QueueHandler)


def test_audit_logger_does_not_propagate_to_root():
    assert audit_log._audit_logger.propagate is False


# --- Individual lifecycle hooks ---------------------------------------------

def test_log_upload_queued_fields():
    with patch.object(audit_log, "_safe_emit") as mock_emit:
        audit_log.log_upload_queued(file_id=7, file_size_bytes=2048, user_id="s1")
    event, fields = mock_emit.call_args[0]
    assert event == "UPLOAD_QUEUED"
    assert fields["file_id"] == 7
    assert fields["file_size_bytes"] == 2048
    assert fields["user_id"] == "s1"
    assert "timestamp" in fields


def test_log_processing_fields():
    with patch.object(audit_log, "_safe_emit") as mock_emit:
        audit_log.log_processing(file_id=7, user_id="s1")
    event, fields = mock_emit.call_args[0]
    assert event == "PROCESSING"
    assert fields["file_id"] == 7
    assert fields["user_id"] == "s1"


def test_log_success_fields():
    with patch.object(audit_log, "_safe_emit") as mock_emit:
        audit_log.log_success(file_id=7, user_id="s1", duration_ms=123.456)
    event, fields = mock_emit.call_args[0]
    assert event == "SUCCESS"
    assert fields["duration_ms"] == 123.46


def test_log_failed_fields_include_stack_trace():
    try:
        raise ValueError("boom")
    except ValueError:
        import traceback
        trace = traceback.format_exc()

    with patch.object(audit_log, "_safe_emit") as mock_emit:
        audit_log.log_failed(file_id=7, user_id="s1", duration_ms=5.0, error="boom", stack_trace=trace)
    event, fields = mock_emit.call_args[0]
    assert event == "FAILED"
    assert fields["error"] == "boom"
    assert "ValueError" in fields["stack_trace"]


# --- Safe-hook guarantee: a raising audit call must never break ingestion ---

def test_broken_audit_hook_does_not_break_upload_request(monkeypatch, fake_rag_service):
    monkeypatch.setattr(audit_log, "log_upload_queued", lambda **kw: (_ for _ in ()).throw(RuntimeError("sink down")))

    files = {"file": ("safe.txt", b"hello", "text/plain")}
    r = client.post("/api/upload/", files=files, data={"session_id": "audit-safe-1"})

    assert r.status_code == 200


def test_broken_audit_hook_does_not_break_process_document_task(monkeypatch, fake_rag_service):
    monkeypatch.setattr(audit_log, "log_success", lambda **kw: (_ for _ in ()).throw(RuntimeError("sink down")))
    fake_rag_service.index_document = lambda *a, **kw: 3

    upload_module.process_document_task(doc_id=999999, file_path="/tmp/does-not-matter.txt", session_id="audit-safe-2")


# --- End-to-end lifecycle integration ---------------------------------------

def test_full_upload_lifecycle_emits_all_four_events_on_success(monkeypatch, captured_events, fake_rag_service):
    files = {"file": ("lifecycle.txt", b"hello localmind", "text/plain")}
    r = client.post("/api/upload/", files=files, data={"session_id": "lifecycle-1"})
    assert r.status_code == 200

    event_names = [e for e, _ in captured_events]
    assert event_names == ["UPLOAD_QUEUED", "PROCESSING", "SUCCESS"]

    queued_fields = captured_events[0][1]
    assert queued_fields["user_id"] == "lifecycle-1"
    assert queued_fields["file_size_bytes"] == len(b"hello localmind")

    success_fields = captured_events[2][1]
    assert success_fields["duration_ms"] >= 0
    assert success_fields["file_id"] == queued_fields["file_id"]


def test_full_upload_lifecycle_emits_failed_event_on_processing_error(monkeypatch, captured_events, fake_rag_service):
    def boom(*a, **kw):
        raise RuntimeError("indexing exploded")

    fake_rag_service.index_document = boom

    files = {"file": ("will-fail.txt", b"data", "text/plain")}
    r = client.post("/api/upload/", files=files, data={"session_id": "lifecycle-2"})
    assert r.status_code == 200

    event_names = [e for e, _ in captured_events]
    assert event_names == ["UPLOAD_QUEUED", "PROCESSING", "FAILED"]

    failed_fields = captured_events[2][1]
    assert failed_fields["error"] == "indexing exploded"
    assert "RuntimeError" in failed_fields["stack_trace"]
    assert failed_fields["duration_ms"] >= 0


def test_existing_plain_text_logs_still_emitted(caplog):
    with caplog.at_level(logging.INFO, logger="routes.upload"):
        files = {"file": ("bad.exe", b"data", "application/octet-stream")}
        r = client.post("/api/upload/", files=files, data={"session_id": "log-test-2"})

    assert r.status_code == 400
    messages = [rec.getMessage() for rec in caplog.records]
    assert any("upload_request" in m and "session=log-test-2" in m for m in messages)