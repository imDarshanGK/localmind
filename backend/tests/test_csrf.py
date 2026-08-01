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
import time

import pytest
from fastapi.testclient import TestClient

import services.db_service as db
from app import app

# ── shared test DB (same pattern as test_api.py) ─────────────────────────────
_tmp = tempfile.mktemp(suffix="_csrf.db")
db.DB_PATH = _tmp
db.init_db()

client = TestClient(app, raise_server_exceptions=True)

# IP the WSGI TestClient uses (matches what the middleware reads from request.client)
_TESTCLIENT_HOST = "testclient"

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


# ── Prometheus metrics verification ──────────────────────────────────────────

def test_prometheus_metrics():
    from prometheus_client import REGISTRY
    
    # Get current values before the test
    before_skipped = REGISTRY.get_sample_value('csrf_requests_total', {'status': 'skipped_safe_method'}) or 0.0
    before_allowed = REGISTRY.get_sample_value('csrf_requests_total', {'status': 'allowed'}) or 0.0
    before_rejected = REGISTRY.get_sample_value('csrf_requests_total', {'status': 'rejected'}) or 0.0
    before_rejections = REGISTRY.get_sample_value('csrf_rejections_total', {'method': 'POST', 'reason': 'invalid_origin'}) or 0.0
    
    # 1. Trigger a skipped_safe_method
    client.get("/api/sessions/")
    after_skipped = REGISTRY.get_sample_value('csrf_requests_total', {'status': 'skipped_safe_method'}) or 0.0
    assert after_skipped > before_skipped
    
    # 2. Trigger an allowed method
    client.post("/api/sessions/", json={"title": "Metric allowed"})
    after_allowed = REGISTRY.get_sample_value('csrf_requests_total', {'status': 'allowed'}) or 0.0
    assert after_allowed > before_allowed
    
    # 3. Trigger a rejected method
    r = client.post("/api/sessions/", json={"title": "Metric rejected"}, headers={"Origin": "https://evil.com"})
    assert r.status_code == 403
    
    after_rejected = REGISTRY.get_sample_value('csrf_requests_total', {'status': 'rejected'}) or 0.0
    assert after_rejected > before_rejected
    
    after_rejections = REGISTRY.get_sample_value('csrf_rejections_total', {'method': 'POST', 'reason': 'invalid_origin'}) or 0.0
    assert after_rejections > before_rejections

# ── Deduplication helpers & tests ─────────────────────────────────────────────

import middleware.csrf as csrf_module
from middleware.csrf import compute_request_hash

csrf_module._DEDUPE_WINDOW_SECONDS = 60.0

def _compute_hash(method: str, path: str, body_dict: dict) -> str:
    """Thin wrapper around the middleware's ``compute_request_hash``.

    Uses ``httpx.Request`` to serialise *body_dict* into the exact bytes
    the TestClient will send, then delegates to the canonical hash function.
    This guarantees planted sentinels always match the middleware's lookup,
    regardless of httpx version or JSON encoder differences.
    """
    import httpx as _httpx
    req = _httpx.Request(method, f"http://testserver{path}", json=body_dict)
    return compute_request_hash(_TESTCLIENT_HOST, method, path, req.content)


def test_request_deduplication():
    from prometheus_client import REGISTRY
    
    before_dedup = REGISTRY.get_sample_value('csrf_requests_total', {'status': 'deduplicated'}) or 0.0
    
    # 1. Send first request
    payload = {"title": "Dedupe test payload"}
    r1 = client.post("/api/sessions/", json=payload)
    assert r1.status_code == 200
    
    # 2. Send EXACT same request (duplicate)
    r2 = client.post("/api/sessions/", json=payload)
    
    # 3. Should return the exact same cached response
    assert r2.status_code == 200
    assert r2.json() == r1.json()
    
    # 4. Metric should increment
    after_dedup = REGISTRY.get_sample_value('csrf_requests_total', {'status': 'deduplicated'}) or 0.0
    assert after_dedup > before_dedup


# ── In-progress sentinel → 409 ───────────────────────────────────────────────


def test_in_progress_sentinel_returns_409():
    """Exercises the 'deduplicated_in_progress' (409) path.

    Concurrent duplicate detection cannot be tested with the synchronous
    TestClient because each call completes before the next one starts.
    Instead we plant the 'processing' sentinel directly in the DB — exactly
    what the middleware does when it first accepts a request — and then send
    the matching request.  The middleware must see the sentinel and return 409.
    """
    from prometheus_client import REGISTRY

    before = (
        REGISTRY.get_sample_value(
            "csrf_requests_total", {"status": "deduplicated_in_progress"}
        )
        or 0.0
    )

    body = {"title": "In-progress sentinel test"}
    req_hash = _compute_hash("POST", "/api/sessions/", body)

    # Simulate a request already mid-handler by inserting the sentinel with a long expiry for CI.
    db.dedupe_set_processing(req_hash, expires_at=time.time() + 60.0)

    r = client.post("/api/sessions/", json=body)
    assert r.status_code == 409, (
        f"Expected 409 for in-progress request, got {r.status_code}: {r.json()}"
    )
    assert "Duplicate request in progress" in r.json()["detail"]

    # Prometheus counter must have incremented.
    after = (
        REGISTRY.get_sample_value(
            "csrf_requests_total", {"status": "deduplicated_in_progress"}
        )
        or 0.0
    )
    assert after > before, "deduplicated_in_progress counter did not increment"


