"""
Integration tests — Health endpoint
=====================================
Verifies that the backend container is alive and returns the
expected health payload.  These tests should always pass and
serve as a sanity check that the stack is up before running
heavier tests.
"""


def test_health_status(client):
    """GET /health should return 200 with status=healthy."""
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "healthy"


def test_root_endpoint(client):
    """
    GET / either serves the frontend index.html (if built) or
    returns the API info JSON — both should be 200.
    """
    r = client.get("/")
    assert r.status_code == 200


def test_openapi_schema_accessible(client):
    """FastAPI's /openapi.json should be reachable (confirms routing is up)."""
    r = client.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    assert "openapi" in schema
    assert "LocalMind" in schema.get("info", {}).get("title", "")
