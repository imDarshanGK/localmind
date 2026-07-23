"""
Citation utilities — pure Python helpers with no external dependencies.

Kept separate from rag_service so they can be imported and unit-tested
without triggering the chromadb / sentence-transformers import chain.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

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
# Source ranking (issue #933)
# ---------------------------------------------------------------------------


# Default authority multipliers — pushed into the ranking computation if the
# caller does not override. Filename pattern -> (regex, weight in [0,1]).
# Tested in `backend/tests/test_citation_ranking.py`.
DEFAULT_AUTHORITY_RULES: tuple[tuple[re.Pattern, float], ...] = (
    (re.compile(r"^README\.md$", re.IGNORECASE), 0.55),
    (re.compile(r"^CONTRIBUTING\.md$", re.IGNORECASE), 0.50),
    (re.compile(r"^docs/.*\.md$", re.IGNORECASE), 0.70),
    (re.compile(r"^docs/.*\.mdx$", re.IGNORECASE), 0.70),
    (re.compile(r"^docs/.*\.txt$", re.IGNORECASE), 0.65),
    (re.compile(r"^backend/app\.py$", re.IGNORECASE), 0.50),
    (re.compile(r"^backend/services/.*\.py$", re.IGNORECASE), 0.55),
    (re.compile(r"^backend/routes/.*\.py$", re.IGNORECASE), 0.45),
    (re.compile(r"^backend/tests/.*\.py$", re.IGNORECASE), 0.30),
    (re.compile(r"^frontend/src/.*", re.IGNORECASE), 0.40),
    (re.compile(r"\b(official|spec|rfc)\b", re.IGNORECASE), 0.85),
)


RELEVANCE_WEIGHT_DEFAULT = 0.65
RECENCY_WEIGHT_DEFAULT = 0.10
AUTHORITY_WEIGHT_DEFAULT = 0.25


@dataclass
class RankWeights:
    """Weighting for the three ranking signals.

    All three must lie in [0.0, 1.0] and the sum does NOT need to equal
    1.0 — the writer is normalised to total-weight during ranking. This
    lets callers set, e.g. weights=(0.7, 0.1, 0.2) without including
    their own renormalisation step.
    """

    relevance: float = RELEVANCE_WEIGHT_DEFAULT
    recency: float = RECENCY_WEIGHT_DEFAULT
    authority: float = AUTHORITY_WEIGHT_DEFAULT

    def normalised(self) -> "RankWeights":
        total = self.relevance + self.recency + self.authority
        if total <= 0:
            return RankWeights(0.0, 0.0, 0.0)
        return RankWeights(
            relevance=self.relevance / total,
            recency=self.recency / total,
            authority=self.authority / total,
        )

    def as_dict(self) -> dict[str, float]:
        return {
            "relevance": self.relevance,
            "recency": self.recency,
            "authority": self.authority,
        }


@dataclass
class RankedSource:
    """One ranked source entry — the original source dict + the score
    components used to rank it (so callers can display / audit)."""

    source: dict
    score: float
    components: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "score": self.score,
            "components": self.components,
        }


def _parse_isoformat(value: Any) -> datetime | None:
    """Parse an ISO-8601 timestamp (or datetime) and force-UTC.

    Accepts: ISO strings (`2026-07-22T10:00:00Z`), naive datetime objects
    (interpreted as UTC), aware datetime objects (converted to UTC).
    Returns None for missing/empty/invalid inputs.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _relevance_score(distance: Any) -> float:
    """Convert a cosine distance into a relevance score in [0, 1].

    ChromaDB's cosine distance is in [0, 2] where 0 == perfect match and
    2 == perfect opposite. We treat relevance = 1 - distance / 2.0,
    clamped to [0, 1].
    """
    try:
        d = float(distance)
    except (TypeError, ValueError):
        return 0.0
    if d != d:  # NaN
        return 0.0
    return max(0.0, min(1.0, 1.0 - d / 2.0))


