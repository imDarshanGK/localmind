# Build & Deployment Guide

This guide outlines building, deploying, and tuning LocalMind for optimal performance.

## Quick Start

### Backend Deployment

```bash
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000
```

### Frontend Deployment

```bash
cd frontend
npm run build
```

---

## Chunking Tuning

LocalMind processes documents by splitting text into discrete chunks before embedding and indexing into ChromaDB. Two main parameters control chunking behavior:

- **`rag_chunk_size`**: Maximum size of each text chunk (in characters). Default: `600`. Allowed range: `100` – `2000`.
- **`rag_chunk_overlap`**: Number of overlapping characters between consecutive chunks. Default: `50`. Allowed range: `0` – `200`.

### Tuning Recommendations

| Document Type / Use Case | `rag_chunk_size` | `rag_chunk_overlap` | Rationale |
|--------------------------|------------------|----------------------|-----------|
| **General Text & Articles** | `600` (Default) | `50` (Default) | Balanced contextual depth and retrieval precision. |
| **Long Form & Research** | `800` – `1200` | `100` | Preserves extended paragraphs and structural context. |
| **Code Snippets & Technical Logs** | `300` – `500` | `50` – `100` | Finer granularity prevents mixing separate code blocks/functions. |
| **Dense Data & QA Datasets** | `400` – `600` | `100` | High overlap ensures boundary information isn't split across chunks. |

### Configuring Chunking Parameters

1. **Via UI Settings Panel**: Open **Settings** in the LocalMind UI and adjust the **RAG Chunk Size** and **RAG Chunk Overlap** sliders. Save settings to persist values.
2. **Via REST API**: Update settings dynamically via `PUT /api/settings/`:
   ```json
   {
     "rag_chunk_size": 800,
     "rag_chunk_overlap": 100
   }
   ```
3. **Environment / First Run Setup**: Settings are stored in the SQLite `app_settings` database table and loaded dynamically on document indexing.

---

## Verification & Testing

Before deploying updates to production, run the test suite:

```bash
# Backend tests
cd backend && pytest tests/ -v

# Frontend tests
cd frontend && npm test
```
