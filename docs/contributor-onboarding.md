# Contributor Onboarding Guide

Welcome! This guide helps new maintainers and contributors get productive with LocalMind.

---

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   React      │────▶│   FastAPI     │────▶│   Ollama     │
│   Frontend   │     │   Backend     │     │   LLM        │
│   :3000      │     │   :8000       │     │   :11434     │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────▼───────┐
                     │  ChromaDB    │
                     │  Vector Store│
                     └──────────────┘
```

**Key directories:**
| Path | Purpose |
|------|---------|
| `backend/` | FastAPI server, RAG pipeline, document processing |
| `frontend/` | React app (Vite + Tailwind) |
| `docs/` | Documentation |
| `scripts/` | Utility scripts |
| `tests/` | Test suite |

---

## Local Development Setup

```bash
# 1. Clone
git clone https://github.com/imDarshanGK/localmind.git
cd localmind

# 2. Backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # includes pytest, ruff, mypy

# 3. Frontend
cd frontend
npm install

# 4. Ollama
ollama pull llama3.2
ollama pull nomic-embed-text

# 5. Run
# Terminal 1: Backend
uvicorn backend.main:app --reload
# Terminal 2: Frontend
cd frontend && npm run dev
```

---

## PR Checklist

Before submitting a PR, verify:

- [ ] **Code quality:** `ruff check . && mypy backend/`
- [ ] **Tests pass:** `pytest tests/ -v`
- [ ] **Frontend lint:** `cd frontend && npm run lint`
- [ ] **No console.log:** Remove debug prints
- [ ] **Type hints:** All new Python functions have type annotations
- [ ] **Documentation:** Update relevant docs if API changes
- [ ] **Commit style:** Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)
- [ ] **Branch:** Target `main` branch

### Commit Convention

```
feat: add streaming cancellation support
fix: handle empty document upload gracefully  
docs: update troubleshooting guide
refactor: extract embedding logic to service layer
test: add unit tests for document parser
```

---

## Testing

```bash
# All tests
pytest tests/ -v

# Specific test file
pytest tests/test_document_parser.py -v

# With coverage
pytest tests/ --cov=backend --cov-report=html

# Frontend tests
cd frontend && npx vitest run
```

---

## Common Dev Tasks

### Adding a new document format

1. Add parser in `backend/parsers/`
2. Register in `backend/document_loader.py`
3. Add tests in `tests/test_parsers/`
4. Update `README.md` supported formats table

### Adding a new LLM model

1. Add model config in `backend/models/config.py`
2. Test with `python scripts/test_model.py --model <name>`
3. Update model recommendations in docs

### Updating dependencies

```bash
# Backend
pip-compile requirements.in   # if using pip-tools
# Frontend
cd frontend && npm update
npm audit fix
```

---

## Release Process

1. Bump version in `backend/__init__.py` and `frontend/package.json`
2. Update CHANGELOG.md
3. Create and push tag: `git tag v2.x.x && git push --tags`
4. GitHub Actions builds and publishes release automatically
5. Announce in Discord `#releases` channel
