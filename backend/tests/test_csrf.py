"""
CSRF Protection Tests — Origin / Referer Validation (Issue #309)

Test strategy:
  - Safe methods (GET, HEAD, OPTIONS) must never be blocked.
  - Mutating requests (POST, PUT, PATCH, DELETE) with:
      * No Origin header           → allowed  (same-origin / non-browser)
      * Valid allowed Origin       → allowed
      * Unknown / attacker Origin  → 403 CSRF rejected
  - Referer header is used as a fallback when Origin is absent.

All tests share a single in-memory SQLite DB (via conftest.py bootstrap).
"""

import tempfile

import pytest
from fastapi.testclient import TestClient

import services.db_service as db
from app import app

# ── shared test DB (same pattern as test_api.py) ─────────────────────────────
_tmp = tempfile.mktemp(suffix="_csrf.db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app, raise_server_exceptions=True)

# Origins that are in the default CORS_ORIGINS / cors_origins list.
VALID_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
]

ATTACKER_ORIGINS = [
    "https://evil.com",
    "http://attacker.local",
    "https://csrf-demo.io",
    "null",  # sandboxed iframes sometimes send "null"
]


# ── Safe methods — always pass regardless of Origin ──────────────────────────

def test_get_no_origin_allowed():
    r = client.get("/api/sessions/")
    assert r.status_code == 200


def test_get_with_attacker_origin_allowed():
    """GET requests must NEVER be blocked — they are read-only."""
    r = client.get("/api/sessions/", headers={"Origin": "https://evil.com"})
    assert r.status_code == 200


def test_options_not_blocked():
    r = client.options("/api/sessions/")
    # FastAPI may return 405 for OPTIONS on routes that don't declare it,
    # but the middleware must not return 403.
    assert r.status_code != 403


# ── Missing Origin — same-origin path, always allowed ────────────────────────

def test_post_no_origin_allowed():
    """No Origin header means same-origin or direct client — not a CSRF vector."""
    r = client.post(
        "/api/sessions/",
        json={"title": "CSRF No-Origin Test"},
    )
    assert r.status_code == 200
    assert "id" in r.json()


def test_delete_no_origin_allowed():
    r_create = client.post("/api/sessions/", json={"title": "To Delete CSRF"})
    sid = r_create.json()["id"]
    r = client.delete(f"/api/sessions/{sid}")
    assert r.status_code == 200


def test_put_no_origin_allowed():
    r = client.put(
        "/api/settings/",
        json={
            "default_model": "llama3",
            "default_language": "en",
            "temperature": 0.7,
            "max_history_turns": 10,
            "rag_top_k": 4,
            "theme": "dark",
        },
    )
    assert r.status_code == 200


def test_patch_no_origin_allowed():
    r_create = client.post("/api/sessions/", json={"title": "Patch Test"})
    sid = r_create.json()["id"]
    r = client.patch(f"/api/sessions/{sid}", json={"title": "Patched"})
    assert r.status_code == 200


# ── Valid Origins — requests from the known frontend must pass ────────────────

@pytest.mark.parametrize("origin", VALID_ORIGINS)
def test_post_valid_origin_allowed(origin):
    r = client.post(
        "/api/sessions/",
        json={"title": f"Valid Origin {origin}"},
        headers={"Origin": origin},
    )
    assert r.status_code == 200, f"Expected 200 for origin={origin}, got {r.status_code}"


# ── Attacker Origins — cross-origin mutations must be blocked (403) ───────────

@pytest.mark.parametrize("origin", ATTACKER_ORIGINS)
def test_post_attacker_origin_blocked(origin):
    r = client.post(
        "/api/sessions/",
        json={"title": "Should be blocked"},
        headers={"Origin": origin},
    )
    assert r.status_code == 403, f"Expected 403 for origin={origin!r}, got {r.status_code}"
    assert "CSRF" in r.json().get("detail", "")


@pytest.mark.parametrize("origin", ATTACKER_ORIGINS)
def test_delete_attacker_origin_blocked(origin):
    # Create a session without origin (allowed), then try to delete it from attacker.
    r_create = client.post("/api/sessions/", json={"title": "Attack target"})
    sid = r_create.json()["id"]
    r = client.delete(f"/api/sessions/{sid}", headers={"Origin": origin})
    assert r.status_code == 403


@pytest.mark.parametrize("origin", ATTACKER_ORIGINS)
def test_put_attacker_origin_blocked(origin):
    r = client.put(
        "/api/settings/",
        json={
            "default_model": "evil",
            "default_language": "en",
            "temperature": 0.0,
            "max_history_turns": 0,
            "rag_top_k": 0,
            "theme": "light",
        },
        headers={"Origin": origin},
    )
    assert r.status_code == 403


@pytest.mark.parametrize("origin", ATTACKER_ORIGINS)
def test_patch_attacker_origin_blocked(origin):
    r_create = client.post("/api/sessions/", json={"title": "Patch target"})
    sid = r_create.json()["id"]
    r = client.patch(
        f"/api/sessions/{sid}",
        json={"title": "Hijacked"},
        headers={"Origin": origin},
    )
    assert r.status_code == 403


# ── Referer fallback — normalised to origin for comparison ───────────────────

def test_post_valid_referer_allowed():
    """Referer is used when Origin is absent; a valid Referer path must pass."""
    r = client.post(
        "/api/sessions/",
        json={"title": "Referer test"},
        headers={"Referer": "http://localhost:3000/some/page"},
    )
    assert r.status_code == 200


def test_post_attacker_referer_blocked():
    """An attacker Referer with no Origin header must still be rejected."""
    r = client.post(
        "/api/sessions/",
        json={"title": "Referer attacker"},
        headers={"Referer": "https://evil.com/csrf-attack"},
    )
    assert r.status_code == 403


# ── Plugin run endpoint ───────────────────────────────────────────────────────

def test_plugin_run_no_origin_allowed():
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "calculator", "input": "1+1"},
    )
    assert r.status_code == 200


def test_plugin_run_attacker_origin_blocked():
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "calculator", "input": "1+1"},
        headers={"Origin": "https://evil.com"},
    )
    assert r.status_code == 403
