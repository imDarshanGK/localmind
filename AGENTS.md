# AGENTS.md — LocalMind v2.0

## What is this

Offline AI assistant. Chat with your documents privately using local LLMs (Ollama).
Backend: Python 3.11 + FastAPI. Frontend: React 18 + Vite + Tailwind. DB: SQLite.
RAG via LangChain + ChromaDB + sentence-transformers. Streaming via SSE.

## Quick commands

```bash
# Backend dev server (from repo root)
cd backend && uvicorn app:app --reload --port 8000

# Frontend dev server (new terminal, proxies /api to backend)
cd frontend && npm run dev   # runs on http://localhost:3000

# Run all backend tests (mocks Ollama — does NOT need Ollama running)
cd backend && pytest tests/ -v

# Docker (builds both, frontend on 3000, backend on 8000)
docker compose up

# Warmup embeddings cache (first-time setup, run inside backend venv)
cd backend && python warmup.py
```

## Architecture

- `backend/app.py` — FastAPI entrypoint, mounts routes, lifespan creates data dirs + inits DB
- `backend/routes/` — one file per domain (chat, sessions, upload, models, plugins, export, settings, prompt_templates)
- `backend/services/` — ollama_service (LLM calls + streaming), rag_service (ChromaDB retrieval), db_service (SQLite CRUD)
- `backend/models/schemas.py` — Pydantic v2 request/response models
- `backend/middleware/csrf.py` — Origin validation middleware (rejects state-changing requests with unknown Origin)
- `backend/utils/` — retry decorator (`with_retry`) and TTL cache (`TTLCache`)
- `frontend/src/App.jsx` — root component, state + routing
- `frontend/src/utils/api.js` — all backend API calls centralized here
- `frontend/vite.config.js` — dev server on port 3000, proxies `/api` to `localhost:8000`

## Testing

- Tests live in `backend/tests/`. `conftest.py` adds `backend/` to `sys.path`.
- Tests use `fastapi.testclient.TestClient` with a temp SQLite DB (monkey-patched `DB_PATH`).
- Ollama and RAG are mocked via `unittest.mock.patch` — **tests do NOT require Ollama or a running backend**.
- Run a single test file: `cd backend && pytest tests/test_api.py -v`
- Run a single test: `cd backend && pytest tests/test_api.py::test_health -v`

## Gotchas

- **Ollama must be running** for the real app (`ollama serve`, then `ollama pull llama3`). Tests don't need it.
- **CSRF middleware** checks `Origin` header on POST/PUT/PATCH/DELETE. `CORS_ORIGINS` env var controls the allowlist. Same-origin and curl requests (no Origin header) are allowed through.
- **SQLite WAL mode** is used with retry-on-lock. Concurrent writes may hit brief locks — this is by design.
- **Vite proxy**: in dev, the frontend proxies `/api` to `localhost:8000`. In Docker/production, nginx proxies `/api/` to `backend:8000`.
- **Two requirements files**: `requirements.txt` (full) and `requirements_fixed.txt` (trimmed). Use `requirements.txt`.
- **Frontend has no test runner configured** — `package.json` has no test script. Only backend has tests.

## Conventions

- Python: PEP 8, type hints, docstrings. Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`).
- React: functional components + hooks, `.jsx` extension, Tailwind for styling.
- All API calls go through `frontend/src/utils/api.js` — don't fetch directly in components.
- Session IDs are client-generated UUIDs (not server-side auto-increment).
- Streaming responses use SSE (`data: {json}\n\n` format) via `StreamingResponse`.