def _recency_score(created_at: Any, now: datetime | None = None) -> float:
    """Convert a (recency) timestamp into a recency score in [0, 1].

    Linear decay over a 365-day window: a source dated `now` scores 1.0,
    one dated >1 year before `now` scores 0.0. Beyond the window the
    score is 0.0; future-dated sources (clock skew) are clamped at 1.0.
    """
    if created_at is None or created_at == "":
        return 0.0
    when = _parse_isoformat(created_at)
    if when is None:
        return 0.0
    if now is None:
        now = datetime.now(tz=timezone.utc)
    delta_days = (now - when).total_seconds() / 86400.0
    if delta_days < 0:
        return 1.0
    return max(0.0, 1.0 - delta_days / 365.0)


def _authority_score(
    source_name: str,
    rules: Iterable[tuple[re.Pattern, float]] = DEFAULT_AUTHORITY_RULES,
    base: float = 0.40,
) -> float:
    """Compute an authority score in [0, 1] for a source filename.

    Walks `rules` in order and returns the weight of the FIRST rule whose
    pattern matches; falls back to `base` if no rule matches. Matches
    against the rule's compiled regex object.
    """
    if not source_name:
        return base
    for pattern, weight in rules:
        if pattern.search(source_name):
            return weight
    return base


def rank_sources(
    sources: list[dict],
    *,
    relevance_distances: list[float] | None = None,
    recency_timestamps: list[str | datetime | None] | None = None,
    weights: RankWeights | None = None,
    authority_rules: tuple[tuple[re.Pattern, float], ...] = DEFAULT_AUTHORITY_RULES,
    authority_base: float = 0.40,
    now: datetime | None = None,
) -> list[dict]:
    """Return a deterministic ranking of `sources`.

    Each returned dict has the shape:

        {
            "source":     <original dict>,
            "score":      <float in [0, 1]>,
            "components": {
                "relevance": <float in [0, 1]>,
                "recency":   <float in [0, 1]>,
                "authority": <float in [0, 1]>
            }
        }

    Ties on `score` are broken first by source `source` (filename)
    alphabetically, then by `(chunk)` ascending. This is deliberately
    deterministic so the test suite can pin the order without clock-
    dependent flakiness.

    If `relevance_distances` is omitted or shorter than `sources`,
    relevance defaults to 0.5 (neutral). Same for `recency_timestamps`.

    Setting all weight components to 0 effectively reduces ranking to
    pure tie-breaking (filename + chunk order).
    """
    if weights is None:
        weights = RankWeights()
    weights = weights.normalised()

    if relevance_distances is None:
        relevance_distances = []
    if recency_timestamps is None:
        recency_timestamps = []

    ranked: list[RankedSource] = []
    for idx, source in enumerate(sources):
        source_name = str(source.get("source", ""))

        rel_dist = relevance_distances[idx] if idx < len(relevance_distances) else None
        rel = _relevance_score(rel_dist if rel_dist is not None else 1.0)

        rec_ts = recency_timestamps[idx] if idx < len(recency_timestamps) else None
        rec = _recency_score(rec_ts, now=now)

        auth = _authority_score(source_name, rules=authority_rules, base=authority_base)

        composite = (
            weights.relevance * rel + weights.recency * rec + weights.authority * auth
        )

        ranked.append(
            RankedSource(
                source=dict(source),
                score=composite,
                components={
                    "relevance": rel,
                    "recency": rec,
                    "authority": auth,
                },
            )
        )

    # Sort by score descending; tie-break by source filename ascending, then
    # chunk ascending. Use a stable sort with explicit keys so the output
    # order under equal inputs is independent of Python's TIMSORT stability
    # for equal-primary-key cases.
    def sort_key(rs: RankedSource):
        return (
            -rs.score,
            str(rs.source.get("source", "")),
            int(rs.source.get("chunk", 0)),
        )

    ranked.sort(key=sort_key)
    return [rs.to_dict() for rs in ranked]
