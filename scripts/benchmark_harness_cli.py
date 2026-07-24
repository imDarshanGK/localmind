"""benchmark_harness_cli.py — offline CLI for running benchmarks.

Reads a benchmark-config JSON file describing a benchmark (or set of
benchmarks), invokes the registered Python callables, prints a JSON
report. The CLI is intentionally minimal — most consumers will use
the harness via `run_benchmark()` in tests directly. The CLI is for
manual experiments during development.

Schema (JSON file or stdin):

    {
      "benchmarks": [
        {
          "name":         "retrieval",
          "callable":     "module:function",   # dotted import
          "warmup_runs":  0,
          "runs":         10,
          "tasks":        [{"id": "task1", "query": "foo"}]
        }
      ],
      "baseline":  {                # optional baseline dict; if
        "mean_ms":  5.0,            # present, --compare prints the
        "median_ms": 4.5,           # drift metric
        "p95_ms":    10.0
      }
    }

Exit codes: 0 success · 1 malformed input · 2 file-not-found · 3 callable import error.
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

from utils.benchmark_harness import (  # noqa: E402
    BenchmarkSpec,
    compare_to_baseline,
    run_benchmark,
    write_report,
)


def _resolve_callable(spec_str: str):
    try:
        module_name, attr = spec_str.split(":", 1)
    except ValueError:
        print(
            f"error: --callable must be 'module:attr', got: {spec_str}", file=sys.stderr
        )
        sys.exit(3)
    try:
        mod = __import__(module_name)
        return getattr(mod, attr)
    except (ImportError, AttributeError) as exc:
        print(f"error: cannot load callable: {exc}", file=sys.stderr)
        sys.exit(3)


def _run_one(bench_def: dict) -> dict:
    name = bench_def.get("name", "anon")
    callable_spec = bench_def.get("callable")
    if not callable_spec:
        print(f"error: benchmark '{name}' missing 'callable' field", file=sys.stderr)
        sys.exit(1)
    callable_ = _resolve_callable(callable_spec)
    spec = BenchmarkSpec(
        name=name,
        callable_=callable_,
        warmup_runs=int(bench_def.get("warmup_runs", 0)),
        runs=int(bench_def.get("runs", 10)),
        timeout_seconds=float(bench_def.get("timeout_seconds", 30.0)),
        baseline_ms=bench_def.get("baseline_ms"),
    )
    tasks = bench_def.get("tasks", [])
    if not isinstance(tasks, list):
        print(
            f"error: 'tasks' must be a JSON array (got {type(tasks).__name__})",
            file=sys.stderr,
        )
        sys.exit(1)
    result = run_benchmark(spec, tasks)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="benchmark_harness_cli",
        description="Offline CLI for running benchmarks via the BenchmarkHarness.",
    )
    parser.add_argument(
        "input",
        help="JSON file describing one or more benchmarks. stdin if '-' or omitted.",
        nargs="?",
        default=None,
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Optional output path; if given, full report is written there.",
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="If a baseline is present, emit the drift comparison.",
    )
    args = parser.parse_args(argv)

    if args.input is None or args.input == "-":
        raw = sys.stdin.read()
    else:
        path = Path(args.input)
        if not path.exists():
            print(f"error: file not found: {path}", file=sys.stderr)
            return 2
        raw = path.read_text(encoding="utf-8")

    try:
        config = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"error: not valid JSON: {exc.msg}", file=sys.stderr)
        return 1
    if not isinstance(config, dict):
        print(
            f"error: root must be a JSON object (got {type(config).__name__})",
            file=sys.stderr,
        )
        return 1

    bench_defs = config.get("benchmarks", [])
    if not isinstance(bench_defs, list):
        print("error: 'benchmarks' must be a JSON array", file=sys.stderr)
        return 1
    if not bench_defs:
        print("error: 'benchmarks' array is empty", file=sys.stderr)
        return 1

    results = [_run_one(b) for b in bench_defs]
    payload = {
        "benchmarks": [r.to_dict() for r in results],
    }

    if args.compare:
        baseline = config.get("baseline")
        payload["comparison"] = [
            {**compare_to_baseline(r, baseline), "spec_name": r.spec_name}
            for r in results
        ]

    print(json.dumps(payload, indent=2, ensure_ascii=False))

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        write_report(results, out_path)
        print(f"\n(report also written to {out_path})", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
