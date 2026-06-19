"""
Integration tests — Export endpoint
=====================================
Tests all three export formats (JSON, Markdown, TXT) after seeding
a session with messages through the real chat API (backed by mock-ollama).
"""

import json as json_mod


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _seed_messages(client, session_id: str, count: int = 2) -> None:
    """Send `count` messages into a session to populate history."""
    for i in range(count):
        client.post(
            "/api/chat/",
            json={
                "message": f"Integration test message number {i + 1}.",
                "session_id": session_id,
                "model": "llama3",
                "use_documents": False,
            },
            timeout=30,
        )


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_export_json_structure(client, new_session):
    """JSON export must contain session metadata and a messages list."""
    sid = new_session["id"]
    _seed_messages(client, sid)

    r = client.get(f"/api/export/{sid}/json", timeout=20)
    assert r.status_code == 200

    data = json_mod.loads(r.content)
    assert "session" in data
    assert "messages" in data
    assert isinstance(data["messages"], list)
    assert len(data["messages"]) >= 2


def test_export_json_message_fields(client, new_session):
    """Each message in the JSON export should have role and content fields."""
    sid = new_session["id"]
    _seed_messages(client, sid, count=1)

    r = client.get(f"/api/export/{sid}/json", timeout=20)
    assert r.status_code == 200

    data = json_mod.loads(r.content)
    for msg in data["messages"]:
        assert "role" in msg
        assert "content" in msg
        assert msg["role"] in ("user", "assistant", "system")


def test_export_markdown_contains_messages(client, new_session):
    """Markdown export must contain the user message text."""
    sid = new_session["id"]
    unique_text = "unique_export_test_phrase_xyz_789"
    client.post(
        "/api/chat/",
        json={
            "message": unique_text,
            "session_id": sid,
            "model": "llama3",
            "use_documents": False,
        },
        timeout=30,
    )

    r = client.get(f"/api/export/{sid}/markdown", timeout=20)
    assert r.status_code == 200
    assert unique_text.encode() in r.content


def test_export_markdown_has_markdown_syntax(client, new_session):
    """Markdown export should contain markdown headings or bullet markers."""
    sid = new_session["id"]
    _seed_messages(client, sid)

    r = client.get(f"/api/export/{sid}/markdown", timeout=20)
    assert r.status_code == 200
    content = r.content.decode("utf-8", errors="replace")
    # Must contain at least some markdown indicator
    has_md = any(marker in content for marker in ["#", "**", "---", ">"])
    assert has_md, f"Expected markdown syntax in export but got: {content[:200]!r}"


def test_export_txt_is_plain_text(client, new_session):
    """TXT export should contain the message text as plain readable content."""
    sid = new_session["id"]
    unique_text = "plaintext_export_marker_abc_123"
    client.post(
        "/api/chat/",
        json={
            "message": unique_text,
            "session_id": sid,
            "model": "llama3",
            "use_documents": False,
        },
        timeout=30,
    )

    r = client.get(f"/api/export/{sid}/txt", timeout=20)
    assert r.status_code == 200
    assert unique_text.encode() in r.content


def test_export_nonexistent_session_returns_404(client):
    """Exporting a session that does not exist should return 404."""
    r = client.get("/api/export/no-such-session/json", timeout=10)
    assert r.status_code == 404


def test_all_export_formats_available(client, new_session):
    """All three formats should return 200 for a session with messages."""
    sid = new_session["id"]
    _seed_messages(client, sid)

    for fmt in ("json", "markdown", "txt"):
        r = client.get(f"/api/export/{sid}/{fmt}", timeout=20)
        assert r.status_code == 200, f"Export format {fmt!r} failed: {r.text}"