# ── Startup orphan cleanup ────────────────────────────────────────────────────


def test_orphaned_processing_rows_cleared_on_startup():
    """Verifies dedupe_clear_orphaned_processing() removes stale sentinels.

    Scenario: the server was killed mid-request.  A 'processing' row with a
    future ``expires_at`` is left behind.  Without the startup cleanup this
    row would cause the first legitimate retry (arriving within the 5-second
    window) to receive a false 409.  This test confirms the cleanup runs and
    the subsequent request succeeds normally.
    """
    body = {"title": "Orphan startup test"}
    req_hash = _compute_hash("POST", "/api/sessions/", body)

    # 1. Plant a stale sentinel with a generous future expiry.
    db.dedupe_set_processing(req_hash, expires_at=time.time() + 30.0)

    # 2. Verify it is visible (would produce a false 409 without cleanup).
    cached = db.dedupe_get(req_hash, time.time())
    assert cached is not None and cached["status"] == "processing", (
        "Orphan sentinel was not stored correctly"
    )

    # 3. Run the startup-phase cleanup (same call made in app lifespan()).
    db.dedupe_clear_orphaned_processing()

    # 4. Row must be gone.
    assert db.dedupe_get(req_hash, time.time()) is None, (
        "Orphaned 'processing' row was not removed by dedupe_clear_orphaned_processing()"
    )

    # 5. The matching request must now succeed — no false 409.
    r = client.post("/api/sessions/", json=body)
    assert r.status_code == 200, (
        f"Expected 200 after orphan cleanup, got {r.status_code}: {r.json()}"
    )
    assert "id" in r.json()


# ── Error responses must NOT be cached ─────────────────────────────────────────────


def test_error_response_not_cached_allows_immediate_retry():
    """Verifies that a 4xx response is NOT stored in the deduplication cache.

    If an error were cached, the client would receive a replayed failure for
    the entire 5-second window even after the underlying problem is fixed.
    This test sends a request that returns 422 (Pydantic validation error),
    then sends the exact same request again and confirms it also goes through
    to the handler (not served from cache), and the deduplication sentinel
    has been cleared from the DB.
    """
    # An invalid settings payload triggers a guaranteed 422 from FastAPI/Pydantic.
    bad_payload = {
        "default_model": 999,  # must be str
        "default_language": True,
        "temperature": "hot",  # must be float
        "max_history_turns": "lots",
        "rag_top_k": None,
        "theme": [],
    }

    req_hash = _compute_hash("PUT", "/api/settings/", bad_payload)

    # First request — expect validation error.
    r1 = client.put("/api/settings/", json=bad_payload)
    assert r1.status_code == 422, (
        f"Expected 422 from invalid payload, got {r1.status_code}"
    )

    # The sentinel must have been deleted (not flipped to 'done').
    assert db.dedupe_get(req_hash, time.time()) is None, (
        "Error response was incorrectly persisted to the deduplication cache"
    )

    # Second identical request must also reach the handler (no cached 422 replay).
    r2 = client.put("/api/settings/", json=bad_payload)
    assert r2.status_code == 422, (
        f"Second request expected 422, got {r2.status_code} — error may have been cached"
    )


def test_successful_response_is_still_cached_after_error_guard():
    """Regression: confirms that successful (2xx) responses are still cached
    after the error-guard logic was added."""
    payload = {"title": "Cache regression test"}
    req_hash = _compute_hash("POST", "/api/sessions/", payload)

    # First request.
    r1 = client.post("/api/sessions/", json=payload)
    assert r1.status_code == 200

    # The 'done' entry must now exist in the DB.
    cached = db.dedupe_get(req_hash, time.time())
    assert cached is not None and cached["status"] == "done", (
        "Successful response was not written to the deduplication cache"
    )

    # Second identical request must return the cached response.
    r2 = client.post("/api/sessions/", json=payload)
    assert r2.status_code == 200
    assert r2.json() == r1.json(), "Deduplicated response did not match original"
# ── Failure Recovery Tests ───────────────────────────────────────────────────

from unittest.mock import patch


def test_security_middleware_failure_recovery_on_exception():
    """When an exception occurs during origin verification, middleware returns 500 fail-closed."""
    with patch("middleware.csrf._origin_from_header", side_effect=RuntimeError("Header extraction fault")):
        r = client.post(
            "/api/sessions/",
            json={"title": "Failure recovery test"},
        )
        assert r.status_code == 500
        assert "Security verification error" in r.json().get("detail", "")


def test_security_middleware_failure_recovery_safe_methods():
    """Safe HTTP methods bypass origin processing and succeed even during header faults."""
    with patch("middleware.csrf._origin_from_header", side_effect=RuntimeError("Header extraction fault")):
        r = client.get("/api/sessions/")
        assert r.status_code == 200


