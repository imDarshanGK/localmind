"""merge_citations.py — offline CLI for merging citation lists.

Reads one or more JSON files, each containing a citation list (dicts or
legacy strings), and merges them with `merge_citations` from
backend/services/citation_utils.py. Emits a JSON document (the
`MergeResult.to_dict` payload) by default, or `--plain` for a
human-readable report.

Example
-------

  $ python scripts/merge_citations.py list_a.json list_b.json --plain
  Merged 3 unique citations from 2 list(s) (2 duplicates dropped):
     1. [seen=2] a.md#0  (preview: "alpha chunk 0 text"...)
     2. [seen=1] b.md#0  (preview: "beta text"...)
     3. [seen=1] c.md#0  (preview: "gamma text"...)

Exit codes: 0 success · 1 input file missing JSON list · 2 file not found ·
3 no input files given.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Resolve backend/services regardless of CWD so the CLI can be invoked
# from a checkout root or from inside scripts/.
_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.citation_utils import merge_citations  # noqa: E402


def _read_json_list(path: Path) -> list:
    """Read a JSON file and return its content as a list.

    Raises ValueError if the file does not contain a JSON array.
    """
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: not valid JSON ({exc.msg})") from exc
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected a JSON array, got {type(data).__name__}")
    return data


def _format_plain(merged_count: int, list_count: int, dup_count: int, result) -> str:
    lines = [
        f"Merged {merged_count} unique citations from {list_count} "
        f"list(s) ({dup_count} duplicates dropped):"
    ]
    for idx, entry in enumerate(result.merged, start=1):
        chunk = entry.get("chunk", 0)
        seen = entry.get("occurrence_count", 1)
        preview = entry.get("preview", "")
        preview_short = preview if len(preview) <= 30 else preview[:27] + "..."
        lines.append(
            f"   {idx:>2}. [seen={seen}] {entry.get('source', '?')}#{chunk}  "
            f'(preview: "{preview_short}"...)'
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="merge_citations",
        description="Merge multiple JSON citation lists into one deduped list.",
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        help="One or more JSON file paths. Each file must contain a JSON "
        "array of citation dicts (or legacy strings).",
    )
    parser.add_argument(
        "--plain",
        action="store_true",
        help="Emit plaintext human-readable report instead of JSON.",
    )
    parser.add_argument(
        "--scores",
        nargs="*",
        default=None,
        help="Optional space-separated score JSON files, parallel to --inputs. "
        "Each must contain a numeric array the same length as the "
        "corresponding input list. Use 'none' to skip a slot.",
    )
    args = parser.parse_args(argv)

    citation_lists: list[list] = []
    for input_path in args.inputs:
        path = Path(input_path)
        if not path.exists():
            print(f"error: file not found: {path}", file=sys.stderr)
            return 2
        try:
            citation_lists.append(_read_json_list(path))
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1

    # Scores are optional and may be None entries.
    scores: list[list[float] | None] | None = None
    if args.scores is not None:
        scores = []
        for score_path in args.scores:
            if score_path.lower() == "none":
                scores.append(None)
                continue
            path = Path(score_path)
            if not path.exists():
                print(f"error: score file not found: {path}", file=sys.stderr)
                return 2
            try:
                with path.open("r", encoding="utf-8") as fh:
                    scores.append(json.load(fh))
            except json.JSONDecodeError as exc:
                print(f"error: {path}: {exc.msg}", file=sys.stderr)
                return 1

    result = merge_citations(*citation_lists, scores=scores)

    if args.plain:
        print(
            _format_plain(
                len(result.merged),
                len(citation_lists),
                len(result.duplicates),
                result,
            )
        )
    else:
        print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
