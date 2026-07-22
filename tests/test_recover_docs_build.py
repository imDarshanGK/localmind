"""Tests for `scripts/recover_docs_build.py`.

Coverage:

- BOM detection (utf-8 / utf-16 LE / utf-16 BE)
- CRLF line endings
- Trailing whitespace
- Missing final newline
- Duplicate headings:
  - within a file
  - across files (cross-file anchor collision)
- Empty file (zero bytes)
- Unicode replacement chars (U+FFFD)
- Circular local-link chain detection
- Baseline sha256 mismatch
- Apply (--apply) mode:
  - strip BOMs
  - normalise CRLF to LF
  - strip trailing whitespace
  - append final newline
  - rename duplicate within-file headings with (`<file> <idx>`) suffix
  - idempotence (second pass is clean)
  - side-effect isolation (untouched files stay byte-identical)
- CLI surface:
  - exit codes for default scan, --check, --apply, --apply --check,
    --baseline, missing root, missing baseline
  - --json emits a parseable plan
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "recover_docs_build.py"
)
assert SCRIPT_PATH.is_file(), f"Expected script at {SCRIPT_PATH}"

sys.path.insert(0, str(SCRIPT_PATH.parent))

import recover_docs_build as rc  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def docs_root(tmp_path: Path) -> Path:
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
# slugify
# ---------------------------------------------------------------------------


class TestSlugify:
    def test_basic_lower_hyphenation(self):
        assert rc.slugify("API Reference") == "api-reference"

    def test_keeps_dots_as_separators(self):
        assert rc.slugify("v2.0") == "v2-0"

    def test_strips_punctuation(self):
        assert rc.slugify("What's New?!") == "whats-new"

    def test_empty_yields_section(self):
        assert rc.slugify("") == "section"


# ---------------------------------------------------------------------------
# Failure detection
# ---------------------------------------------------------------------------


class TestBom:
    def test_utf8_bom_flagged_as_repairable(self, docs_root: Path):
        write_bytes("docs/a.md", b"\xef\xbb\xbf# BOMMED\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        bom_fails = [f for f in plan.failures if f.mode == rc.FAILURE_BOM]
        assert len(bom_fails) == 1
        assert bom_fails[0].auto_repairable

    def test_utf16_le_bom_flagged(self, docs_root: Path):
        write_bytes(
            "docs/a.md", b"\xff\xfe" + "# title\n".encode("utf-16-le"), docs_root
        )
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert any(f.mode == rc.FAILURE_BOM for f in plan.failures)

    def test_no_bom_is_clean(self, docs_root: Path):
        write("docs/a.md", "# Clean\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert not any(f.mode == rc.FAILURE_BOM for f in plan.failures)


class TestCrlf:
    def test_crlf_detected(self, docs_root: Path):
        # Use bytes to ensure CRLF survives write_text's newline transformation.
        write_bytes("docs/a.md", b"# Title\r\n\r\nPara.\r\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        crlf = [f for f in plan.failures if f.mode == rc.FAILURE_CRLF]
        assert len(crlf) == 1
        assert crlf[0].auto_repairable

    def test_lf_is_clean(self, docs_root: Path):
        write_bytes("docs/a.md", b"# Title\n\nPara.\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert not any(f.mode == rc.FAILURE_CRLF for f in plan.failures)


class TestTrailingWhitespace:
    def test_trailing_spaces_flagged(self, docs_root: Path):
        write("docs/a.md", "# Title   \n\nPara.\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        ws = [f for f in plan.failures if f.mode == rc.FAILURE_TRAILING_WS]
        assert len(ws) == 1
        assert ws[0].line == 1

    def test_clean_lines_no_failure(self, docs_root: Path):
        write("docs/a.md", "# Title\n\nPara.\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert not any(f.mode == rc.FAILURE_TRAILING_WS for f in plan.failures)


class TestMissingFinalNewline:
    def test_missing_newline_flagged(self, docs_root: Path):
        write_bytes("docs/a.md", b"# No newline at EOF", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        mn = [f for f in plan.failures if f.mode == rc.FAILURE_MISSING_NEWLINE]
        assert len(mn) == 1

    def test_with_newline_clean(self, docs_root: Path):
        write("docs/a.md", "# Has newline\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert not any(f.mode == rc.FAILURE_MISSING_NEWLINE for f in plan.failures)


class TestDuplicateAnchors:
    def test_within_file_duplicate_heading(self, docs_root: Path):
        write("docs/a.md", "# Title\n\n## Section\n\n## Section\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        anchor_fails = [
            f for f in plan.failures if f.mode == rc.FAILURE_DUPLICATE_ANCHOR
        ]
        assert len(anchor_fails) == 1
        assert anchor_fails[0].line == 5
        assert "Within-file" not in anchor_fails[0].detail  # implicit

    def test_cross_file_duplicate_anchor(self, docs_root: Path):
        write("docs/a.md", "## Section\n", docs_root)
        write("docs/b.md", "## Section\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        cross = [
            f
            for f in plan.failures
            if f.mode == rc.FAILURE_DUPLICATE_ANCHOR and "Cross-file" in f.detail
        ]
        assert len(cross) == 1

    def test_unique_anchors_no_failure(self, docs_root: Path):
        write("docs/a.md", "# A\n## Alpha\n", docs_root)
        write("docs/b.md", "# B\n## Beta\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert not any(f.mode == rc.FAILURE_DUPLICATE_ANCHOR for f in plan.failures)


class TestEmptyFile:
    def test_empty_file_flagged(self, docs_root: Path):
        write_bytes("docs/empty.md", b"", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        ef = [f for f in plan.failures if f.mode == rc.FAILURE_EMPTY_FILE]
        assert len(ef) == 1
        assert not ef[0].auto_repairable


class TestUnicodeReplacement:
    def test_replacement_char_flagged(self, docs_root: Path):
        # Inject a U+FFFD by writing a bad-utf8 sequence (0xC3 0x28 is invalid utf-8).
        write_bytes("docs/a.md", b"# Title with bad \xc3\x28 byte\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        ur = [f for f in plan.failures if f.mode == rc.FAILURE_UNICODE_REPLACEMENT]
        assert len(ur) == 1
        assert not ur[0].auto_repairable

    def test_clean_utf8_no_failure(self, docs_root: Path):
        write("docs/a.md", "# Title with中文\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert not any(f.mode == rc.FAILURE_UNICODE_REPLACEMENT for f in plan.failures)


class TestBaselineDrift:
    def test_match_no_drift(self, docs_root: Path):
        write("docs/a.md", "# Title\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        # Use the same tree's sha as the baseline → no drift.
        plan2, _ = rc.detect_failures(
            docs_root, files, baseline_sha=plan.current_sha256
        )
        assert not any(f.mode == rc.FAILURE_BASELINE_DRIFT for f in plan2.failures)

    def test_mismatch_flagged(self, docs_root: Path):
        write("docs/a.md", "# Title\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha="deadbeef" * 16)
        drift = [f for f in plan.failures if f.mode == rc.FAILURE_BASELINE_DRIFT]
        assert len(drift) == 1
        assert not drift[0].auto_repairable


class TestCircularLinks:
    def test_self_link_is_circular(self, docs_root: Path):
        write("docs/a.md", "# A\n[self](a.md)\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        circ = [f for f in plan.failures if f.mode == rc.FAILURE_CIRCULAR_LINK]
        assert len(circ) >= 1

    def test_two_file_cycle(self, docs_root: Path):
        write("docs/a.md", "# A\n[next](b.md)\n", docs_root)
        write("docs/b.md", "# B\n[back](a.md)\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        circ = [f for f in plan.failures if f.mode == rc.FAILURE_CIRCULAR_LINK]
        assert len(circ) >= 1

    def test_acyclic_links_clean(self, docs_root: Path):
        write("docs/a.md", "# A\n[next](b.md)\n", docs_root)
        write("docs/b.md", "# B\n[home](README.md)\n", docs_root)
        write("README.md", "# Home\n[note](docs/a.md)\n", docs_root)
        files = rc.collect_docs(docs_root, ("**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert not any(f.mode == rc.FAILURE_CIRCULAR_LINK for f in plan.failures)

    def test_external_links_are_excluded(self, docs_root: Path):
        # http(s)://... and #anchors must not enter the local-link graph.
        write("docs/a.md", "# A\n[ex](https://example.com)\n[top](#top)\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert not any(f.mode == rc.FAILURE_CIRCULAR_LINK for f in plan.failures)


# ---------------------------------------------------------------------------
# Apply mode (--apply)
# ---------------------------------------------------------------------------


class TestApply:
    def test_strips_bom(self, docs_root: Path):
        path = write_bytes("docs/a.md", b"\xef\xbb\xbf# Title\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, contents = rc.detect_failures(docs_root, files, baseline_sha=None)
        log = rc.apply_repairs(docs_root, plan, contents)
        assert path.read_bytes() == b"# Title\n"
        assert any(r["mode"] == rc.FAILURE_BOM for r in log)

    def test_normalises_crlf(self, docs_root: Path):
        path = write_bytes("docs/a.md", b"# Title\r\n\r\nPara.\r\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, contents = rc.detect_failures(docs_root, files, baseline_sha=None)
        rc.apply_repairs(docs_root, plan, contents)
        assert path.read_bytes() == b"# Title\n\nPara.\n"

    def test_trailing_whitespace_stripped(self, docs_root: Path):
        path = write_bytes("docs/a.md", b"# Title   \n\nPara.   \n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, contents = rc.detect_failures(docs_root, files, baseline_sha=None)
        rc.apply_repairs(docs_root, plan, contents)
        assert path.read_bytes() == b"# Title\n\nPara.\n"

    def test_appends_final_newline(self, docs_root: Path):
        path = write_bytes("docs/a.md", b"# No newline at EOF", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, contents = rc.detect_failures(docs_root, files, baseline_sha=None)
        rc.apply_repairs(docs_root, plan, contents)
        assert path.read_bytes() == b"# No newline at EOF\n"

    def test_renames_duplicate_heading(self, docs_root: Path):
        path = write("docs/a.md", "# Title\n\n## Section\n\n## Section\n", docs_root)
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, contents = rc.detect_failures(docs_root, files, baseline_sha=None)
        rc.apply_repairs(docs_root, plan, contents)
        text = path.read_text(encoding="utf-8")
        assert "## Section" in text  # first occurrence unchanged
        assert "## Section (a 1)" in text  # duplicate renamed

    def test_idempotent(self, docs_root: Path):
        # Seed all four auto-repairable deficiencies in one file.
        write_bytes(
            "docs/a.md",
            b"\xef\xbb\xbf# Title\r\n\r\n## Section\r\n\r\n## Section   ",
            docs_root,
        )

        # Pass 1.
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, contents = rc.detect_failures(docs_root, files, baseline_sha=None)
        rc.apply_repairs(docs_root, plan, contents)

        # Re-inspect and re-apply (idempotence check).
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan2, contents2 = rc.detect_failures(docs_root, files, baseline_sha=None)
        log2 = rc.apply_repairs(docs_root, plan2, contents2)

        # Second pass should not record applied repairs (no change).
        # Note: the cross-file duplicate-heading check is independent of the
        # file content; only within-file is touched here. So the only
        # remaining legitimate "failure" is any cross-file issue — there are
        # none in this isolated fixture, so log2 must be empty.
        assert log2 == []
        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan3, _ = rc.detect_failures(docs_root, files, baseline_sha=None)
        assert plan3.is_clean()

    def test_side_effect_isolation(self, docs_root: Path):
        untouched = write("docs/clean.md", "# Unique Title\n", docs_root)
        original = untouched.read_bytes()
        # Plant a messy file alongside.
        write_bytes("docs/messy.md", b"\xef\xbb\xbf# Messy   \r\n", docs_root)

        files = rc.collect_docs(docs_root, ("docs/**/*.md",))
        plan, contents = rc.detect_failures(docs_root, files, baseline_sha=None)
        rc.apply_repairs(docs_root, plan, contents)
        assert untouched.read_bytes() == original


# ---------------------------------------------------------------------------
# RecoveryPlan helpers
# ---------------------------------------------------------------------------


class TestPlanHelpers:
    def test_total_failures(self):
        plan = rc.RecoveryPlan(
            failures=[
                rc.Failure(mode=rc.FAILURE_BOM, file="a.md"),
                rc.Failure(mode=rc.FAILURE_CRLF, file="b.md"),
            ]
        )
        assert plan.total_failures == 2
        assert len(plan.repairable_failures) == 0
        assert len(plan.unrepairable_failures) == 2

    def test_repairable_partition(self):
        plan = rc.RecoveryPlan(
            failures=[
                rc.Failure(mode=rc.FAILURE_BOM, file="a.md", auto_repairable=True),
                rc.Failure(
                    mode=rc.FAILURE_EMPTY_FILE, file="b.md", auto_repairable=False
                ),
            ]
        )
        assert len(plan.repairable_failures) == 1
        assert len(plan.unrepairable_failures) == 1
        assert plan.total_failures == 2

    def test_is_clean(self):
        assert rc.RecoveryPlan().is_clean()
        plan = rc.RecoveryPlan(failures=[rc.Failure(mode="x", file="a.md")])
        assert not plan.is_clean()

    def test_to_dict_has_required_fields(self):
        plan = rc.RecoveryPlan(baseline_sha256="aaa", current_sha256="bbb")
        d = plan.to_dict()
        assert "failures" in d
        assert "applied_repairs" in d
        assert "baseline_sha256" in d
        assert "current_sha256" in d
        assert "total_failures" in d
        assert "total_repairable" in d
        assert "total_unrepairable" in d


# ---------------------------------------------------------------------------
# CLI subprocess interface
# ---------------------------------------------------------------------------


class TestCli:
    def run_cli(
        self, args: list[str], cwd: Path | None = None
    ) -> subprocess.CompletedProcess:
        cmd = [sys.executable, str(SCRIPT_PATH), *args]
        return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, check=False)

    def test_default_scan_prints_plan(self, docs_root: Path):
        write_bytes("docs/a.md", b"\xef\xbb\xbf# BOM\n", docs_root)
        result = self.run_cli(["--root", str(docs_root)])
        assert result.returncode == 0
        assert "bom_detected" in result.stdout

    def test_check_returns_one_on_failure(self, docs_root: Path):
        write_bytes("docs/a.md", b"\xef\xbb\xbf# BOM\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--check"])
        assert result.returncode == 1

    def test_check_returns_zero_on_clean(self, docs_root: Path):
        write("docs/a.md", "# Clean\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--check"])
        assert result.returncode == 0

    def test_apply_repairs_bom(self, docs_root: Path):
        path = write_bytes("docs/a.md", b"\xef\xbb\xbf# Title\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--apply", "--check"])
        assert result.returncode == 0
        assert path.read_bytes() == b"# Title\n"

    def test_json_emits_valid_plan(self, docs_root: Path):
        write_bytes("docs/a.md", b"\xef\xbb\xbf# Title\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--json"])
        assert result.returncode == 0
        payload = json.loads(result.stdout)
        assert "failures" in payload
        assert payload["total_failures"] == 1

    def test_baseline_mismatch_exit_one(self, docs_root: Path, tmp_path: Path):
        write("docs/a.md", "# Title\n", docs_root)
        baseline_path = tmp_path / "baseline.json"
        baseline_path.write_text(
            json.dumps({"docs_sha256_total": "deadbeef" * 16}) + "\n",
            encoding="utf-8",
        )
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

    def test_baseline_match_exit_zero(self, docs_root: Path, tmp_path: Path):
        write("docs/a.md", "# Title\n", docs_root)
        # First: read current sha via JSON.
        scan = self.run_cli(["--root", str(docs_root), "--json"])
        payload = json.loads(scan.stdout)
        baseline_path = tmp_path / "baseline.json"
        baseline_path.write_text(
            json.dumps({"docs_sha256_total": payload["current_sha256"]}) + "\n",
            encoding="utf-8",
        )
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

    def test_missing_root_returns_two(self, tmp_path: Path):
        missing = tmp_path / "nonexistent"
        result = self.run_cli(["--root", str(missing)])
        assert result.returncode == 2

    def test_missing_baseline_returns_two(self, docs_root: Path, tmp_path: Path):
        missing_baseline = tmp_path / "no-such.json"
        result = self.run_cli(
            [
                "--root",
                str(docs_root),
                "--baseline",
                str(missing_baseline),
            ]
        )
        assert result.returncode == 2

    def test_baseline_missing_sha_key_returns_two(
        self, docs_root: Path, tmp_path: Path
    ):
        bad_baseline = tmp_path / "bad.json"
        # JSON without docs_sha256_total key.
        bad_baseline.write_text('{"total_files": 1}\n', encoding="utf-8")
        result = self.run_cli(
            [
                "--root",
                str(docs_root),
                "--baseline",
                str(bad_baseline),
            ]
        )
        assert result.returncode == 2


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
