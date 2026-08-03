"""Tests for `scripts/collect_docs_metrics.py`.

Coverage:

* Metrics collection — counts of files, bytes, headings, links, code blocks,
  BOMs, empty files, extensions.
* Aggregate hashing — sha256 of the byte concatenation is stable.
* Prometheus output format — HELP/VALUE lines, dict-flattened label emissions.
* JSON output format — round-trips through `json.loads`.
* Baseline write / read round-trip.
* Drift detection:
  - Identical trees produce no drift.
  - A 50% size drop outside ±20% default threshold fails `--check`.
  - Per-metric thresholds in the baseline JSON override the global default.
  - Non-numeric fields (sha256, timestamps, ok flag, duration) are excluded
    from drift.
* CLI surface — exit codes for missing root, missing baseline, ok drift, etc.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "collect_docs_metrics.py"
)
assert SCRIPT_PATH.is_file(), f"Expected script at {SCRIPT_PATH}"

sys.path.insert(0, str(SCRIPT_PATH.parent))

import collect_docs_metrics as cm  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def docs_root(tmp_path: Path) -> Path:
    """Empty docs/ tree with a `docs/` subdirectory."""
    (tmp_path / "docs").mkdir()
    return tmp_path


def write(rel: str, content: str, root: Path) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")
    return path


def write_bytes(rel: str, data: bytes, root: Path) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


# ---------------------------------------------------------------------------
# collect_docs metric extraction
# ---------------------------------------------------------------------------


class TestCollectDocs:
    def test_empty_docs_is_clean(self, docs_root: Path):
        metrics, files = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert metrics.docs_total_files == 0
        assert metrics.docs_total_bytes == 0
        assert files == []
        assert metrics.docs_sha256_total == ""
        # Empty tree still gets a duration measurement.
        assert metrics.build_duration_seconds >= 0.0

    def test_single_file_counts(self, docs_root: Path):
        write("docs/a.md", "# Heading\nPara text.\n", docs_root)
        metrics, files = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert len(files) == 1
        assert metrics.docs_total_files == 1
        assert metrics.docs_total_lines == 2
        # Words are whitespace-split, so `#` counts as a separate token.
        assert metrics.docs_total_words == 4  # '#', 'Heading', 'Para', 'text.'
        # bytes = '# Heading\nPara text.\n' = 21 bytes
        assert metrics.docs_total_bytes == 21
        assert metrics.docs_largest_file_bytes == 21
        assert metrics.docs_smallest_file_bytes == 21
        assert metrics.docs_avg_file_bytes == 21.0

    def test_max_min_avg_size(self, docs_root: Path):
        write("docs/small.md", "# Tiny\n", docs_root)  # 7 bytes
        write("docs/large.md", "# " + ("x" * 100) + "\n", docs_root)  # 103 bytes
        write("docs/middle.md", "# Mid\n\nPara.\n", docs_root)  # 13 bytes
        metrics, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert metrics.docs_largest_file_bytes == 103
        assert metrics.docs_smallest_file_bytes == 7
        assert metrics.docs_total_files == 3
        assert metrics.docs_avg_file_bytes == pytest.approx(
            (7 + 103 + 13) / 3, rel=1e-9
        )

    def test_heading_levels_split(self, docs_root: Path):
        write(
            "docs/a.md",
            "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n",
            docs_root,
        )
        metrics, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert metrics.heading_count_total == 6
        for level in range(1, 7):
            assert metrics.heading_count_by_level[level] == 1

    def test_link_kinds_split(self, docs_root: Path):
        write(
            "docs/a.md",
            "External [ex](https://example.com).\n"
            "Internal [in](./local.md).\n"
            "Anchor [#top](#top).\n"
            "Image ![alt](pic.png).\n",
            docs_root,
        )
        metrics, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert metrics.link_count_total == 3  # excludes images
        assert metrics.link_count_external == 1
        assert metrics.link_count_internal == 2
        assert metrics.link_count_image == 1

    def test_code_blocks_counted(self, docs_root: Path):
        write(
            "docs/a.md",
            "```python\nimport os\n```\n\n```\nplain\n```\n",
            docs_root,
        )
        metrics, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert metrics.code_block_count == 2

    def test_bom_files_flagged(self, docs_root: Path):
        write_bytes("docs/bom.md", b"\xef\xbb\xbf# BOM\n", docs_root)
        metrics, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert metrics.docs_bom_files == 1

    def test_empty_files_counted(self, docs_root: Path):
        write_bytes("docs/empty.md", b"", docs_root)
        metrics, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert metrics.docs_empty_files == 1

    def test_extension_counter(self, docs_root: Path):
        # The default glob only matches .md files; a .txt file would also be
        # scanned if the user passes a broader glob. Verify counter increments
        # and reports the extension (without the dot).
        write("docs/a.md", "x", docs_root)
        metrics, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert metrics.docs_files_by_extension == {".md": 1}

    def test_extension_label_no_suffix(self, docs_root: Path):
        # A file with no extension (rare for docs but possible) is bucketed
        # into "(none)".
        write("docs/noext", "x", docs_root)
        metrics, _ = cm.collect_docs(docs_root, ("docs/*",))
        assert metrics.docs_files_by_extension.get("(none)") == 1

    def test_sha256_over_concatenated_bytes(self, docs_root: Path):
        write("docs/a.md", "AAA", docs_root)
        write("docs/b.md", "BBB", docs_root)
        metrics, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        import hashlib

        expected = hashlib.sha256(b"AAABBB").hexdigest()
        assert metrics.docs_sha256_total == expected

    def test_sha256_stable_across_runs(self, docs_root: Path):
        write("docs/a.md", "AAA\n", docs_root)
        write("docs/b.md", "BBB\n", docs_root)
        m1, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        m2, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        assert m1.docs_sha256_total == m2.docs_sha256_total


# ---------------------------------------------------------------------------
# Prometheus output
# ---------------------------------------------------------------------------


class TestPrometheusOutput:
    def test_includes_help_lines(self, docs_root: Path):
        write("docs/a.md", "# Title\n", docs_root)
        _, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        m = cm.DocsMetrics(docs_total_files=1)
        out = m.to_prometheus()
        assert out.startswith("# HELP localmind_docs_")
        assert "total_files 1" in out

    def test_dict_flattened_with_labels(self, docs_root: Path):
        m = cm.DocsMetrics(docs_total_files=2)
        m.docs_files_by_extension = {".md": 2}
        out = m.to_prometheus()
        assert 'localmind_docs_files_by_extension{extension=".md"} 2' in out

    def test_heading_levels_labelled_h1_through_h6(self):
        m = cm.DocsMetrics()
        m.heading_count_by_level = {1: 3, 2: 6, 3: 2}
        out = m.to_prometheus()
        assert 'localmind_docs_headings_by_level{level="h1"} 3' in out
        assert 'localmind_docs_headings_by_level{level="h2"} 6' in out
        assert 'localmind_docs_headings_by_level{level="h3"} 2' in out

    def test_sha256_emitted_as_label_on_info_metric(self):
        m = cm.DocsMetrics(docs_sha256_total="abcd" * 16)
        out = m.to_prometheus()
        assert 'localmind_docs_build_info{sha256="abcdabcdabcd"} 1' in out

    def test_empty_metrics_still_renders_clean(self):
        m = cm.DocsMetrics()
        out = m.to_prometheus()
        assert "localmind_docs_total_files 0" in out
        # No trailing content past the final newline.
        assert out.endswith("\n")


# ---------------------------------------------------------------------------
# Drift detection
# ---------------------------------------------------------------------------


class TestDrift:
    def test_identical_tree_no_drift(self, docs_root: Path):
        write("docs/a.md", "# Title\n", docs_root)
        baseline, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        current, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        # Identical docs still record the wall-clock build_duration_seconds,
        # which is timing noise — never compare it. Same for the timestamp
        # and the (here-stable) sha256 / ok flag.
        drift = cm.drift_report(
            current,
            baseline.to_dict(),
            ignored={
                "build_started_at_unix",
                "build_duration_seconds",
                "metric_collection_ok",
                "docs_sha256_total",
            },
            threshold=0.20,
        )
        assert drift == {}

    def test_size_drop_outside_default_threshold(self, docs_root: Path):
        # Baseline: 200 bytes
        write("docs/a.md", "# " + ("x" * 197) + "\n", docs_root)  # 200 bytes incl \n
        baseline, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))

        # Cut to ~7 bytes — that's a 96% drop, outside ±20%.
        write("docs/a.md", "# Tiny\n", docs_root)
        current, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))

        drift = cm.drift_report(
            current,
            baseline.to_dict(),
            ignored={
                "build_started_at_unix",
                "build_duration_seconds",
                "metric_collection_ok",
                "docs_sha256_total",
            },
            threshold=0.20,
        )
        assert "docs_total_bytes" in drift
        assert not drift["docs_total_bytes"]["in_threshold"]

    def test_size_drop_within_per_metric_threshold(self, docs_root: Path):
        write("docs/a.md", "# " + ("x" * 197) + "\n", docs_root)
        baseline, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        # Override the per-metric threshold for docs_total_bytes to +/-100%
        # (any direction, any magnitude) — the 96% drop is within tolerance.
        bl_dict = baseline.to_dict()
        bl_dict["thresholds"] = {"docs_total_bytes": 1.00}

        write("docs/a.md", "# Tiny\n", docs_root)
        current, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))

        drift = cm.drift_report(
            current,
            bl_dict,
            ignored={
                "build_started_at_unix",
                "build_duration_seconds",
                "metric_collection_ok",
                "docs_sha256_total",
            },
            threshold=0.20,
        )
        # The default 0.20 would have failed; the per-metric override (1.00)
        # should make the 96% drop pass.
        assert drift["docs_total_bytes"]["max_pct"] == 1.00
        assert drift["docs_total_bytes"]["in_threshold"]

    def test_non_numeric_metric_excluded(self, docs_root: Path):
        baseline = cm.DocsMetrics(docs_sha256_total="aaa", docs_total_files=1)
        current = cm.DocsMetrics(docs_sha256_total="bbb", docs_total_files=1)
        drift = cm.drift_report(
            current, baseline.to_dict(), ignored=set(), threshold=0.10
        )
        assert "docs_sha256_total" not in drift
        assert "metric_collection_ok" not in drift

    def test_metric_missing_from_baseline_is_skipped(self, docs_root: Path):
        write("docs/a.md", "# Title\n", docs_root)
        current, _ = cm.collect_docs(docs_root, ("docs/**/*.md",))
        baseline_only_files = {"docs_total_files": current.docs_total_files + 999}
        drift = cm.drift_report(
            current, baseline_only_files, ignored=set(), threshold=0.20
        )
        # docs_total_files has both numbers → drift exists; everything else is skipped.
        assert set(drift) == {"docs_total_files"}

    def test_boolean_excluded_from_drift(self):
        baseline = cm.DocsMetrics(metric_collection_ok=True)
        current = cm.DocsMetrics(metric_collection_ok=False)
        drift = cm.drift_report(
            current, baseline.to_dict(), ignored=set(), threshold=0.10
        )
        assert drift == {}


# ---------------------------------------------------------------------------
# CLI subprocess interface
# ---------------------------------------------------------------------------


class TestCli:
    def run_cli(
        self, args: list[str], cwd: Path | None = None
    ) -> subprocess.CompletedProcess:
        cmd = [sys.executable, str(SCRIPT_PATH), *args]
        return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, check=False)

    def test_default_output_is_json(self, docs_root: Path):
        write("docs/a.md", "# Title\n", docs_root)
        result = self.run_cli(["--root", str(docs_root)])
        assert result.returncode == 0
        payload = json.loads(result.stdout)
        assert payload["docs_total_files"] == 1

    def test_prometheus_output_has_help_lines(self, docs_root: Path):
        write("docs/a.md", "# Title\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--prometheus"])
        assert result.returncode == 0
        assert "# HELP localmind_docs_total_files" in result.stdout

    def test_json_and_prometheus_coexist(self, docs_root: Path):
        write("docs/a.md", "# Title\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--prometheus", "--json"])
        assert result.returncode == 0
        # The presence of # HELP lines indicates Prometheus; JSON payload follows.
        assert "# HELP" in result.stdout
        assert "docs_total_files" in result.stdout

    def test_invalid_root_returns_two(self, tmp_path: Path):
        missing = tmp_path / "no-such-dir"
        result = self.run_cli(["--root", str(missing)])
        assert result.returncode == 2

    def test_write_baseline_creates_file(self, docs_root: Path, tmp_path: Path):
        write("docs/a.md", "# Title\n", docs_root)
        out_path = tmp_path / "baseline.json"
        result = self.run_cli(
            [
                "--root",
                str(docs_root),
                "--write-baseline",
                str(out_path),
            ]
        )
        assert result.returncode == 0
        assert out_path.is_file()
        payload = json.loads(out_path.read_text(encoding="utf-8"))
        assert payload["docs_total_files"] == 1

    def test_baseline_check_clean_returns_zero(self, docs_root: Path, tmp_path: Path):
        write("docs/a.md", "# Title\n", docs_root)
        baseline_path = tmp_path / "b.json"
        # Write baseline of the current tree.
        self.run_cli(["--root", str(docs_root), "--write-baseline", str(baseline_path)])
        # Re-scan and check — nothing has changed, should be green.
        result = self.run_cli(
            [
                "--root",
                str(docs_root),
                "--baseline",
                str(baseline_path),
                "--check",
            ]
        )
        assert result.returncode == 0

    def test_baseline_check_drift_returns_one(self, docs_root: Path, tmp_path: Path):
        write("docs/a.md", "# " + ("x" * 197) + "\n", docs_root)
        baseline_path = tmp_path / "b.json"
        self.run_cli(["--root", str(docs_root), "--write-baseline", str(baseline_path)])

        # Shrink the file.
        write("docs/a.md", "# Tiny\n", docs_root)
        result = self.run_cli(
            [
                "--root",
                str(docs_root),
                "--baseline",
                str(baseline_path),
                "--check",
            ]
        )
        assert result.returncode == 1
        assert "docs_total_bytes" in result.stderr

    def test_missing_baseline_returns_two(self, docs_root: Path, tmp_path: Path):
        missing_baseline = tmp_path / "no-baseline.json"
        result = self.run_cli(
            [
                "--root",
                str(docs_root),
                "--baseline",
                str(missing_baseline),
                "--check",
            ]
        )
        assert result.returncode == 2


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
