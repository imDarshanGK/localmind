# RAG chunking tuning (issue #932)

The RAG `RecursiveCharacterTextSplitter` configuration is now tunable at
runtime via the **App Settings** panel and the `/api/settings` endpoint:

| Setting             | Schema default | Validation bounds         |
| ------------------- | -------------- | ------------------------- |
| `rag_chunk_size`    | 600            | 200 – 2000 (inclusive)    |
| `rag_chunk_overlap` | 50             | 0 – 200 (inclusive) **and** strictly less than `rag_chunk_size` |

The bounds match the langchain `RecursiveCharacterTextSplitter`
behaviour: small chunks (~200) preserve fine-grained retrieval at the
cost of more chunks and larger embeddings index, large chunks (~2000)
squeeze more context into one shot but cost more on the local
sentence-transformers embedder and on the SQLite pagination layer.

## API

```http
PUT /api/settings/
Content-Type: application/json

{
  "default_model": "llama3",
  "rag_chunk_size": 1200,
  "rag_chunk_overlap": 100,
  ...
}
```

422 responses carry a JSON `detail` array. The bounds-check rejections
include the offending field in `loc` and the valid range in `msg`.

## CLI tooling

A small offline experimenter lives at `scripts/chunk_tuner.py`. It lets
a maintainer or contributor try different `(chunk_size, chunk_overlap)`
combinations against a sample file without spinning up the FastAPI app,
Ollama, or ChromaDB:

```bash
# Run on a real repo doc and inspect chunk geometry.
python scripts/chunk_tuner.py --chunk-size 300 --chunk-overlap 30 --plain docs/csrf-protection.md

# JSON output for diffing.
python scripts/chunk_tuner.py --chunk-size 600 --chunk-overlap 50 docs/x.md > before.json
python scripts/chunk_tuner.py --chunk-size 200 --chunk-overlap 0   docs/x.md > after.json
diff before.json after.json
```

The CLI enforces the same bounds as the API endpoint (200..2000 for
`--chunk-size`, 0..200 for `--chunk-overlap`, `--chunk-overlap <
--chunk-size`), so a `--chunk-size` chosen in the CLI corresponds to a
valid runtime setting.

## Tests

```bash
cd backend
pytest tests/test_chunking_tuning.py -v
```

23 cases cover:

- **Schema** — `AppSettings.rag_chunk_size` defaults to 600 and round-trips through `model_dump()`.
- **API validation** — boundaries (200/2000), cross-check (overlap ≥ chunk_size rejected), standalone bounds for `rag_chunk_overlap`.
- **Service** — `index_document()` reads `rag_chunk_size` from `db_service.get_settings()` at call-time, falls back to 600 when missing, clamps out-of-range DB rows, and falls back to default when an unexpected non-integer is stored.
- **Splitter** — direct `RecursiveCharacterTextSplitter` tests at multiple (chunk_size, overlap) combinations: smaller chunks yield more chunks, zero-overlap yields non-overlapping chunks, non-zero overlap produces shared boundary substrings when separators don't absorb it, empty content yields 0 chunks, single-short-paragraph content yields 1 chunk, separators align when paragraphs are separated by `\n\n`.
- **CLI tooling** — `scripts/chunk_tuner.py` runs as both an importable module (via `module.tune(...)`) and as a subprocess CLI (`python chunk_tuner.py ... <file>`).

## Issue

Resolves [issue #932](https://github.com/imDarshanGK/localmind/issues/932) — *"Add chunking tuning to tests and tooling"*.
