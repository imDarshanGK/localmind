#!/usr/bin/env python3
"""
Rank sources offline — tooling companion to issue #933.

Reads a JSON array of source objects (filename + chunk + optional metadata)
from stdin or a file, applies the relevance/recency/authority ranking
algorithm defined in `backend/services/citation_utils.py`, and prints
the ranked list.

Usage:
    python scripts/rank_sources.py --json sources.json
    python scripts/rank_sources.py --plain sources.json
    python scripts/rank_sources.py sources.json  < same as --json

Each source dict may include optional extra fields that the ranking
algorithm picks up:

    {
      "source":   "docs/csrf-protection.md",
      "chunk":    0,
      "distance": 0.23,                    // relevance distance (optional)
      "created_at": "2026-07-20T12:00:00Z" // recency timestamp (optional)
    }

The extra fields mirror what ChromaDB's `query()` response can carry
per result when `include=["distances"]` is set (issue #933 does NOT
require changes to `rag_service.retrieve_context` to pass distances,
but the ranking function accepts them if present).

Exit codes: 0 = ok, 1 = empty input (warn only), 2 = I/O or parse error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services.citation_utils import (  # noqa: E402
    DEFAULT_AUTHORITY_RULES,
    RankWeights,
    rank_sources,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Rank a JSON source list via citation_utils.rank_sources."
    )
    parser.add_argument(
        "input",
        type=Path,
        nargs="?",
        help="JSON file containing a list of source objects. Reads stdin if omitted.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        default=True,
        help="Emit JSON output (default).",
    )
    parser.add_argument(
        "--plain",
        action="store_true",
        help="Emit a human-readable report.",
    )
    parser.add_argument(
        "--relevance-weight",
        type=float,
        default=0.65,
        help="Weight for relevance signal (0.0-1.0, default 0.65).",
    )
    parser.add_argument(
        "--recency-weight",
        type=float,
        default=0.10,
        help="Weight for recency signal (0.0-1.0, default 0.10).",
    )
    parser.add_argument(
        "--authority-weight",
        type=float,
        default=0.25,
        help="Weight for authority signal (0.0-1.0, default 0.25).",
    )
    args = parser.parse_args(argv)

    weights = RankWeights(
        relevance=args.relevance_weight,
        recency=args.recency_weight,
        authority=args.authority_weight,
    )

    try:
        if args.input and str(args.input) != "-":
            raw = args.input.read_text(encoding="utf-8", errors="replace")
        else:
            raw = sys.stdin.read()
    except OSError as exc:
        print(f"error: failed to read input: {exc}", file=sys.stderr)
        return 2

    try:
        sources = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"error: invalid JSON: {exc}", file=sys.stderr)
        return 2

    if not isinstance(sources, list):
        print("error: input must be a JSON list of source objects", file=sys.stderr)
        return 2

    if not sources:
        print("warning: empty source list", file=sys.stderr)
        if not args.plain:
            print("[]")
        return 1

    # Pull optional distance + created_at from the input dicts so the
    # user doesn't need to pass them as separate CLI args.
    distances: list[float | None] = []
    timestamps: list[str | None] = []
    for src in sources:
        dist = src.get("distance")
        distances.append(
            float(dist) if isinstance(dist, (int, float)) and dist == dist else None
        )
        ts = src.get("created_at")
        timestamps.append(str(ts) if ts else None)

    ranked = rank_sources(
        sources,
        relevance_distances=distances
        if any(d is not None for d in distances)
        else None,
        recency_timestamps=timestamps if any(t for t in timestamps) else None,
        weights=weights,
        authority_rules=DEFAULT_AUTHORITY_RULES,
    )

    if args.plain:
        print(
            f"Ranked {len(ranked)} source(s) "
            f"(relevance_w={weights.relevance:.2f} "
            f"recency_w={weights.recency:.2f} "
            f"authority_w={weights.authority:.2f}):"
        )
        print()
        for idx, entry in enumerate(ranked, start=1):
            src = entry["source"]
            comp = entry["components"]
            print(
                f"  {idx:3d}. [{entry['score']:.3f}] {src['source']} "
                f"chunk={src['chunk']} "
                f"(rel={comp['relevance']:.2f} rec={comp['recency']:.2f} "
                f"auth={comp['authority']:.2f})"
            )
    else:
        print(json.dumps(ranked, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
