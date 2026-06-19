"""
Integration tests — Session CRUD lifecycle
==========================================
Tests the full session management flow against the live stack:
  create → list → get → update (rename) → messages → clear → delete
"""

import pytest


# ─── Create ─────────────────────────────────────────────────────────────────

def test_create_session_returns_id(client):
    r = client.post("/api/sessions/", json={"title": "My First Chat", "model": "llama3"})
    assert r.status_code == 200
    body = r.json()
    assert "id" in body
    assert body["title"] == "My First Chat"
    assert body["model"] == "llama3"
    # Cleanup
    client.delete(f"/api/sessions/{body['id']}")


def test_create_session_default_title(client):
    r = client.post("/api/sessions/", json={})
    assert r.status_code == 200
    body = r.json()
    assert "id" in body
    client.delete(f"/api/sessions/{body['id']}")


# ─── List ────────────────────────────────────────────────────────────────────

def test_list_sessions_returns_list(client):
    r = client.get("/api/sessions/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_created_session_appears_in_list(client, new_session):
    r = client.get("/api/sessions/")
    assert r.status_code == 200
    ids = [s["id"] for s in r.json()]
    assert new_session["id"] in ids


# ─── Get single session ───────────────────────────────────────────────────────

def test_get_session_not_found(client):
    r = client.get("/api/sessions/nonexistent-session-id")
    assert r.status_code == 404


def test_get_session_messages_initially_empty(client, new_session):
    sid = new_session["id"]
    r = client.get(f"/api/sessions/{sid}/messages")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 0
    assert body["messages"] == []


# ─── Update (rename) ─────────────────────────────────────────────────────────

def test_rename_session(client, new_session):
    sid = new_session["id"]
    r = client.patch(f"/api/sessions/{sid}", json={"title": "Renamed Chat"})
    assert r.status_code == 200
    assert r.json()["title"] == "Renamed Chat"


def test_update_session_not_found(client):
    r = client.patch("/api/sessions/does-not-exist", json={"title": "x"})
    # Backend may return 404 or 200 with null — both are acceptable
    assert r.status_code in (404, 200)


# ─── Messages — clear ────────────────────────────────────────────────────────

def test_clear_session_messages(client, new_session):
    sid = new_session["id"]
    # There are no messages; clearing should still succeed
    r = client.delete(f"/api/sessions/{sid}/messages")
    assert r.status_code == 200


# ─── Delete ──────────────────────────────────────────────────────────────────

def test_delete_session(client):
    # Create a throwaway session and delete it
    r = client.post("/api/sessions/", json={"title": "Delete Me"})
    assert r.status_code == 200
    sid = r.json()["id"]

    r2 = client.delete(f"/api/sessions/{sid}")
    assert r2.status_code == 200

    # Confirm it is gone
    r3 = client.get("/api/sessions/")
    ids = [s["id"] for s in r3.json()]
    assert sid not in ids


def test_delete_nonexistent_session(client):
    r = client.delete("/api/sessions/no-such-session")
    # 200 or 404 both acceptable; must not crash
    assert r.status_code in (200, 404)


# ─── Clear all sessions ───────────────────────────────────────────────────────

def test_clear_all_sessions_and_verify_empty(client):
    # Seed a couple of sessions
    ids = []
    for i in range(2):
        r = client.post("/api/sessions/", json={"title": f"Bulk {i}"})
        assert r.status_code == 200
        ids.append(r.json()["id"])

    r = client.delete("/api/sessions/")
    assert r.status_code == 200
    assert r.json() == {"message": "All sessions cleared"}

    r2 = client.get("/api/sessions/")
    assert r2.status_code == 200
    assert len(r2.json()) == 0
