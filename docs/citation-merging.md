# Citation Merging & RAG Deployment Guidelines

LocalMind processes vector retrieval context matches and constructs structured citation references for inline UI rendering. To maintain optimal payload sizes and prevent duplicate source previews during streaming RAG responses, LocalMind implements **Citation Merging**.

## How Citation Merging Works

When vector search retrieves top context chunks from ChromaDB:
1. **Deduplication by `(source, chunk)`**: Vector matches sharing identical source filenames and chunk indices are merged into a single citation entry.
2. **Text Preview Truncation**: Text excerpts are capped at 300 characters (`PREVIEW_MAX_CHARS = 300`) with `"..."` appended if truncated.
3. **Structured Source Schema**: Pure helper `build_sources()` converts raw document metadata into a structured `SourceChunk` model (`source`, `chunk`, `preview`).
4. **Backward Compatibility**: `ChatMessage.sources` supports both legacy string source lists and structured `SourceChunk` dictionary payloads.

## Implementation Details

The citation merging logic is implemented in a pure Python module decoupled from vector database or embedding model dependencies:

```python
# backend/services/citation_utils.py
from services.citation_utils import build_sources

sources = build_sources(docs, metas)
```

Because `citation_utils.py` contains no heavy C-extensions or external database bindings, tests run instantly in CI/CD and deployment pipelines.

## Pre-Deployment Verification

Include citation merging validation in pre-deployment CI pipelines or manual deployment checklists:

```bash
cd backend
pytest tests/test_citations.py
```

### Build & Deployment Guidelines
- **Payload & Memory Efficiency**: Merging duplicate `(source, chunk)` tuples ensures Server-Sent Events (SSE) stream chunks remain small and avoid unnecessary frontend re-renders.
- **Fast Build Validation**: Run `pytest tests/test_citations.py` prior to build deployment to verify citation deduplication and schema validation without needing an active Ollama or ChromaDB instance.
