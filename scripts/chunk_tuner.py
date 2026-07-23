#!/usr/bin/env python3
"""
Chunk tuner — empirically test the RAG `RecursiveCharacterTextSplitter` at
different (chunk_size, chunk_overlap) settings against a sample text file.

This is the **tooling** companion to issue #932's `rag_chunk_size`
addition to settings. The splitter itself already runs at runtime in
`backend/services/rag_service.py`; this CLI gives maintainers and
contributors a way to experiment with chunking parameters without
spinning up the full FastAPI app + ChromaDB stack.

Usage:
    python scripts/chunk_tuner.py --chunk-size 600 --chunk-overlap 50 docs/some-file.md
    python scripts/chunk_tuner.py --chunk-size 200 --chunk-overlap 0 --json docs/x.md
    python scripts/chunk_tuner.py --chunk-size 1000 - < some-file.txt

Output is a small JSON report:
    {
      "chunk_count": 12,
      "first_chunk_preview": "...first 200 chars of first chunk...",
      "last_chunk_preview": "...first 200 chars of last chunk...",
      "min_chunk_chars": 300,
      "max_chunk_chars": 600,
      "mean_chunk_chars": 502.4
    }

Exit codes:
    0 = ok; chunks emitted
    1 = no chunks emitted (file too short, all whitespace, etc.)
    2 = I/O or argument error
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from statistics import mean

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

DEFAULT_SEPARATORS = ("\n\n", "\n", ". ", " ")
CHUNK_SIZE_DEFAULT = 600
CHUNK_SIZE_MIN = 200
CHUNK_SIZE_MAX = 2000
CHUNK_OVERLAP_DEFAULT = 50
CHUNK_OVERLAP_MAX = 200
PREVIEW_CHARS = 200


def tune(
    content: str,
    chunk_size: int = CHUNK_SIZE_DEFAULT,
    chunk_overlap: int = CHUNK_OVERLAP_DEFAULT,
    separators: tuple[str, ...] = DEFAULT_SEPARATORS,
) -> dict:
    """Run the splitter over `content` and return a small summary dict.

    Exposed for direct module-level imports (see
    `backend/tests/test_chunking_tuning.py::TestChunkTunerTool` for the
    regression coverage).
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=list(separators),
    )
    docs = splitter.split_documents([Document(page_content=content)])
    if not docs:
        return {
            "chunk_count": 0,
            "first_chunk_preview": "",
            "last_chunk_preview": "",
            "min_chunk_chars": 0,
            "max_chunk_chars": 0,
            "mean_chunk_chars": 0.0,
        }

    chunk_texts = [d.page_content for d in docs]
    chunk_lens = [len(c) for c in chunk_texts]
    return {
        "chunk_count": len(docs),
        "first_chunk_preview": chunk_texts[0][:PREVIEW_CHARS],
        "last_chunk_preview": chunk_texts[-1][:PREVIEW_CHARS],
        "min_chunk_chars": min(chunk_lens),
        "max_chunk_chars": max(chunk_lens),
        "mean_chunk_chars": mean(chunk_lens) if chunk_lens else 0.0,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Empirically test the RAG RecursiveCharacterTextSplitter at "
            "tunable (chunk_size, chunk_overlap) settings against a sample "
            "markdown or text file."
        )
    )
    parser.add_argument(
        "file",
        type=Path,
        nargs="?",
        help="File to chunk. Reads from stdin if omitted or '-' is given.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=CHUNK_SIZE_DEFAULT,
        help=(
            f"Target characters per chunk. "
            f"Bounds: {CHUNK_SIZE_MIN}-{CHUNK_SIZE_MAX}. "
            f"Default: {CHUNK_SIZE_DEFAULT}."
        ),
    )
    parser.add_argument(
        "--chunk-overlap",
        type=int,
        default=CHUNK_OVERLAP_DEFAULT,
        help=(
            f"Sliding-window overlap in chars. Max: {CHUNK_OVERLAP_MAX} and "
            f"must be strictly less than --chunk-size. "
            f"Default: {CHUNK_OVERLAP_DEFAULT}."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the result as JSON (default).",
    )
    parser.add_argument(
        "--plain",
        action="store_true",
        help="Emit a human-readable text report instead of JSON.",
    )
    args = parser.parse_args(argv)

    if not CHUNK_SIZE_MIN <= args.chunk_size <= CHUNK_SIZE_MAX:
        print(
            f"error: chunk_size must be in [{CHUNK_SIZE_MIN}, {CHUNK_SIZE_MAX}]",
            file=sys.stderr,
        )
        return 2
    if not 0 <= args.chunk_overlap <= CHUNK_OVERLAP_MAX:
        print(
            f"error: chunk_overlap must be in [0, {CHUNK_OVERLAP_MAX}]",
            file=sys.stderr,
        )
        return 2
    if args.chunk_overlap >= args.chunk_size:
        print(
            "error: chunk_overlap must be strictly less than chunk_size",
            file=sys.stderr,
        )
        return 2

    try:
        if args.file is None or str(args.file) == "-":
            content = sys.stdin.read()
        else:
            content = args.file.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        print(f"error: failed to read input: {exc}", file=sys.stderr)
        return 2

    report = tune(
        content,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
    )

    if report["chunk_count"] == 0:
        print(
            "warning: splitter returned 0 chunks — input may be too short.",
            file=sys.stderr,
        )
        if not args.plain:
            print(json.dumps(report, indent=2))
        return 1

    if args.plain:
        print(f"chunk_count:            {report['chunk_count']}")
        print(f"min_chunk_chars:       {report['min_chunk_chars']}")
        print(f"max_chunk_chars:       {report['max_chunk_chars']}")
        print(f"mean_chunk_chars:      {report['mean_chunk_chars']:.1f}")
        print()
        print("first_chunk_preview:")
        print("    " + report["first_chunk_preview"].replace("\n", "\n    "))
        print()
        print("last_chunk_preview:")
        print("    " + report["last_chunk_preview"].replace("\n", "\n    "))
    else:
        print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
