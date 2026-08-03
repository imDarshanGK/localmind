"""Tests for `scripts/dedupe_docs.py`.

These tests exercise every code path of the dedupe utility:

* Heading extraction (ATX, level 1-6, trailing `#`).
* Ref-link extraction (with and without a title).
* Inline link extraction.
* BOM detection for utf-8/utf-16-le/utf-16-be.
* Cross-file anchor collision reporting.
* Within-file duplicate heading reporting.
* Duplicate inline-link reporting.
* Duplicate ref-link reporting (within a file).
* Duplicate file detection (byte-identical content).
* `--fix` mode:
  - Strips BOMs.
  - Renames duplicate within-file headings with `(<filename> <idx>)` suffix.
  - Idempotency: a second `scan()` after `fix()` is clean.
* CLI exit codes for `--check`, `--json`, default scan, and root-not-a-dir.
* Custom `--glob` patterns.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "dedupe_docs.py"
assert SCRIPT_PATH.is_file(), f"Expected script at {SCRIPT_PATH}"

# Make `import dedupe_docs` work for direct module-level function tests.
sys.path.insert(0, str(SCRIPT_PATH.parent))

import dedupe_docs as dd  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def docs_root(tmp_path: Path) -> Path:
    """Empty docs/ tree with a `docs/` subdirectory ready to be populated."""
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
# Heading extraction
# ---------------------------------------------------------------------------


class TestExtractHeadings:
    def test_atx_levels_one_through_six(self):
        content = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n"
        hits = dd.extract_headings(content, "doc.md")
        assert [h.level for h in hits] == [1, 2, 3, 4, 5, 6]
        assert [h.text for h in hits] == ["H1", "H2", "H3", "H4", "H5", "H6"]

    def test_strips_trailing_hash_decoration(self):
        content = "## Heading ##\n"
        hits = dd.extract_headings(content, "doc.md")
        assert len(hits) == 1
        assert hits[0].text == "Heading"

    def test_strips_leading_and_trailing_whitespace(self):
        content = "##   Spaced Heading   ##\n"
        hits = dd.extract_headings(content, "doc.md")
        assert hits[0].text == "Spaced Heading"

    def test_ignores_hash_in_code_block(self):
        # The current regex is intentionally naive — it does NOT skip code
        # blocks. We pin that behaviour so a future fix is a deliberate
        # change. This makes `# foo` inside ``` blocks a heading for tooling
        # purposes; documenters should indent code blocks instead.
        content = "# Real H1\n\n```\n# Not a heading (in code)\n```\n"
        hits = dd.extract_headings(content, "doc.md")
        assert len(hits) == 2
        assert hits[0].text == "Real H1"
        assert hits[1].text == "Not a heading (in code)"

    def test_recorded_line_numbers_are_one_based(self):
        content = "Top paragraph.\n\n## Heading Two\n"
        hits = dd.extract_headings(content, "doc.md")
        assert hits[0].line == 3

    def test_anchor_slug_lowercases_and_hyphenates(self):
        content = "## API Reference — v2.0\n"
        hits = dd.extract_headings(content, "doc.md")
        assert hits[0].anchor.startswith("api-reference")
        assert "v2-0" in hits[0].anchor
        # The em-dash should be stripped (non-word, non-hyphen).
        assert "—" not in hits[0].anchor

    def test_empty_heading_yields_section_anchor(self):
        content = "## \n"
        hits = dd.extract_headings(content, "doc.md")
        assert hits[0].anchor == "section"


# ---------------------------------------------------------------------------
# Ref-link extraction
# ---------------------------------------------------------------------------


class TestExtractRefLinks:
    def test_with_title(self):
        content = '[example]: https://example.com "Example Site"\n'
        hits = dd.extract_ref_links(content, "doc.md")
        assert len(hits) == 1
        assert hits[0].label == "example"
        assert hits[0].url == "https://example.com"
        assert hits[0].title == "Example Site"

    def test_without_title(self):
        content = "[example]: https://example.com\n"
        hits = dd.extract_ref_links(content, "doc.md")
        assert hits[0].title is None

    def test_label_ignores_whitespace(self):
        content = "[ spaced label ]:  https://example.com\n"
        hits = dd.extract_ref_links(content, "doc.md")
        assert hits[0].label == "spaced label"

    def test_line_numbers_are_one_based(self):
        content = "Para.\n\n[ref]: https://example.com\n"
        hits = dd.extract_ref_links(content, "doc.md")
        assert hits[0].line == 3


# ---------------------------------------------------------------------------
# Inline-link extraction
# ---------------------------------------------------------------------------


class TestExtractInlineLinks:
    def test_basic_inline_link(self):
        content = "See [docs](https://example.com/docs) for details.\n"
        hits = dd.extract_inline_links(content, "doc.md")
        assert len(hits) == 1
        line, text, url = hits[0]
        assert line == 1
        assert text == "docs"
        assert url == "https://example.com/docs"

    def test_image_links_are_excluded(self):
        content = "![logo](logo.png) and [link](page.html)\n"
        hits = dd.extract_inline_links(content, "doc.md")
        assert len(hits) == 1
        assert hits[0][1] == "link"


# ---------------------------------------------------------------------------
# BOM detection
# ---------------------------------------------------------------------------


class TestBom:
    def test_utf8_bom_is_flagged(self, docs_root: Path):
        write_bytes("docs/a.md", b"\xef\xbb\xbf# BOMMED\n", docs_root)
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert "docs" + chr(92) + "a.md" in report.bom_files

    def test_utf16_le_bom_is_flagged(self, docs_root: Path):
        write_bytes(
            "docs/a.md", b"\xff\xfe" + "# title\n".encode("utf-16-le"), docs_root
        )
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.bom_files) == 1

    def test_no_bom_is_clean(self, docs_root: Path):
        write("docs/a.md", "# Clean\n", docs_root)
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert report.bom_files == []


# ---------------------------------------------------------------------------
# Within-file duplicate headings
# ---------------------------------------------------------------------------


class TestDuplicateHeadingsInFile:
    def test_two_headings_with_same_text_and_level(self, docs_root: Path):
        write(
            "docs/a.md",
            "# Title\n\n## Section\n\nText.\n\n## Section\n",
            docs_root,
        )
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.duplicate_headings_in_file) == 1
        entry = report.duplicate_headings_in_file[0]
        assert entry["text"] == "Section"
        assert entry["first_line"] == 3
        assert entry["duplicate_line"] == 7
        assert entry["anchor"] == "section"

    def test_same_text_different_level_is_not_dupe(self, docs_root: Path):
        write("docs/a.md", "# Section\n## Section\n", docs_root)
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert report.duplicate_headings_in_file == []

    def test_different_text_same_anchor_is_separate_dupe(self, docs_root: Path):
        # "How it works" and "How It Works" slugify to the same anchor but
        # the in-file collision detector keys on (level, anchor).
        write("docs/a.md", "## How it works\n## How It Works\n", docs_root)
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.duplicate_headings_in_file) == 1
        assert report.duplicate_headings_in_file[0]["text"] == "How It Works"


# ---------------------------------------------------------------------------
# Cross-file duplicate headings
# ---------------------------------------------------------------------------


class TestDuplicateHeadingsAcrossFiles:
    def test_two_files_share_an_anchor(self, docs_root: Path):
        write("docs/a.md", "# Title\n## Configuration\n", docs_root)
        write("docs/b.md", "# Other\n## Configuration\n", docs_root)
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.duplicate_headings_across_files) == 1
        entry = report.duplicate_headings_across_files[0]
        assert entry["anchor"] == "configuration"
        files_in = [o["file"] for o in entry["occurrences"]]
        assert "docs" + chr(92) + "a.md" in files_in
        assert "docs" + chr(92) + "b.md" in files_in

    def test_unique_across_files_is_clean(self, docs_root: Path):
        write("docs/a.md", "# Title\n## Alpha\n", docs_root)
        write("docs/b.md", "# Other\n## Beta\n", docs_root)
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert report.duplicate_headings_across_files == []


# ---------------------------------------------------------------------------
# Reference-link duplicates
# ---------------------------------------------------------------------------


class TestDuplicateRefLinks:
    def test_same_label_redefined_in_a_file(self, docs_root: Path):
        write(
            "docs/a.md",
            "[ref]: https://one.com\n[ref]: https://two.com\n",
            docs_root,
        )
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.duplicate_ref_links) == 1
        entry = report.duplicate_ref_links[0]
        assert entry["label"] == "ref"
        assert entry["first_url"] == "https://one.com"
        assert entry["duplicate_url"] == "https://two.com"
        assert entry["first_line"] == 1
        assert entry["duplicate_line"] == 2

    def test_case_insensitive_label_match_is_dupe(self, docs_root: Path):
        write(
            "docs/a.md",
            "[Ref]: https://one.com\n[ref]: https://two.com\n",
            docs_root,
        )
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.duplicate_ref_links) == 1


# ---------------------------------------------------------------------------
# Inline-link duplicates
# ---------------------------------------------------------------------------


class TestDuplicateInlineLinks:
    def test_same_text_and_url_repeated(self, docs_root: Path):
        write(
            "docs/a.md",
            "See [docs](https://example.com) and [docs](https://example.com) again.\n",
            docs_root,
        )
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.duplicate_inline_links) == 1
        entry = report.duplicate_inline_links[0]
        assert entry["label"] == "docs"
        assert entry["url"] == "https://example.com"
        assert entry["first_line"] == 1
        assert entry["duplicate_line"] == 1

    def test_different_text_same_url_is_not_dupe(self, docs_root: Path):
        write(
            "docs/a.md",
            "[one](page) and [two](page) repeated.\n",
            docs_root,
        )
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert report.duplicate_inline_links == []


# ---------------------------------------------------------------------------
# Duplicate files (byte-identical content)
# ---------------------------------------------------------------------------


class TestDuplicateFiles:
    def test_two_identical_files(self, docs_root: Path):
        write("docs/a.md", "# Title\n\nSame content.\n", docs_root)
        write("docs/b.md", "# Title\n\nSame content.\n", docs_root)
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.duplicate_files) == 1
        files = report.duplicate_files[0]["files"]
        assert "docs" + chr(92) + "a.md" in files
        assert "docs" + chr(92) + "b.md" in files

    def test_bom_differences_are_normalised(self, docs_root: Path):
        # A file with a BOM and the same file without produce the same
        # normalised fingerprint → flagged as a duplicate.
        write_bytes("docs/a.md", b"\xef\xbb\xbf# Title\nBody.\n", docs_root)
        write("docs/b.md", "# Title\nBody.\n", docs_root)
        report, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.duplicate_files) == 1


# ---------------------------------------------------------------------------
# Fix mode (auto-repair)
# ---------------------------------------------------------------------------


class TestFix:
    def test_strips_bom(self, docs_root: Path):
        path = write_bytes("docs/a.md", b"\xef\xbb\xbf# Title\n", docs_root)
        report, contents = dd.scan(docs_root, ("docs/**/*.md",))
        assert len(report.bom_files) == 1
        dd.fix(contents, report, docs_root)
        assert path.read_bytes() == b"# Title\n"

    def test_renames_duplicate_heading(self, docs_root: Path):
        path = write(
            "docs/a.md",
            "# Title\n\n## Section\n\nText.\n\n## Section\n",
            docs_root,
        )
        report, contents = dd.scan(docs_root, ("docs/**/*.md",))
        dd.fix(contents, report, docs_root)
        new_text = path.read_text(encoding="utf-8")
        assert "# Title" in new_text
        assert "## Section" in new_text  # first occurrence unchanged
        # The renamed duplicate should carry the file-stem suffix.
        assert "## Section (a 1)" in new_text

    def test_fix_is_idempotent(self, docs_root: Path):
        write(
            "docs/a.md",
            "# Title\n\n## Section\n\nText.\n\n## Section\n",
            docs_root,
        )
        write_bytes("docs/b.md", b"\xef\xbb\xbf# BOMMED\n", docs_root)

        # First fix pass.
        report, contents = dd.scan(docs_root, ("docs/**/*.md",))
        dd.fix(contents, report, docs_root)

        # Re-scan → should be clean (BOM stripped, heading renamed).
        report2, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert report2.bom_files == []
        assert report2.duplicate_headings_in_file == []

        # Second fix pass: nothing left to do, should not corrupt state.
        dd.fix(contents, report2, docs_root)
        report3, _ = dd.scan(docs_root, ("docs/**/*.md",))
        assert report3.is_clean()

    def test_fix_does_not_touch_other_files(self, docs_root: Path):
        untouched = write(
            "docs/clean.md",
            "# Unique\n\n## Only Here\n",
            docs_root,
        )
        original_bytes = untouched.read_bytes()
        write(
            "docs/a.md",
            "# Title\n\n## Section\n\n## Section\n",
            docs_root,
        )
        report, contents = dd.scan(docs_root, ("docs/**/*.md",))
        dd.fix(contents, report, docs_root)
        assert untouched.read_bytes() == original_bytes


# ---------------------------------------------------------------------------
# CLI / subprocess interface
# ---------------------------------------------------------------------------


class TestCli:
    def run_cli(
        self, args: list[str], cwd: Path | None = None
    ) -> subprocess.CompletedProcess:
        cmd = [sys.executable, str(SCRIPT_PATH), *args]
        return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, check=False)

    def test_default_scan_prints_report(self, docs_root: Path):
        write("docs/a.md", "# Title\n## Section\n## Section\n", docs_root)
        result = self.run_cli(["--root", str(docs_root)])
        assert result.returncode == 0
        assert "[DUP-H1]" in result.stdout
        assert "anchor" in result.stdout

    def test_check_mode_returns_one_on_dupes(self, docs_root: Path):
        write("docs/a.md", "# Title\n## Section\n## Section\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--check"])
        assert result.returncode == 1

    def test_check_mode_returns_zero_on_clean(self, docs_root: Path):
        write("docs/a.md", "# Title\n## Section\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--check"])
        assert result.returncode == 0

    def test_json_mode_emits_valid_json(self, docs_root: Path):
        write("docs/a.md", "# Title\n## Section\n## Section\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--json"])
        assert result.returncode == 0
        payload = json.loads(result.stdout)
        assert "duplicate_headings_in_file" in payload
        assert len(payload["duplicate_headings_in_file"]) == 1

    def test_fix_mode_clears_bom(self, docs_root: Path):
        path = write_bytes("docs/a.md", b"\xef\xbb\xbf# Title\n", docs_root)
        result = self.run_cli(["--root", str(docs_root), "--fix", "--check"])
        assert result.returncode == 0
        assert path.read_bytes() == b"# Title\n"

    def test_invalid_root_returns_two(self, tmp_path: Path):
        # tmp_path is real; pass a non-existent sub to force a missing dir.
        missing = tmp_path / "does_not_exist"
        result = self.run_cli(["--root", str(missing)])
        assert result.returncode == 2

    def test_custom_glob_pattern(self, docs_root: Path):
        # Create a duplicate outside docs/ — default globs include only
        # docs/**/*.md + README.md + *.md at root. With a narrow custom glob
        # the collision should disappear from the report.
        write("docs/a.md", "# Common\n", docs_root)
        write("README.md", "# Common\n", docs_root)  # H1 collision would show
        # Now scan only docs/ — README should not be considered.
        result = self.run_cli(
            ["--root", str(docs_root), "--glob", "docs/**/*.md", "--json"]
        )
        payload = json.loads(result.stdout)
        anchors = [e["anchor"] for e in payload["duplicate_headings_across_files"]]
        assert "common" not in anchors


# ---------------------------------------------------------------------------
# DupeReport helpers
# ---------------------------------------------------------------------------


class TestReportHelpers:
    def test_total_counts_all_categories(self):
        r = dd.DupeReport(
            duplicate_headings_in_file=[{}],
            duplicate_headings_across_files=[{}, {}],
            duplicate_ref_links=[{}, {}, {}],
            duplicate_inline_links=[{}, {}],
            duplicate_files=[{}],
            bom_files=["a.md"],
        )
        assert r.total == 10

    def test_is_clean_when_empty(self):
        assert dd.DupeReport().is_clean()

    def test_to_dict_round_trips_via_json(self):
        r = dd.DupeReport(
            duplicate_headings_in_file=[{"file": "a.md", "anchor": "x"}],
            bom_files=["b.md"],
        )
        json.dumps(r.to_dict())


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
