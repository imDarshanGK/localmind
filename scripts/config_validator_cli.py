"""config_validator_cli.py — offline CLI for the config validator.

Two modes:
  validate <config.json>     — validate a JSON config file.
  selfcheck                  — run the default ruleset against a
                               pre-canned BAD config to smoke-test the
                               validator itself (useful in CI).

Exit codes: 0 no errors · 1 has errors (or invalid input) · 2 file not found.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from pathlib import Path

# Force stdout/stderr UTF-8 — Windows cp1252 chokes on ≥ ≤ etc.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from utils.config_validator import (  # noqa: E402
    summarise,
    validate,
)


def _read_config_file(path: Path) -> dict:
    if not path.exists():
        print(f"error: file not found: {path}", file=sys.stderr)
        sys.exit(2)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"error: not valid JSON: {exc.msg}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print(
            f"error: top-level must be a JSON object (got {type(data).__name__})",
            file=sys.stderr,
        )
        sys.exit(1)
    return data


def cmd_validate(args: argparse.Namespace) -> int:
    config = _read_config_file(Path(args.input))
    issues = validate(config)
    summary = summarise(issues)
    summary["input"] = args.input
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 1 if summary["errors"] > 0 else 0


def cmd_selfcheck(_args: argparse.Namespace) -> int:
    # A canary bad config that should surface at least one issue from
    # every rule. If the validator returns empty, something is broken.
    os.environ.pop("OLLAMA_HOST", None)
    os.environ.pop("CORS_ORIGINS", None)
    bad = {
        "settings": {
            "default_model": "",  # error
            "default_language": "klingon",  # warn
            "temperature": 5.0,  # error
            "max_history_turns": 0,  # error
            "rag_top_k": 999,  # error
            "rag_chunk_overlap": 600,  # error
            "rag_chunk_size": 600,
            "theme": "rose-gold",  # warn
        },
        "env": {},
    }
    issues = validate(bad)
    summary = summarise(issues)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    # Smoke-test exit code: 0 if validator reported >=5 errors (one
    # per erroneous field), 1 otherwise.
    return 0 if summary["errors"] >= 5 else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="config_validator_cli",
        description="Offline CLI for the LocalMind config validator.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_validate = sub.add_parser("validate", help="Validate a JSON config file.")
    p_validate.add_argument("input", help="Path to a JSON config file.")
    p_validate.set_defaults(func=cmd_validate)

    p_selfcheck = sub.add_parser("selfcheck", help="Self-test the validator.")
    p_selfcheck.set_defaults(func=cmd_selfcheck)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
