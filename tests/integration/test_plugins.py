"""
Integration tests — Plugin System
===================================
Tests all built-in plugins via the live backend.  Plugins do not
talk to Ollama at all (pure Python computation), so these tests
are fast and deterministic even without the mock-ollama service.

Plugins tested:
  calculator, wordcount, jsonformat, summarizer, coderunner
  (translator is Ollama-backed so tested separately at the end)
"""


# ─── List plugins ────────────────────────────────────────────────────────────

def test_list_plugins_returns_all_builtin(client):
    """GET /api/plugins/ should list at least the 5 built-in plugins."""
    r = client.get("/api/plugins/")
    assert r.status_code == 200
    body = r.json()
    assert "plugins" in body
    plugin_ids = [p["id"] for p in body["plugins"]]
    for expected in ("calculator", "wordcount", "jsonformat", "summarizer", "coderunner"):
        assert expected in plugin_ids, f"Missing plugin: {expected}"


def test_each_plugin_has_required_fields(client):
    """Every plugin descriptor must have id, name, and description."""
    r = client.get("/api/plugins/")
    assert r.status_code == 200
    for plugin in r.json()["plugins"]:
        assert "id" in plugin
        assert "name" in plugin
        assert "description" in plugin


# ─── Calculator ──────────────────────────────────────────────────────────────

def test_calculator_basic_arithmetic(client):
    r = client.post("/api/plugins/run", json={"plugin": "calculator", "input": "2 + 2"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert "4" in body["output"]


def test_calculator_advanced_sqrt(client):
    r = client.post("/api/plugins/run", json={"plugin": "calculator", "input": "sqrt(144)"})
    assert r.status_code == 200
    assert "12" in r.json()["output"]


def test_calculator_floating_point(client):
    r = client.post("/api/plugins/run", json={"plugin": "calculator", "input": "3.14 * 2"})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_calculator_blocks_unsafe_code(client):
    """Dangerous expressions like __import__ must be blocked."""
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "calculator", "input": "__import__('os').system('ls')"},
    )
    assert r.status_code == 200
    body = r.json()
    # Must either mark it as failed or output "Unsafe"
    assert not body["success"] or "Unsafe" in body["output"]


def test_calculator_syntax_error_handled(client):
    """Invalid expressions should be handled without crashing the server."""
    r = client.post("/api/plugins/run", json={"plugin": "calculator", "input": "((("})
    assert r.status_code == 200
    body = r.json()
    # Backend may return success=False with an error, or success=True
    # with an error message in output — both are acceptable as long as
    # the server doesn't crash (status 200).
    assert "output" in body


# ─── Word Counter ─────────────────────────────────────────────────────────────

def test_wordcount_basic(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "wordcount", "input": "hello world foo bar"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert "Words: 4" in body["output"]


def test_wordcount_empty_string(client):
    r = client.post("/api/plugins/run", json={"plugin": "wordcount", "input": ""})
    assert r.status_code == 200
    # Should handle empty gracefully (success or a clear message)
    assert r.json()["success"] is True or "0" in r.json()["output"]


def test_wordcount_reports_characters(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "wordcount", "input": "test"},
    )
    assert r.status_code == 200
    assert "Char" in r.json()["output"]


# ─── JSON Formatter ───────────────────────────────────────────────────────────

def test_jsonformat_valid_json(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "jsonformat", "input": '{"name":"LocalMind","version":2}'},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert '"name"' in body["output"]
    assert '"LocalMind"' in body["output"]


def test_jsonformat_invalid_json_returns_error(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "jsonformat", "input": "not valid json {{{{"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "Invalid" in body["output"] or not body["success"]


def test_jsonformat_nested_object(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "jsonformat", "input": '{"a":{"b":{"c":1}}}'},
    )
    assert r.status_code == 200
    assert r.json()["success"] is True


# ─── Summarizer ───────────────────────────────────────────────────────────────

def test_summarizer_long_text(client):
    long_text = "The quick brown fox jumps over the lazy dog. " * 25
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "summarizer", "input": long_text},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert len(body["output"]) > 0


def test_summarizer_short_text(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "summarizer", "input": "Short."},
    )
    assert r.status_code == 200
    assert r.json()["success"] is True


# ─── Code Runner ──────────────────────────────────────────────────────────────

def test_coderunner_hello_world(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "coderunner", "input": "print('hello world')"},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert "hello world" in body["output"]


def test_coderunner_arithmetic_output(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "coderunner", "input": "print(6 * 7)"},
        timeout=15,
    )
    assert r.status_code == 200
    assert "42" in r.json()["output"]


def test_coderunner_timeout_handled(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "coderunner", "input": "import time\ntime.sleep(10)"},
        timeout=30,
    )
    assert r.status_code == 200
    body = r.json()
    # Backend kills the process after ~5s and reports Timeout
    assert "Timeout" in body["output"] or not body["success"]


# ─── Unknown plugin ───────────────────────────────────────────────────────────

def test_unknown_plugin_returns_400(client):
    r = client.post(
        "/api/plugins/run",
        json={"plugin": "does_not_exist", "input": "test"},
    )
    assert r.status_code == 400
