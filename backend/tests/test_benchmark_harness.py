"""Tests for backend/utils/benchmark_harness.py (issue #936).

Covers:
- Single-task happy path: latencies recorded, summary stats populated.
- Warmup runs are NOT recorded.
- Exceptions in callable mark task as failed; remaining tasks continue.
- _percentile corner cases.
- compare_to_baseline against None / a faster / a slower baseline.
- write_report round-trips through JSON and re-reads cleanly.
- Empty-tasks list still returns a valid result.
- TaskResult/Spec dataclass shape.
- Custom clock deterministic timing for unit tests.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from utils.benchmark_harness import (
    REGRESSION_FACTOR,
    BenchmarkSpec,
    TaskResult,
    _percentile,
    compare_to_baseline,
    run_benchmark,
    write_report,
)


# ─── _percentile ─────────────────────────────────────────────────


class TestPercentile:
    def test_empty(self):
        assert _percentile([], 50) == 0.0

    def test_single_value(self):
        assert _percentile([10.0], 50) == 10.0
        assert _percentile([10.0], 0) == 10.0
        assert _percentile([10.0], 100) == 10.0

    def test_p0_returns_min(self):
        assert _percentile([1.0, 2.0, 3.0, 4.0, 5.0], 0) == 1.0

    def test_p100_returns_max(self):
        assert _percentile([1.0, 2.0, 3.0, 4.0, 5.0], 100) == 5.0

    def test_interpolation(self):
        # With 10 sorted values [1..10], k_p50 = (10-1)*0.5 = 4.5
        # So percentile(50) = values[4] + 0.5*(values[5]-values[4]) = 5.5.
        values = list(range(1, 11))
        assert _percentile(values, 50) == 5.5

    def test_p95_interpolation(self):
        values = list(range(1, 11))
        # k = 9 * 0.95 = 8.55 — interpolate between values[8]=9 and
        # values[9]=10.
        assert pytest.approx(_percentile(values, 95)) == 9.55


# ─── run_benchmark (happy path) ──────────────────────────────────


class TestRunBenchmarkHappyPath:
    def test_single_task_records_latencies(self):
        spec = BenchmarkSpec(
            name="t",
            callable_=lambda t: time.sleep(0),  # fast
            runs=3,
        )
        tasks = [{"id": "task1"}]
        result = run_benchmark(spec, tasks)
        assert result.spec_name == "t"
        assert len(result.task_results) == 1
        tr = result.task_results[0]
        assert len(tr.latencies_ms) == 3
        assert tr.succeeded is True
        assert result.total_runs == 3
        assert result.fail_count == 0

    def test_summary_populated(self):
        spec = BenchmarkSpec(
            name="t",
            callable_=lambda t: None,
            runs=5,
        )
        result = run_benchmark(spec, [{"id": "x"}])
        assert result.min_ms >= 0.0
        assert result.max_ms >= result.min_ms
        assert result.mean_ms >= result.min_ms
        assert result.median_ms >= result.min_ms
        assert result.stdev_ms >= 0.0
        assert result.p95_ms >= 0.0
        assert result.p99_ms >= 0.0


# ─── Warmup runs are discarded ───────────────────────────────────


class TestWarmupRuns:
    def test_warmup_runs_not_in_latencies(self):
        recorded_call_count = {"warmup": 0, "real": 0}

        def callable_(task):
            recorded_call_count["warmup" if not task.get("_real") else "real"] += 1

        spec = BenchmarkSpec(
            name="warmup",
            callable_=callable_,
            warmup_runs=4,
            runs=2,
        )
        # Wrap to mark which loop we're in.
        real_callable = lambda t: callable_({**t, "_real": True})  # noqa: E731
        spec.callable_ = real_callable
        result = run_benchmark(spec, [{"id": "task1"}])
        assert len(result.task_results[0].latencies_ms) == 2
        assert result.total_runs == 2  # only the measured runs counted.


# ─── Failure handling ─────────────────────────────────────────────


class TestFailureHandling:
    def test_exception_marks_failed(self):
        def boom(task):
            raise RuntimeError("boom")

        spec = BenchmarkSpec(name="boom", callable_=boom, runs=2)
        result = run_benchmark(spec, [{"id": "x"}])
        tr = result.task_results[0]
        assert tr.succeeded is False
        assert "RuntimeError" in (tr.error or "")
        assert tr.latencies_ms == []
        assert result.fail_count == 2

    def test_remaining_tasks_continue_on_one_failure(self):
        def fail_if_id1(task):
            if task["id"] == "fail":
                raise ValueError("nope")

        spec = BenchmarkSpec(name="mixed", callable_=fail_if_id1, runs=1)
        result = run_benchmark(
            spec,
            [
                {"id": "fail"},
                {"id": "ok"},
            ],
        )
        assert len(result.task_results) == 2
        assert result.task_results[0].succeeded is False
        assert result.task_results[1].succeeded is True


# ─── Custom clock deterministic ───────────────────────────────────


class TestCustomClock:
    def test_deterministic_clock(self):
        # Yield [1, 2, 3, 4, 5, ...] per call: each loop has start + end
        # so latencies = (next - prev) = 1.0 ms each.
        counter = {"i": 0.0}

        def clock():
            counter["i"] += 1.0
            return counter["i"]

        spec = BenchmarkSpec(name="det", callable_=lambda t: None, runs=3)
        # Per call we invoke clock() twice, so we need 6 ticks.
        result = run_benchmark(spec, [{"id": "x"}], clock=clock)
        # All latencies should be exactly 1.0 sec (= 1000.0 ms).
        assert result.task_results[0].latencies_ms == [1000.0, 1000.0, 1000.0]
        assert result.min_ms == 1000.0
        assert result.max_ms == 1000.0
        assert result.mean_ms == 1000.0
        assert result.median_ms == 1000.0
        assert result.stdev_ms == 0.0


# ─── Empty tasks ─────────────────────────────────────────────────


class TestEmptyTasks:
    def test_empty_yields_zero_summary(self):
        spec = BenchmarkSpec(name="empty", callable_=lambda t: None)
        result = run_benchmark(spec, [])
        assert result.task_results == []
        assert result.total_runs == 0
        assert result.fail_count == 0
        assert result.min_ms == 0.0
        assert result.p95_ms == 0.0


# ─── compare_to_baseline ─────────────────────────────────────────


class TestCompareToBaseline:
    def test_none_baseline_returns_no_signal(self):
        result = run_benchmark(
            BenchmarkSpec(name="t", callable_=lambda t: None, runs=1),
            [{"id": "x"}],
        )
        cmp = compare_to_baseline(result, None)
        assert cmp["mean_ratio"] == 1.0
        assert cmp["regressed"] is False

    def test_equal_baseline(self):
        result = run_benchmark(
            BenchmarkSpec(name="t", callable_=lambda t: None, runs=1),
            [{"id": "x"}],
        )
        # Use the result's own summary as baseline.
        cmp = compare_to_baseline(
            result,
            {
                "mean_ms": result.mean_ms,
                "median_ms": result.median_ms,
                "p95_ms": result.p95_ms,
            },
        )
        assert pytest.approx(cmp["mean_ratio"]) == 1.0
        assert cmp["regressed"] is False

    def test_regression_flagged_when_slower(self):
        # result is 2x slower than baseline.
        result = run_benchmark(
            BenchmarkSpec(name="t", callable_=lambda t: None, runs=1),
            [{"id": "x"}],
        )
        baseline = {
            "mean_ms": result.mean_ms / (REGRESSION_FACTOR + 0.5),  # way lower
            "median_ms": 0.001,
            "p95_ms": 0.001,
        }
        cmp = compare_to_baseline(result, baseline)
        assert cmp["regressed"] is True
        assert cmp["mean_ratio"] > REGRESSION_FACTOR

    def test_baseline_with_zero_means_protected(self):
        result = run_benchmark(
            BenchmarkSpec(name="t", callable_=lambda t: None, runs=1),
            [{"id": "x"}],
        )
        cmp = compare_to_baseline(
            result, {"mean_ms": 0.0, "median_ms": 0.0, "p95_ms": 0.0}
        )
        assert cmp["mean_ratio"] == 0.0  # zero-baseline means "no signal"
        assert cmp["regressed"] is False


# ─── write_report / round-trip ───────────────────────────────────


class TestWriteReport:
    def test_writes_json_file(self, tmp_path: Path):
        spec = BenchmarkSpec(name="t", callable_=lambda t: None, runs=2)
        result = run_benchmark(spec, [{"id": "x"}])
        out = write_report([result], tmp_path / "bench.json")
        assert out.exists()
        data = json.loads(out.read_text(encoding="utf-8"))
        assert "generated_at" in data
        assert data["results"][0]["spec_name"] == "t"

    def test_creates_parent_dir(self, tmp_path: Path):
        spec = BenchmarkSpec(name="t", callable_=lambda t: None, runs=1)
        result = run_benchmark(spec, [{"id": "x"}])
        out = write_report([result], tmp_path / "nested" / "deep" / "bench.json")
        assert out.exists()

    def test_round_trip_json(self, tmp_path: Path):
        spec = BenchmarkSpec(name="round", callable_=lambda t: None, runs=2)
        result = run_benchmark(spec, [{"id": "x"}, {"id": "y"}])
        out = write_report([result], tmp_path / "rt.json")
        data = json.loads(out.read_text(encoding="utf-8"))
        assert len(data["results"][0]["task_results"]) == 2
        # Spec name round-trips.
        assert data["results"][0]["spec_name"] == "round"
        # Summary keys present.
        assert set(data["results"][0]["summary"].keys()) == {
            "min_ms",
            "max_ms",
            "mean_ms",
            "median_ms",
            "stdev_ms",
            "p95_ms",
            "p99_ms",
        }


# ─── Dataclass shape ─────────────────────────────────────────────


class TestDataclassShape:
    def test_benchmark_spec_defaults(self):
        spec = BenchmarkSpec(name="x", callable_=lambda t: None)
        assert spec.warmup_runs == 0
        assert spec.runs == 10
        assert spec.timeout_seconds == 30.0
        assert spec.baseline_ms is None

    def test_task_result_to_dict(self):
        tr = TaskResult(task_id="t1", succeeded=True, latencies_ms=[1.0, 2.0])
        d = tr.to_dict()
        assert d["task_id"] == "t1"
        assert d["succeeded"] is True
        assert d["latencies_ms"] == [1.0, 2.0]
        assert d["error"] is None

    def test_bench_result_to_dict_keys(self, tmp_path: Path):
        spec = BenchmarkSpec(name="x", callable_=lambda t: None, runs=1)
        result = run_benchmark(spec, [{"id": "t1"}])
        d = result.to_dict()
        assert set(d.keys()) == {
            "spec_name",
            "started_at",
            "ended_at",
            "total_runs",
            "fail_count",
            "summary",
            "task_results",
        }
