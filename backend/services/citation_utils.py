"""
Citation utilities — pure Python helpers with no external dependencies.

Kept separate from rag_service so they can be imported and unit-tested
without triggering the chromadb / sentence-transformers import chain.
"""

from __future__ import annotations

PREVIEW_MAX_CHARS = 300


def build_sources(docs: list[str], metas: list[dict]) -> list[dict]:
    """Build a structured source list from ChromaDB result rows.

    Returns one entry per unique (filename, chunk-index) pair.  Each entry
    carries a short preview of the retrieved text — suitable for inline
    citation display in the frontend.

    Args:
        docs:  Retrieved document chunk texts (parallel with *metas*).
        metas: Metadata dicts from ChromaDB, each expected to have at least
               ``source`` (filename) and ``chunk`` (zero-based index) keys.

    Returns:
        List of dicts with keys: ``source`` (str), ``chunk`` (int),
        ``preview`` (str — up to PREVIEW_MAX_CHARS characters).
    """
    seen: dict[tuple[str, int], dict] = {}
    for doc, meta in zip(docs, metas):
        key = (meta.get("source", "unknown"), meta.get("chunk", 0))
        if key not in seen:
            preview = (
                doc[:PREVIEW_MAX_CHARS] + "..."
                if len(doc) > PREVIEW_MAX_CHARS
                else doc
            )
            seen[key] = {
                "source": meta.get("source", "unknown"),
                "chunk": meta.get("chunk", 0),
                "preview": preview,
            }
    return list(seen.values())
