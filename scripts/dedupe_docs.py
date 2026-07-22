#!/usr/bin/env python3
"""
Dedupe docs — detect and optionally repair duplicate content in markdown docs.

The "build and deploy docs" pipeline for LocalMind is the GitHub workflow
`.github/workflows/docs-regression.yml`, which lints every `docs/**/*.md`
file and `README.md` for markdown regressions and broken links before the
docs are considered deploy-ready. This utility complements that pipeline by
adding **content-level dedupe**:

1. **Duplicate headings within a file** — repeated H1/H2/H3 text that
   would collide when a static site generator derives anchors.
2. **Duplicate headings across files** — same anchor resolved to two
   different files, breaking in-page and cross-doc links.
3. **Duplicate inline link targets within a file** — the same `[label]: url`
   reference defined twice or the same `[text](url)` repeated verbatim.
4. **Broken duplicate reference-style links** — references that resolve to
   the same URL with conflicting titles.
5. **Bytes-level duplicate files** — two docs with identical content, or
   two docs that differ only in byte order mark (BOM) noise.

Exit codes (CI-friendly):
- `0` — no duplicates found (or `--fix` repaired everything)
- `1` — duplicates detected in `--check` mode (fails the build)
- `2` — I/O error or invalid arguments

Usage:
    python scripts/dedupe_docs.py                  # scan only, print report
    python scripts/dedupe_docs.py --check         # exit 1 if dupes detected
    python scripts/dedupe_docs.py --fix           # rewrite files to repair
    python scripts/dedupe_docs.py --fix --check   # repair + verify clean
    python scripts/dedupe_docs.py --json          # machine-readable report

The implementation intentionally avoids third-party dependencies so it can
run in any Python 3.11+ environment, including a minimal CI runner.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

REPO_ROOT_DEFAULT = Path(__file__).resolve().parent.parent
DOCS_DEFAULT_GLOBS = ("docs/**/*.md", "README.md", "*.md")

# Match ATX-style headings: 1-6 '#' chars followed by space + text (the text
# may be empty; we flag empty headings as a defect too).
# Captures the level (group 1) and the raw heading text (group 2).
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$", re.MULTILINE)

# Match reference-style link definitions: `[label]: url "optional title"`
# Captures label (group 1), url (group 2), optional title (group 3).
REF_LINK_RE = re.compile(
    r"^\s*\[([^\]]+)\]:\s*(\S+)(?:\s+\"([^\"]*)\")?\s*$", re.MULTILINE
)

# Match inline links: `[text](url)` (image links `![alt](url)` are excluded
# because duplicate image URLs to the same asset are normal, not a defect).
INLINE_LINK_RE = re.compile(r"(?<!\!)\[([^\]]+)\]\(([^)]+)\)")

# Byte-order mark — UTF-8 BOM is EF BB BF; UTF-16 LE BOM is FF FE; UTF-16 BE is FE FF.
BOMS = (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff")


@dataclass
class HeadingHit:
    """One heading occurrence in one file."""

    file: str
    line: int
    level: int
    text: str

    @property
    def anchor(self) -> str:
        """GitHub-style slug: lowercase, strip punctuation except dot/dash,
        hyphen-join whitespace/strike sequences, strip edges."""
        slug = self.text.lower()
        # Preserve the version separators in dotted numerics by converting
        # dots inside word sequences to hyphens (so "v2.0" → "v2-0") instead
        # of stripping them entirely. Other punctuation is dropped.
        slug = re.sub(r"[^\w\s.\-]", "", slug)
        slug = re.sub(r"\.", "-", slug)
        slug = re.sub(r"[\s_]+", "-", slug)
        slug = re.sub(r"-+", "-", slug).strip("-")
        return slug or "section"


@dataclass
class RefLinkHit:
    """One reference-style link definition in one file."""

    file: str
    line: int
    label: str
    url: str
    title: str | None


@dataclass
class DupeReport:
    """Aggregated duplicate report for the whole docs tree."""

    duplicate_headings_in_file: list[dict] = field(default_factory=list)
    duplicate_headings_across_files: list[dict] = field(default_factory=list)
    duplicate_ref_links: list[dict] = field(default_factory=list)
    duplicate_inline_links: list[dict] = field(default_factory=list)
    duplicate_files: list[dict] = field(default_factory=list)
    bom_files: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return (
            len(self.duplicate_headings_in_file)
            + len(self.duplicate_headings_across_files)
            + len(self.duplicate_ref_links)
            + len(self.duplicate_inline_links)
            + len(self.duplicate_files)
            + len(self.bom_files)
        )

    def to_dict(self) -> dict:
        return asdict(self)

    def is_clean(self) -> bool:
        return self.total == 0


def collect_docs(root: Path, globs: Iterable[str]) -> list[Path]:
    """Return sorted list of markdown files in `root` matching any of `globs`."""
    found: set[Path] = set()
    for pattern in globs:
        for path in root.glob(pattern):
            if path.is_file():
                found.add(path.resolve())
    return sorted(found)


def strip_bom(content: str) -> str:
    """Strip a leading Unicode BOM if present (Python's `open` already does this
    when opened in text mode with UTF-8, but we read bytes for fingerprinting so
    we sometimes need to normalise the decoded form too)."""
    return content.lstrip("\ufeff").lstrip("\ufffe").lstrip("\uffff")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def extract_headings(content: str, file: str) -> list[HeadingHit]:
    hits: list[HeadingHit] = []
    for match in HEADING_RE.finditer(content):
        level = len(match.group(1))
        text = match.group(2).strip()
        # match.start(2) is the position of the heading text (after the `# `s),
        # which is the user-visible content. We derive line numbers from that
        # position to avoid off-by-one drift from `^` start-of-line anchors.
        anchor_pos = (
            match.start(2)
            if match.lastindex and match.lastindex >= 2
            else match.start()
        )
        line = content.count("\n", 0, anchor_pos) + 1
        hits.append(HeadingHit(file=file, line=line, level=level, text=text))
    return hits


def extract_ref_links(content: str, file: str) -> list[RefLinkHit]:
    hits: list[RefLinkHit] = []
    for match in REF_LINK_RE.finditer(content):
        label = match.group(1).strip()
        url = match.group(2).strip()
        title = match.group(3)
        # `^\s*\[` makes match.start() land at the start-of-line anchor, not
        # at the `[`. Use the position of group 1 (the label) for accurate
        # user-visible line numbers.
        anchor_pos = match.start(1)
        line = content.count("\n", 0, anchor_pos) + 1
        hits.append(RefLinkHit(file=file, line=line, label=label, url=url, title=title))
    return hits


def extract_inline_links(content: str, file: str) -> list[tuple[int, str, str]]:
    """Return list of (line, text, url) tuples for `[text](url)` inline links."""
    hits: list[tuple[int, str, str]] = []
    for match in INLINE_LINK_RE.finditer(content):
        text = match.group(1)
        url = match.group(2).strip()
        anchor_pos = match.start(1)
        line = content.count("\n", 0, anchor_pos) + 1
        hits.append((line, text, url))
    return hits


def scan(root: Path, globs: Iterable[str]) -> tuple[DupeReport, dict[Path, str]]:
    """Scan all matching markdown files and return a `DupeReport` plus a map of
    `{file_path: raw_content}` so callers can perform `--fix` rewrites without
    re-reading from disk."""
    files = collect_docs(root, globs)
    report = DupeReport()
    contents: dict[Path, str] = {}

    # Per-file fingerprint: sha256 of the BOM-stripped, CRLF-normalized content.
    file_fingerprints: dict[Path, str] = {}

    for path in files:
        raw = path.read_bytes()
        # Detect BOM noise — flag for the report, do not auto-rewrite unless --fix.
        has_bom = any(raw.startswith(bom) for bom in BOMS)
        if has_bom:
            report.bom_files.append(str(path.relative_to(root)))
        text = raw.decode("utf-8", errors="replace")
        text = strip_bom(text)
        contents[path] = text
        rel = str(path.relative_to(root))
        fingerprint = sha256_text(text.replace("\r\n", "\n"))
        # Track exact-byte duplicates — two files with the same normalised content.
        for other_path, other_fp in file_fingerprints.items():
            if other_fp == fingerprint:
                report.duplicate_files.append(
                    {
                        "files": [
                            str(other_path.relative_to(root)),
                            rel,
                        ],
                        "sha256": fingerprint,
                    }
                )
                break
        else:
            file_fingerprints[path] = fingerprint

        headings = extract_headings(text, rel)
        ref_links = extract_ref_links(text, rel)
        inline_links = extract_inline_links(text, rel)

        # 1) Duplicate headings within a single file (same anchor + same level).
        seen_anchors: dict[tuple[int, str], HeadingHit] = {}
        for hit in headings:
            key = (hit.level, hit.anchor)
            if key in seen_anchors:
                first = seen_anchors[key]
                report.duplicate_headings_in_file.append(
                    {
                        "file": hit.file,
                        "level": hit.level,
                        "anchor": hit.anchor,
                        "first_line": first.line,
                        "duplicate_line": hit.line,
                        "text": hit.text,
                    }
                )
            else:
                seen_anchors[key] = hit

        # 2) Duplicate ref-link labels within a single file — redefining the
        # same `[label]` produces ambiguous renders on some static site gens.
        seen_ref_labels: dict[str, RefLinkHit] = {}
        for hit in ref_links:
            key = hit.label.lower()
            if key in seen_ref_labels:
                first = seen_ref_labels[key]
                report.duplicate_ref_links.append(
                    {
                        "file": hit.file,
                        "label": hit.label,
                        "first_line": first.line,
                        "first_url": first.url,
                        "duplicate_line": hit.line,
                        "duplicate_url": hit.url,
                    }
                )
            else:
                seen_ref_labels[key] = hit

        # 3) Duplicate inline links — same (text, url) repeated in the file.
        # We only flag exact (text, url) duplicates to avoid false positives
        # on common utility links like `[Edit](edit-url)` repeated for each
        # section. The first occurrence is not flagged; only the duplicates.
        seen_inline: dict[tuple[str, str], int] = {}
        for line, text_l, url in inline_links:
            key = (text_l.strip(), url)
            if key in seen_inline:
                report.duplicate_inline_links.append(
                    {
                        "file": rel,
                        "label": text_l,
                        "url": url,
                        "first_line": seen_inline[key],
                        "duplicate_line": line,
                    }
                )
            else:
                seen_inline[key] = line

    # 4) Duplicate headings across files — the same anchor resolves to two
    # different files. This breaks cross-doc deep links because GitHub and
    # most static site generators pick the first match per slug.
    by_anchor: dict[str, list[HeadingHit]] = {}
    for path in files:
        rel = str(path.relative_to(root))
        for hit in extract_headings(contents[path], rel):
            by_anchor.setdefault(hit.anchor, []).append(hit)
    for anchor, hits in by_anchor.items():
        files_with = {h.file for h in hits}
        if len(files_with) > 1:
            report.duplicate_headings_across_files.append(
                {
                    "anchor": anchor,
                    "occurrences": [
                        {
                            "file": h.file,
                            "line": h.line,
                            "level": h.level,
                            "text": h.text,
                        }
                        for h in hits
                    ],
                }
            )

    return report, contents


def fix(contents: dict[Path, str], report: DupeReport, root: Path) -> list[str]:
    """Apply automated repairs to the in-memory file contents.

    Repairs performed:
    - Strip BOMs (rewrites file with UTF-8, no BOM).
    - Rename duplicate in-file headings by appending ` (file basename)` to
      resolve anchor collisions. The FIRST occurrence is preserved; later
      duplicates get renamed.

    Duplicate reference-link labels and duplicate files are NOT auto-fixed
    because the correct fix is content-dependent and may need human review.

    Returns a list of human-readable change descriptions for the audit log.
    """
    changes: list[str] = []

    # Strip BOMs — write the same decoded content back without BOM.
    for path in contents:
        raw = path.read_bytes()
        for bom in BOMS:
            if raw.startswith(bom):
                path.write_text(contents[path], encoding="utf-8", newline="\n")
                changes.append(f"stripped BOM from {path.relative_to(root)}")
                break

    # Rename duplicate in-file headings.
    # Group by (file, level, anchor); for each group after the first,
    # append a unique suffix.
    by_key: dict[tuple[str, int, str], list[dict]] = {}
    for entry in report.duplicate_headings_in_file:
        key = (entry["file"], entry["level"], entry["anchor"])
        by_key.setdefault(key, []).append(entry)

    for (file_rel, level, anchor), entries in by_key.items():
        path = root / file_rel
        text = contents[path]
        suffix_base = Path(file_rel).stem
        for idx, entry in enumerate(entries, start=1):
            old_line = entry["duplicate_line"]
            old_text = entry["text"]
            new_text = f"{old_text} ({suffix_base} {idx})"
            lines = text.split("\n")
            # Find the line that starts with the matching heading prefix and
            # whose text matches — line numbers are 1-based.
            target_idx = old_line - 1
            if 0 <= target_idx < len(lines):
                old_heading_line = lines[target_idx]
                # Replace the heading text but preserve the level prefix.
                m = re.match(r"^(#{1,6}\s+)(.+?)(\s*#*\s*)$", old_heading_line)
                if m:
                    lines[target_idx] = f"{m.group(1)}{new_text}{m.group(3)}"
                    changes.append(
                        f"renamed duplicate heading in {file_rel}:{old_line} "
                        f"'{old_text}' -> '{new_text}'"
                    )
            text = "\n".join(lines)
        contents[path] = text
        path.write_text(text, encoding="utf-8", newline="\n")

    return changes


def format_report(report: DupeReport, root: Path) -> str:
    """Render a human-readable report string."""
    if report.is_clean():
        return "No duplicates detected. Docs are deploy-ready."

    lines: list[str] = []
    lines.append(f"Found {report.total} duplicate issue(s) in docs:")
    lines.append("")

    if report.bom_files:
        lines.append(f"[BOM] {len(report.bom_files)} file(s) carry a byte-order mark:")
        for f in report.bom_files:
            lines.append(f"  - {f}")
        lines.append("")

    if report.duplicate_files:
        lines.append(
            f"[DUP-FILE] {len(report.duplicate_files)} byte-identical doc pair(s):"
        )
        for d in report.duplicate_files:
            lines.append(f"  - sha256={d['sha256'][:12]}… {', '.join(d['files'])}")
        lines.append("")

    if report.duplicate_headings_in_file:
        lines.append(
            f"[DUP-H1] {len(report.duplicate_headings_in_file)} duplicate heading(s) "
            "within a file (anchor collision):"
        )
        for d in report.duplicate_headings_in_file:
            lines.append(
                f"  - {d['file']}:{d['duplicate_line']} "
                f"H{d['level']} '{d['text']}' (anchor `#{d['anchor']}`, "
                f"first defined at line {d['first_line']})"
            )
        lines.append("")

    if report.duplicate_headings_across_files:
        lines.append(
            f"[DUP-HX] {len(report.duplicate_headings_across_files)} anchor(s) "
            "duplicate across files:"
        )
        for d in report.duplicate_headings_across_files:
            files_list = ", ".join(
                f"{o['file']}:{o['line']} (H{o['level']}, '{o['text']}')"
                for o in d["occurrences"]
            )
            lines.append(f"  - anchor `#{d['anchor']}` in: {files_list}")
        lines.append("")

    if report.duplicate_ref_links:
        lines.append(
            f"[DUP-REF] {len(report.duplicate_ref_links)} redefined reference link(s):"
        )
        for d in report.duplicate_ref_links:
            lines.append(
                f"  - {d['file']}:{d['duplicate_line']} label '{d['label']}' "
                f"(first at line {d['first_line']} → {d['first_url']}, "
                f"redefined → {d['duplicate_url']})"
            )
        lines.append("")

    if report.duplicate_inline_links:
        lines.append(
            f"[DUP-INLINE] {len(report.duplicate_inline_links)} repeated inline link(s):"
        )
        for d in report.duplicate_inline_links:
            lines.append(
                f"  - {d['file']}:{d['duplicate_line']} '[{d['label']}]({d['url']})' "
                f"(first at line {d['first_line']})"
            )
        lines.append("")

    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Detect and repair duplicate content in markdown docs."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=REPO_ROOT_DEFAULT,
        help="Repository root (default: parent of this script).",
    )
    parser.add_argument(
        "--glob",
        action="append",
        default=None,
        dest="globs",
        help="Glob pattern to scan (repeat for multiple). Defaults to "
        "'docs/**/*.md README.md *.md'.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if duplicates are detected (CI mode).",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Apply automated repairs to the filesystem.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the report as JSON instead of human-readable text.",
    )

    args = parser.parse_args(argv)
    globs = tuple(args.globs) if args.globs else DOCS_DEFAULT_GLOBS
    root = args.root.resolve()

    if not root.is_dir():
        print(f"error: root is not a directory: {root}", file=sys.stderr)
        return 2

    try:
        report, contents = scan(root, globs)
    except OSError as exc:
        print(f"error: failed to scan docs: {exc}", file=sys.stderr)
        return 2

    if args.fix:
        changes = fix(contents, report, root)
        if changes:
            print(f"Applied {len(changes)} repair(s):")
            for change in changes:
                print(f"  - {change}")
            # Re-scan after repairs to confirm clean state.
            report, _ = scan(root, globs)
            if not report.is_clean():
                print(
                    "warning: some duplicates remain after --fix; manual review needed.",
                    file=sys.stderr,
                )

    if args.json:
        payload = report.to_dict()
        payload["root"] = str(root)
        print(json.dumps(payload, indent=2))
    else:
        print(format_report(report, root))

    if args.check and not report.is_clean():
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
