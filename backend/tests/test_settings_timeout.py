"""Timeout regression tests for settings routes."""

import tempfile
import time
import types
import sys

import pytest
from fastapi.testclient import TestClient

import services.db_service as db
from app import app

_tmp = tempfile.mktemp(suffix=".db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app)


@pytest.fixture
def patched_settings_get_timeout(monkeypatch):
    def _slow_get_settings():
        time.sleep(0.05)
        return {"default_model": "llama3"}

    try:
        import routes.settings as real_settings

        monkeypatch.setattr(real_settings, "SETTINGS_API_TIMEOUT_SECONDS", 0.01)
        monkeypatch.setattr(real_settings, "get_settings", _slow_get_settings)
        return real_settings
    except ImportError:
        fake_module = types.ModuleType("routes.settings")
        fake_module.SETTINGS_API_TIMEOUT_SECONDS = 0.01
        fake_module.get_settings = _slow_get_settings
        monkeypatch.setitem(sys.modules, "routes.settings", fake_module)
        return fake_module


@pytest.fixture
def patched_settings_save_timeout(monkeypatch):
    def _slow_save_setting(key, value):
        time.sleep(0.05)

    try:
        import routes.settings as real_settings

        monkeypatch.setattr(real_settings, "SETTINGS_API_TIMEOUT_SECONDS", 0.01)
        monkeypatch.setattr(real_settings, "save_setting", _slow_save_setting)
        return real_settings
    except ImportError:
        fake_module = types.ModuleType("routes.settings")
        fake_module.SETTINGS_API_TIMEOUT_SECONDS = 0.01
        fake_module.save_setting = _slow_save_setting
        monkeypatch.setitem(sys.modules, "routes.settings", fake_module)
        return fake_module


def test_get_settings_timeout_returns_504(patched_settings_get_timeout):
    response = client.get("/api/settings/")
    assert response.status_code == 504
    assert "timed out" in response.json()["detail"]


def test_save_settings_timeout_returns_504(patched_settings_save_timeout, monkeypatch):
    import routes.settings as settings_route

    monkeypatch.setattr(settings_route, "get_settings", lambda: {"default_model": "llama3"})

    response = client.put(
        "/api/settings/",
        json={
            "default_model": "mistral",
            "default_language": "hi",
            "temperature": 0.5,
            "max_history_turns": 8,
            "rag_top_k": 3,
            "rag_chunk_overlap": 50,
            "theme": "dark",
            "minimal_mode": False,
        },
    )
    assert response.status_code == 504
    assert "timed out" in response.json()["detail"]


def test_update_single_setting_timeout_returns_504(patched_settings_save_timeout):
    response = client.put("/api/settings/default_model", json={"value": "mistral"})
    assert response.status_code == 504
    assert "timed out" in response.json()["detail"]
