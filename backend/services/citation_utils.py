"""
Citation utilities — pure Python helpers with no external dependencies.

Kept separate from rag_service so they can be imported and unit-tested
without triggering the chromadb / sentence-transformers import chain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

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
                doc[:PREVIEW_MAX_CHARS] + "..." if len(doc) > PREVIEW_MAX_CHARS else doc
            )
            seen[key] = {
                "source": meta.get("source", "unknown"),
                "chunk": meta.get("chunk", 0),
                "preview": preview,
            }
    return list(seen.values())


# ---------------------------------------------------------------------------
# Citation merging (issue #934)
# ---------------------------------------------------------------------------


# Default score-merge strategy: arithmetic mean. Exposed so callers can swap
# in another commutative Associative[Score, Score] -> Score with no internal
# mutation of the inputs.
def default_score_merger(scores: list[float]) -> float:
    """Return the arithmetic mean of a non-empty list of scores.

    A None score contributes 0.0 to both sum and count. This mirrors the
    behaviour of `rank_sources` (issue #933), where missing relevance
    collapses to a neutral default rather than penalising the merge.
    """
    if not scores:
        return 0.0
    total = 0.0
    count = 0
    for s in scores:
        if s is None:
            continue
        try:
            total += float(s)
            count += 1
        except (TypeError, ValueError):
            continue
    return total / count if count else 0.0


def default_preview_merger(previews: list[str]) -> str:
    """Pick the longest preview, breaking ties by earliest-seen order.

    Rationale: when the same logical source is cited by two retrieval
    batches, the longer preview rarely loses information.
    """
    best = ""
    for p in previews:
        if p is None:
            continue
        try:
            text = str(p)
        except Exception:
            continue
        if len(text) > len(best):
            best = text
    return best


def _normalise_source_entry(entry: Any) -> dict:
    """Coerce arbitrary input into a citation-utils shaped dict.

    Accepts:
      - dict (preferred shape) — shallow-copied so call-site mutates are
        isolated.
      - str (legacy shape) — promoted to {"source": str, "chunk": 0}.
    Anything else falls back to {"source": "unknown", "chunk": 0}.
    """
    if isinstance(entry, dict):
        normalised = dict(entry)
        # Coerce "chunk" to int — matches `_merge_key` semantics so that
        # downstream callers never see a non-int chunk on a normalized
        # citation entry.
        raw_chunk = normalised.get("chunk", 0)
        try:
            normalised["chunk"] = int(raw_chunk)
        except (TypeError, ValueError):
            normalised["chunk"] = 0
        return normalised
    if isinstance(entry, str):
        return {"source": entry, "chunk": 0}
    return {"source": "unknown", "chunk": 0}


def _merge_key(source: dict) -> tuple:
    """Return the dedupe key for a source dict.

    Prefer (source, chunk) — the canonical primary key. Fall back to
    ("unknown", 0) so malformed entries still merge together instead
    of producing duplicates.
    """
    name = str(source.get("source", "unknown"))
    try:
        chunk = int(source.get("chunk", 0))
    except (TypeError, ValueError):
        chunk = 0
    return (name, chunk)


@dataclass
class MergeResult:
    """Result of `merge_citations` — the merged list + provenance audit.

    `merged` is the canonical citation list. `sources` / `dedupe_keys`
    preserve which input lists contributed which citation so a
    reviewer can audit conflicts.
    """

    merged: list[dict] = field(default_factory=list)
    duplicates: list[dict] = field(default_factory=list)
    contributed_by: dict[tuple, list[int]] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "merged": self.merged,
            "duplicates": self.duplicates,
            "contributed_by": {
                f"{k[0]}#{k[1]}": v for k, v in self.contributed_by.items()
            },
        }


def merge_citations(
    *citation_lists: list[dict] | list[str] | list,
    score_merger: Callable[[list[float]], float] = default_score_merger,
    preview_merger: Callable[[list[str]], str] = default_preview_merger,
    scores: list[list[float] | None] | None = None,
) -> MergeResult:
    """Merge multiple citation lists, deduplicating by (source, chunk).

    Inputs may be:
      - lists of citation dicts (canonical shape from `build_sources`)
      - lists of strings (legacy compatibility path)
      - mixed (each list independently can contain either shape)

    For each unique (source, chunk) the merged entry has:
      - `source`, `chunk`: from the first contributing entry (deterministic)
      - `preview`: `preview_merger` over all contributed previews
      - `occurrence_count`: total number of times the citation was seen
      - `score`: `score_merger` over all non-None contributed scores
      - `contributors`: indices of input lists that contained this citation

    Conflict policy: the FIRST-seen entry wins structural fields ("source",
    "chunk"). "preview" is chosen by the configurable preview merger
    (longest-wins by default). "score" is averaged. Other ad-hoc keys on
    the source dicts are preserved from the first contributor only.

    Args:
      citation_lists:  variadic; each positional argument is one citation
                       list. Passing zero lists yields an empty result.
      score_merger:    callable for combining per-list scores into one.
      preview_merger:  callable for combining per-list previews into one.
      scores:          optional parallel list of per-list score vectors.
                       None entries skip score contribution for that list.
                       Length must equal len(citation_lists) — if shorter,
                       missing lists are treated as None.

    Returns:
      MergeResult dataclass with `.merged` (list of dicts, order: first-
      seen across the input lists), `.duplicates` (audit: entries that
      were dropped), and `.contributed_by` (mapping dedupe-key → list of
      input-list indices).
    """
    # Defensive copy of `scores` to avoid caller mutation surprises; pad
    # with None to match the number of input lists.
    if scores is None:
        scores_list: list[list[float] | None] = [None] * len(citation_lists)
    else:
        scores_list = list(scores)
        if len(scores_list) < len(citation_lists):
            scores_list.extend([None] * (len(citation_lists) - len(scores_list)))

    merged: dict[tuple, dict] = {}
    contributed_by: dict[tuple, list[int]] = {}
    duplicates: list[dict] = []

    for list_idx, raw_list in enumerate(citation_lists):
        if not isinstance(raw_list, list):
            continue
        per_list_scores = scores_list[list_idx]
        for entry_idx, raw_entry in enumerate(raw_list):
            source = _normalise_source_entry(raw_entry)
            key = _merge_key(source)
            if key in merged:
                # Duplicate path: aggregate counters + previews + scores.
                existing = merged[key]
                existing["occurrence_count"] = (
                    int(existing.get("occurrence_count", 1)) + 1
                )
                existing.setdefault("contributors", []).append(list_idx)
                contributed_by.setdefault(key, [list_idx]).append(list_idx)

                # Merge preview via callable.
                p_collection = [
                    existing.get("preview", ""),
                    source.get("preview", ""),
                ]
                if p_collection[1]:
                    existing["preview"] = preview_merger(p_collection)
                else:
                    if not existing.get("preview"):
                        existing["preview"] = ""

                # Merge score via callable.
                if per_list_scores is not None and entry_idx < len(per_list_scores):
                    incoming = per_list_scores[entry_idx]
                    prev_score = existing.get("score")
                    if prev_score is None:
                        existing["score"] = float(incoming)
                    else:
                        existing["score"] = score_merger(
                            [float(prev_score), float(incoming)]
                        )
                duplicates.append(
                    {
                        "list_idx": list_idx,
                        "entry_idx": entry_idx,
                        "key": key,
                        "merged_into": key,
                    }
                )
                continue

            # New-path entry: clone fields defensively.
            merged_entry = dict(source)
            merged_entry["occurrence_count"] = 1
            merged_entry["contributors"] = [list_idx]
            # Score assignment if available.
            if per_list_scores is not None and entry_idx < len(per_list_scores):
                try:
                    merged_entry["score"] = float(per_list_scores[entry_idx])
                except (TypeError, ValueError):
                    merged_entry["score"] = 0.0
            else:
                # Inherit score already on the dict if present, else None.
                if "score" in merged_entry:
                    try:
                        merged_entry["score"] = float(merged_entry["score"])
                    except (TypeError, ValueError):
                        merged_entry["score"] = None
                # If no score anywhere, no score key added (cleaner output
                # for the legacy-string path that has no notion of score).

            # Ensure preview key always exists (downstream code checks
            # `preview in s`).
            merged_entry.setdefault("preview", source.get("preview", ""))
            merged[key] = merged_entry
            contributed_by[key] = [list_idx]

    return MergeResult(
        merged=list(merged.values()),
        duplicates=duplicates,
        contributed_by=contributed_by,
    )


def normalize_citations(citations: list[dict] | list[str]) -> list[dict]:
    """Coerce a heterogenous citation list into canonical dict shape.

    Convenience wrapper around `_normalise_source_entry` — leaves dicts
    unchanged (shallow copy), promotes bare strings to
    `{"source": str, "chunk": 0}`, never raises. Useful before unit
    tests or before piping into `merge_citations`.
    """
    if not isinstance(citations, list):
        return []
    return [_normalise_source_entry(c) for c in citations]
