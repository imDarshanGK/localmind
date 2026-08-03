"""embeddings_cache_cli.py — offline CLI for the EmbeddingsCache.

Subcommands:
  warmup  — read a JSON list of texts from stdin or --inputs, run
            warmup_embeddings with --embedder python:callable.
  stats   — load a cache snapshot file produced by `--snapshot` and
            print its stats (or use --live to create an empty cache
            and just print defaults).
  dump    — print the cache as a JSON table of keys → (vector prefix).
  probe   — given a list of texts via stdin, print hit/miss per line.

The CLI is designed for two main use-cases:
  1) Smoke test the warmup pipeline against a fake embedder:
       echo '["alpha","beta"]' | python scripts/embeddings_cache_cli.py warmup
  2) Inspect hit rate after a workload:
       cat texts.json | python scripts/embeddings_cache_cli.py probe

Exit codes: 0 success · 1 malformed input · 2 file-not-found · 3 subcommand error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from utils.embeddings_cache import EmbeddingsCache, warmup_embeddings  # noqa: E402


def _fake_embed(text: str):
    """A plausible default embedder for tests without sentence-transformers.

    Returns a 16-element float vector that's deterministic and qualitative
    (summable, averageable) — so end-to-end warmup smoke-tests give a
    meaningful hit-rate after re-query.
    """
    h = [0.0] * 16
    for i, ch in enumerate(text[:16]):
        h[i] = ord(ch) / 256.0
    return h


def _read_texts(inp: str | None) -> list[str]:
    """Read a JSON list of strings from --inputs file or stdin."""
    if inp is None:
        raw = sys.stdin.read()
    else:
        path = Path(inp)
        if not path.exists():
            print(f"error: file not found: {path}", file=sys.stderr)
            sys.exit(2)
        raw = path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"error: not valid JSON: {exc.msg}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, list):
        print(f"error: expected JSON array, got {type(data).__name__}", file=sys.stderr)
        sys.exit(1)
    return [str(t) for t in data]


def cmd_warmup(args: argparse.Namespace) -> int:
    texts = _read_texts(args.inputs)
    cache = EmbeddingsCache(
        ttl_seconds=args.ttl_seconds,
        max_entries=args.max_entries,
    )
    embedder = _fake_embed
    if args.embedder_python:
        # Allow overriding the embedder by Python dotted import path.
        try:
            module_name, attr = args.embedder_python.split(":", 1)
        except ValueError:
            print(
                f"error: --embedder-python must be 'module:attr', got: {args.embedder_python}",
                file=sys.stderr,
            )
            return 1
        try:
            mod = __import__(module_name)
            embedder = getattr(mod, attr)
        except (ImportError, AttributeError) as exc:
            print(f"error: cannot load embedder: {exc}", file=sys.stderr)
            return 3
    result = warmup_embeddings(cache, texts, embedder=embedder)
    payload = {
        "warmup": {k: v for k, v in result.items() if k != "after_warm_stats"},
        "stats": result["after_warm_stats"],
        "hit_rate": cache.hit_rate(),
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def cmd_probe(args: argparse.Namespace) -> int:
    texts = _read_texts(args.inputs)
    cache = EmbeddingsCache(
        ttl_seconds=args.ttl_seconds,
        max_entries=args.max_entries,
    )
    # Pre-warm with the fake embedder if --warmup is passed.
    if args.warmup:
        warmup_embeddings(cache, texts, embedder=_fake_embed)
    # Now probe.
    rows = []
    for text in texts:
        vec = cache.get(text)
        rows.append(
            {
                "text": text[:60],
                "hit": vec is not None,
                "vector_prefix": (vec[:3] if vec else None),
            }
        )
    print(
        json.dumps(
            {"rows": rows, "stats": cache.stats(), "hit_rate": cache.hit_rate()},
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def cmd_stats(args: argparse.Namespace) -> int:
    cache = EmbeddingsCache(ttl_seconds=args.ttl_seconds, max_entries=args.max_entries)
    print(json.dumps(cache.stats(), indent=2, ensure_ascii=False))
    return 0


def cmd_dump(args: argparse.Namespace) -> int:
    cache = EmbeddingsCache(ttl_seconds=args.ttl_seconds, max_entries=args.max_entries)
    # Dump-only path — empty cache keys.
    rows = [{"key": k} for k in cache.keys()]
    print(json.dumps({"keys": rows, "size": len(cache)}, indent=2, ensure_ascii=False))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="embeddings_cache_cli",
        description="Offline CLI for the EmbeddingsCache utility.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_cache_args(p: argparse.ArgumentParser) -> None:
        p.add_argument(
            "--ttl-seconds",
            type=int,
            default=3600,
            help="Time-to-live for cache entries.",
        )
        p.add_argument(
            "--max-entries",
            type=int,
            default=1024,
            help="Max number of cached entries (LRU eviction).",
        )

    p_warmup = subparsers.add_parser(
        "warmup", help="Pre-populate the cache from a list of texts."
    )
    p_warmup.add_argument(
        "--inputs",
        default=None,
        help="JSON file path of an array of strings; stdin if omitted.",
    )
    p_warmup.add_argument(
        "--embedder-python",
        default=None,
        help="Optional embedder as 'module:callable'; default is a 16-char hash fallback.",
    )
    add_cache_args(p_warmup)
    p_warmup.set_defaults(func=cmd_warmup)

    p_probe = subparsers.add_parser(
        "probe", help="Probe the cache with each text and report hit/miss."
    )
    p_probe.add_argument("--inputs", default=None)
    p_probe.add_argument(
        "--warmup", action="store_true", help="Pre-warm the cache before probing."
    )
    add_cache_args(p_probe)
    p_probe.set_defaults(func=cmd_probe)

    p_stats = subparsers.add_parser("stats", help="Print an empty cache's stats shape.")
    add_cache_args(p_stats)
    p_stats.set_defaults(func=cmd_stats)

    p_dump = subparsers.add_parser(
        "dump", help="Print an empty cache's keys (placeholder)."
    )
    add_cache_args(p_dump)
    p_dump.set_defaults(func=cmd_dump)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
