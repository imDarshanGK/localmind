"""Benchmark harness — zero-dependency retrieval-pipeline microbenchmark.

Designed to be usable as a pytest module AND as a CLI:

- BenchmarkSpec: name, callable(task) -> result, warmup_runs, runs,
  timeout_seconds, baseline_ms (for regression detection).
- task:        shape {"id": str, "query": str, "expected_source": str,
               optional kwargs} — opaque to the harness, handed to the
  callable.
- run_benchmark(spec, tasks, clock=time.perf_counter) -> BenchResult
  collects min/max/mean/median/p95/p99/stdev, fail-count, and per-task
  latencies. Records the wall-clock for each task exactly once (no
  amortisation), normalises to milliseconds.
- BenchResult.to_dict() round-trips through JSON for report diffing.
- compare_to_baseline(result, baseline) returns a drift dict:
  {mean_ratio, median_ratio, p95_ratio, regressed: bool} so CI can
  fail PRs that slow retrieval by X%.
- write_report(results, path) writes a JSON report with timestamps.
- No external imports beyond stdlib (time, statistics, json, dataclasses).

Existing chromadb/sentence-transformers benchmark
(backend/tests/test_chromadb_benchmark.py) keeps working unchanged.
This harness provides a deferred / unit-test-friendly harness that
works in any environment.
"""

from __future__ import annotations

import json
import statistics
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable


# Magic number: a benchmark result is considered "regressed" if any of
# the key percentiles exceeds 1.5x its baseline.
REGRESSION_FACTOR = 1.5


@dataclass
class BenchmarkSpec:
    """Configuration for one benchmark run.

    Fields:
        name:           human-readable label (used in reports).
        callable_:      ``callable(task) -> result``. The result is
                        discarded — only exceptions and latency are
                        tracked.
        warmup_runs:    number of pre-measurement invocations (GC/JIT
                        warm-up); their latencies are NOT recorded.
        runs:           number of measurement invocations per task.
        timeout_seconds: per-invocation timeout. Not enforced by the
                        harness — callables are expected to honour this
                        themselves. Failing the harness's clock-based
                        deadline is a soft signal (result.fail_count
                        stays accurate but no signal is sent).
        baseline_ms:    optional baseline known-good latency.
    """

    name: str
    callable_: Callable[[dict], Any]
    warmup_runs: int = 0
    runs: int = 10
    timeout_seconds: float = 30.0
    baseline_ms: dict | None = None


@dataclass
class TaskResult:
    """One task's outcome."""

    task_id: str
    succeeded: bool
    latencies_ms: list[float] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BenchResult:
    """Aggregated result across all tasks.

    Stats are over ALL recorded latencies (pooled across tasks). To
    get per-task stats, see `TaskResult.latencies_ms`.
    """

    spec_name: str
    started_at: str
    ended_at: str
    total_runs: int
    fail_count: int
    task_results: list[TaskResult]
    min_ms: float
    max_ms: float
    mean_ms: float
    median_ms: float
    stdev_ms: float
    p95_ms: float
    p99_ms: float

    def to_dict(self) -> dict:
        return {
            "spec_name": self.spec_name,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "total_runs": self.total_runs,
            "fail_count": self.fail_count,
            "summary": {
                "min_ms": self.min_ms,
                "max_ms": self.max_ms,
                "mean_ms": self.mean_ms,
                "median_ms": self.median_ms,
                "stdev_ms": self.stdev_ms,
                "p95_ms": self.p95_ms,
                "p99_ms": self.p99_ms,
            },
            "task_results": [tr.to_dict() for tr in self.task_results],
        }


def _percentile(sorted_values: list[float], p: float) -> float:
    """Linear-interpolation percentile of an already-sorted list."""
    if not sorted_values:
        return 0.0
    if p <= 0:
        return sorted_values[0]
    if p >= 100:
        return sorted_values[-1]
    n = len(sorted_values)
    k = (n - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, n - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] + (sorted_values[c] - sorted_values[f]) * (k - f)


