"""
Structured JSON audit logging for the document upload/processing queue.

Issue #797 — emits four lifecycle events (UPLOAD_QUEUED, PROCESSING, SUCCESS,
FAILED) as structured JSON, without ever blocking the calling thread/coroutine
and without ever letting a logging failure crash ingestion.
"""
from __future__ import annotations

import atexit
import json
import logging
import logging.handlers
import os
import queue
import time
from typing import Any

_module_logger = logging.getLogger(__name__)

AUDIT_LOG_DIR = os.getenv("AUDIT_LOG_DIR", "./data/logs")
AUDIT_LOG_FILE = os.path.join(AUDIT_LOG_DIR, "audit.jsonl")

_audit_logger = logging.getLogger("audit.upload_queue")
_audit_logger.propagate = False
_audit_logger.setLevel(logging.INFO)

_listener: logging.handlers.QueueListener | None = None


class _JsonFormatter(logging.Formatter):
    """Renders each LogRecord's `extra` payload (record.audit_fields) as one JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "event": getattr(record, "event", record.getMessage()),
            "logged_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
        }
        payload.update(getattr(record, "audit_fields", {}))
        try:
            return json.dumps(payload, default=str)
        except (TypeError, ValueError):
            return json.dumps({"event": payload.get("event", "unknown"), "serialization_error": True})


def _build_listener() -> logging.handlers.QueueListener:
    """Wires up the real (blocking) handlers that run only on the background listener thread."""
    handlers: list[logging.Handler] = []

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(_JsonFormatter())
    handlers.append(stream_handler)

    try:
        os.makedirs(AUDIT_LOG_DIR, exist_ok=True)
        file_handler = logging.FileHandler(AUDIT_LOG_FILE, encoding="utf-8")
        file_handler.setFormatter(_JsonFormatter())
        handlers.append(file_handler)
    except OSError as e:
        _module_logger.warning("audit_log_file_unavailable path=%s error=%s", AUDIT_LOG_FILE, e)

    log_queue: queue.Queue = queue.Queue(-1)
    queue_handler = logging.handlers.QueueHandler(log_queue)
    _audit_logger.handlers = [queue_handler]

    listener = logging.handlers.QueueListener(log_queue, *handlers, respect_handler_level=True)
    listener.start()
    return listener


def _ensure_started() -> None:
    global _listener
    if _listener is None:
        _listener = _build_listener()
        atexit.register(_stop_listener)


def _stop_listener() -> None:
    global _listener
    if _listener is not None:
        try:
            _listener.stop()
        except Exception:
            pass
        _listener = None


def _safe_emit(event: str, fields: dict[str, Any]) -> None:
    """Enqueue one audit record. Never raises — logging failures must never break ingestion."""
    try:
        _ensure_started()
        _audit_logger.info(event, extra={"event": event, "audit_fields": fields})
    except Exception as e:
        _module_logger.warning("audit_log_emit_failed event=%s error=%s", event, e)


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# --- Public lifecycle API -------------------------------------------------

def log_upload_queued(*, file_id: Any, file_size_bytes: int, user_id: str) -> None:
    _safe_emit(
        "UPLOAD_QUEUED",
        {
            "file_id": file_id,
            "file_size_bytes": file_size_bytes,
            "user_id": user_id,
            "timestamp": _now_iso(),
        },
    )


def log_processing(*, file_id: Any, user_id: str) -> None:
    _safe_emit(
        "PROCESSING",
        {
            "file_id": file_id,
            "user_id": user_id,
            "timestamp": _now_iso(),
        },
    )


def log_success(*, file_id: Any, user_id: str, duration_ms: float) -> None:
    _safe_emit(
        "SUCCESS",
        {
            "file_id": file_id,
            "user_id": user_id,
            "duration_ms": round(duration_ms, 2),
            "timestamp": _now_iso(),
        },
    )


def log_failed(*, file_id: Any, user_id: str, duration_ms: float, error: str, stack_trace: str) -> None:
    _safe_emit(
        "FAILED",
        {
            "file_id": file_id,
            "user_id": user_id,
            "duration_ms": round(duration_ms, 2),
            "error": error,
            "stack_trace": stack_trace,
            "timestamp": _now_iso(),
        },
    )