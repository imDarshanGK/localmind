"""
conftest.py — Integration test fixtures
========================================
Uses pytest-docker to spin up:
  • mock-ollama   (port 11434) — deterministic HTTP stub
  • backend       (port 8000)  — real FastAPI + ChromaDB + SQLite

Strategy
--------
pytest-docker v3 derives the compose project directory from the
location of the compose file, NOT from docker_compose_files().
We work around this by symlinking / copying compose files to the
integration test directory, OR — the cleanest approach — we run
pytest FROM the repo root and override the compose file list via
the pytest-docker plugin API.

pytest-docker v3.x uses these fixtures to control compose:
  • docker_compose_file           -> list[str | Path]  (the -f flags)
  • docker_compose_project_name   -> str
  • docker_compose_project_directory -> Path  (the --project-directory flag)

The `--project-directory` flag makes docker compose resolve relative
build contexts relative to that directory — which must be the repo root.
"""

import time
from pathlib import Path

import httpx
import pytest

# ── Absolute paths ─────────────────────────────────────────────────────────── #
INTEGRATION_DIR = Path(__file__).resolve().parent        # tests/integration/
REPO_ROOT       = INTEGRATION_DIR.parents[1]             # localmind/
COMPOSE_BASE    = REPO_ROOT / "docker-compose.yml"
COMPOSE_TEST    = INTEGRATION_DIR / "docker-compose.test.yml"

BACKEND_PORT    = 8000
BACKEND_URL     = f"http://localhost:{BACKEND_PORT}"
HEALTH_URL      = f"{BACKEND_URL}/health"

STARTUP_TIMEOUT = 180   # seconds
POLL_INTERVAL   = 3


# ── pytest-docker v3 fixtures ──────────────────────────────────────────────── #

@pytest.fixture(scope="session")
def docker_compose_file(pytestconfig):
    """
    pytest-docker v3 uses this fixture name (singular) and accepts
    a list of compose file paths to pass as multiple -f flags.
    """
    return [str(COMPOSE_BASE), str(COMPOSE_TEST)]


@pytest.fixture(scope="session")
def docker_compose_project_name():
    return "localmind_integration_test"


@pytest.fixture(scope="session")
def docker_compose_project_directory():
    """
    Set the project directory to the repo root so that docker compose
    resolves build contexts (./backend, ./frontend) correctly.
    """
    return REPO_ROOT


# ── Wait for backend health ────────────────────────────────────────────────── #

def _wait_for_backend(timeout: int = STARTUP_TIMEOUT) -> None:
    """Poll /health until 200 OK or raise TimeoutError."""
    deadline = time.time() + timeout
    last_error: Exception | None = None
    print(f"\n[conftest] Waiting up to {timeout}s for backend at {HEALTH_URL} ...")
    while time.time() < deadline:
        try:
            r = httpx.get(HEALTH_URL, timeout=5)
            if r.status_code == 200 and r.json().get("status") == "healthy":
                print("[conftest] Backend is healthy ✓")
                return
        except Exception as exc:
            last_error = exc
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(
        f"Backend did not become healthy within {timeout}s. "
        f"Last error: {last_error}"
    )


# ── Session-scoped stack wrapper ───────────────────────────────────────────── #

@pytest.fixture(scope="session")
def docker_services_started(docker_services):
    """
    Thin wrapper around pytest-docker's `docker_services`.
    Waits for /health before yielding so every test sees a live backend.
    """
    _wait_for_backend()
    yield docker_services


# ── HTTP client ────────────────────────────────────────────────────────────── #

@pytest.fixture(scope="session")
def api_base(docker_services_started) -> str:
    """Base URL of the live backend container."""
    return BACKEND_URL


@pytest.fixture(scope="session")
def client(api_base) -> httpx.Client:
    """
    Session-scoped httpx client.  Generous timeout because RAG indexing
    and first-request model warm-up can be slow.
    """
    with httpx.Client(base_url=api_base, timeout=60.0) as c:
        yield c


# ── Per-test session factory ───────────────────────────────────────────────── #

@pytest.fixture()
def new_session(client) -> dict:
    """
    Create a fresh chat session before each test and DELETE it after.
    Tests that consume this fixture always start with an empty session.
    Includes retry logic for transient Docker networking timeouts.
    """
    last_error = None
    for attempt in range(3):
        try:
            r = client.post(
                "/api/sessions/",
                json={"title": "Integration Test Session", "model": "llama3"},
                timeout=30,
            )
            assert r.status_code == 200, f"Failed to create session: {r.status_code} {r.text}"
            session = r.json()
            yield session
            # Best-effort teardown
            try:
                client.delete(f"/api/sessions/{session['id']}")
            except Exception:
                pass
            return
        except Exception as exc:
            last_error = exc
            import time
            time.sleep(2)
    raise last_error


# ── Sample PDF path ────────────────────────────────────────────────────────── #

@pytest.fixture(scope="session")
def sample_pdf_path() -> Path:
    """Absolute path to the pre-generated integration test PDF fixture."""
    pdf = INTEGRATION_DIR / "fixtures" / "sample.pdf"
    if not pdf.exists():
        # Auto-generate if missing (requires fpdf2 on host)
        import subprocess, sys
        gen_script = INTEGRATION_DIR / "fixtures" / "generate_pdf.py"
        subprocess.run([sys.executable, str(gen_script)], check=True)
    assert pdf.exists(), f"sample.pdf still missing at {pdf}"
    return pdf