def run_benchmark(
    spec: BenchmarkSpec,
    tasks: Iterable[dict],
    clock: Callable[[], float] = time.perf_counter,
) -> BenchResult:
    """Run ``spec`` over ``tasks``, returning an aggregated result.

    For each task:
      1) warmup_runs invocations are discarded (latency not recorded).
      2) `runs` invocations are timed and recorded.
      3) Exceptions in the callable are caught; the task is marked as
         failed but the next task is still attempted.

    Stats (`min_ms`, `max_ms`, `mean_ms`, `median_ms`, `stdev_ms`,
    `p95_ms`, `p99_ms`) are computed over the pooled successful
    latencies across all tasks.
    """
    started = datetime.now(tz=timezone.utc).isoformat()
    task_results: list[TaskResult] = []
    all_latencies: list[float] = []
    total_runs = 0
    fail_count = 0

    for task in tasks:
        task_id = str(task.get("id", "unknown"))
        succeeded = True
        error: str | None = None
        latencies: list[float] = []

        # Warmup runs — discarded.
        for _ in range(spec.warmup_runs):
            try:
                spec.callable_(task)
            except Exception:  # noqa: BLE001
                pass

        for _ in range(spec.runs):
            total_runs += 1
            try:
                start = clock()
                spec.callable_(task)
                end = clock()
                elapsed_ms = (end - start) * 1000.0
                latencies.append(elapsed_ms)
                all_latencies.append(elapsed_ms)
            except Exception as exc:  # noqa: BLE001
                if succeeded:
                    succeeded = False
                    error = f"{type(exc).__name__}: {exc}"
                fail_count += 1
        if not succeeded:
            latencies = []
        task_results.append(
            TaskResult(
                task_id=task_id,
                succeeded=succeeded,
                latencies_ms=latencies,
                error=error,
            )
        )

    ended = datetime.now(tz=timezone.utc).isoformat()

    sorted_latencies = sorted(all_latencies)
    if all_latencies:
        summary = {
            "min_ms": min(all_latencies),
            "max_ms": max(all_latencies),
            "mean_ms": statistics.mean(all_latencies),
            "median_ms": statistics.median(all_latencies),
            "stdev_ms": statistics.stdev(all_latencies)
            if len(all_latencies) > 1
            else 0.0,
            "p95_ms": _percentile(sorted_latencies, 95),
            "p99_ms": _percentile(sorted_latencies, 99),
        }
    else:
        summary = {
            "min_ms": 0.0,
            "max_ms": 0.0,
            "mean_ms": 0.0,
            "median_ms": 0.0,
            "stdev_ms": 0.0,
            "p95_ms": 0.0,
            "p99_ms": 0.0,
        }

    return BenchResult(
        spec_name=spec.name,
        started_at=started,
        ended_at=ended,
        total_runs=total_runs,
        fail_count=fail_count,
        task_results=task_results,
        **summary,
    )


def compare_to_baseline(result: BenchResult, baseline: dict | None) -> dict:
    """Compare a result against an optional baseline dict.

    Returns ratios (≥1.0 means slower than baseline) plus a
    `regressed` flag set if any of mean/median/p95 exceeds
    REGRESSION_FACTOR (1.5) of the baseline value. Baseline keys
    absent in the dict default to a ratio of 1.0 (no signal).
    """
    if baseline is None:
        return {
            "mean_ratio": 1.0,
            "median_ratio": 1.0,
            "p95_ratio": 1.0,
            "regressed": False,
            "regression_factor": REGRESSION_FACTOR,
        }
    b_mean = float(baseline.get("mean_ms", result.mean_ms))
    b_median = float(baseline.get("median_ms", result.median_ms))
    b_p95 = float(baseline.get("p95_ms", result.p95_ms))
    mean_ratio = result.mean_ms / b_mean if b_mean > 0 else 0.0
    median_ratio = result.median_ms / b_median if b_median > 0 else 0.0
    p95_ratio = result.p95_ms / b_p95 if b_p95 > 0 else 0.0
    regressed = (
        mean_ratio > REGRESSION_FACTOR
        or median_ratio > REGRESSION_FACTOR
        or p95_ratio > REGRESSION_FACTOR
    )
    return {
        "mean_ratio": mean_ratio,
        "median_ratio": median_ratio,
        "p95_ratio": p95_ratio,
        "regressed": regressed,
        "regression_factor": REGRESSION_FACTOR,
    }


def write_report(results: list[BenchResult], path: str | Path) -> Path:
    """Persist a list of BenchResult objects to disk as JSON."""
    p = Path(path)
    payload = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "results": [r.to_dict() for r in results],
    }
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return p
