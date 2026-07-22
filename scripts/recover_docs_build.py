#!/usr/bin/env python3
"""
Recover docs build — detect and optionally repair failure modes in the
build & deploy docs tree.

This is the failure-recovery companion to `scripts/dedupe_docs.py` (issue
#928 → PR #1009) and `scripts/collect_docs_metrics.py` (issue #929 → PR
#1013). Together the three utilities cover:

- #928 dedupe gate (fail build on duplicate anchors/headings/ref-links)
- #929 observability metrics (instrument the build, drift detection)
- #930 failure recovery (this file) — detect documented failure modes and
  offer automated recovery actions, with a dry-run plan mode

Documented failure modes (see `docs/failure-recovery.md` for descriptions):

| Tag                        | Detected by                          | Auto-repairable |
| -------------------------- | ------------------------------------ | --------------- |
| bom_detected               | File starts with UTF-8/16 BOM        | Yes (strip)     |
| crlf_line_endings          | File contains \\r\\n                  | Yes (LF)        |
| trailing_whitespace        | Any line ends with spaces/tabs       | Yes (strip)     |
| missing_final_newline      | File content does not end with '\\n' | Yes (append)    |
| duplicate_heading_anchor   | Two headings share the same slug     | Yes (rename)    |
| empty_file                 | Zero-byte markdown file              | No (manual)     |
| baseline_sha_mismatch      | --baseline sha differs from current  | No (git-level)  |
| circular_link              | ./a.md -> ./b.md -> ./a.md            | No (manual)     |
| unicode_replacement_chars  | 'U+FFFD' present in content          | No (manual)     |

Exit codes (CI-friendly):
- 0 — no failures detected (or `--apply` repaired everything cleanly)
- 1 — failures detected in `--check` mode (CI gate)
- 2 — I/O error or invalid arguments

Usage:
    python scripts/recover_docs_build.py                          # scan + print plan
    python scripts/recover_docs_build.py --check                 # CI gate (exit 1)
    python scripts/recover_docs_build.py --apply                 # execute auto-repairs
    python scripts/recover_docs_build.py --apply --check         # repair + verify clean
    python scripts/recover_docs_build.py --baseline <json>      # also detect sha drift
    python scripts/recover_docs_build.py --json                 # machine-readable plan

The implementation intentionally avoids third-party dependencies so it can
run in any Python 3.11+ CI runner without an extra `pip install`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT_DEFAULT = Path(__file__).resolve().parent.parent
DOCS_DEFAULT_GLOBS = ("docs/**/*.md", "README.md", "*.md")

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$", re.MULTILINE)
INLINE_LINK_RE = re.compile(r"(?<!\!)\[([^\]]+)\]\(([^)]+)\)")
BOMS = (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff")

# Failure-mode tags — exposed via the JSON `--json` mode for dashboards.
FAILURE_BOM = "bom_detected"
FAILURE_CRLF = "crlf_line_endings"
FAILURE_TRAILING_WS = "trailing_whitespace"
FAILURE_MISSING_NEWLINE = "missing_final_newline"
FAILURE_DUPLICATE_ANCHOR = "duplicate_heading_anchor"
FAILURE_EMPTY_FILE = "empty_file"
FAILURE_BASELINE_DRIFT = "baseline_sha_mismatch"
FAILURE_CIRCULAR_LINK = "circular_link"
FAILURE_UNICODE_REPLACEMENT = "unicode_replacement_chars"


@dataclass
class Failure:
    """One detected failure instance in one file."""

    mode: str
    file: str
    line: int = 0
    detail: str = ""
    auto_repairable: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RecoveryPlan:
    """Aggregated plan across all scanned files."""

    failures: list[Failure] = field(default_factory=list)
    applied_repairs: list[dict[str, Any]] = field(default_factory=list)
    baseline_sha256: str | None = None
    current_sha256: str | None = None

    @property
    def total_failures(self) -> int:
        return len(self.failures)

    @property
    def unrepairable_failures(self) -> list[Failure]:
        return [f for f in self.failures if not f.auto_repairable]

    @property
    def repairable_failures(self) -> list[Failure]:
        return [f for f in self.failures if f.auto_repairable]

    def is_clean(self) -> bool:
        return self.total_failures == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "failures": [f.to_dict() for f in self.failures],
            "applied_repairs": self.applied_repairs,
            "baseline_sha256": self.baseline_sha256,
            "current_sha256": self.current_sha256,
            "total_failures": self.total_failures,
            "total_repairable": len(self.repairable_failures),
            "total_unrepairable": len(self.unrepairable_failures),
        }


def slugify(text: str) -> str:
    """GitHub-style slug: lowercase, strip punctuation, hyphen-join."""
    slug = re.sub(r"[^\w\s.\-]", "", text.lower())
    slug = re.sub(r"\.", "-", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "section"


def collect_docs(root: Path, globs: Iterable[str]) -> list[Path]:
    """Return sorted list of markdown files matching the globs."""
    found: set[Path] = set()
    for pattern in globs:
        for path in root.glob(pattern):
            if path.is_file():
                found.add(path.resolve())
    return sorted(found)


def extract_headings(content: str, file: str) -> list[tuple[int, int, str]]:
    """Return [(line, level, text), ...] for ATX headings."""
    hits: list[tuple[int, int, str]] = []
    for m in HEADING_RE.finditer(content):
        level = len(m.group(1))
        text = m.group(2).strip()
        anchor_pos = m.start(2)
        line = content.count("\n", 0, anchor_pos) + 1
        hits.append((line, level, text))
    return hits


def detect_failures(
    root: Path, files: list[Path], baseline_sha: str | None
) -> tuple[RecoveryPlan, dict[Path, str]]:
    """Inspect every file and populate a RecoveryPlan.

    Returns the plan plus a map of `{path: normalised content}` so callers
    can apply repairs without re-reading from disk.
    """
    plan = RecoveryPlan(baseline_sha256=baseline_sha)
    contents: dict[Path, str] = {}

    byte_buffer = bytearray()

    for path in files:
        raw = path.read_bytes()
        byte_buffer.extend(raw)
        rel = str(path.relative_to(root))
        has_bom = any(raw.startswith(bom) for bom in BOMS)

        # Decode — tolerate UTF-8/16 + replacement chars for safe processing.
        text = raw.decode("utf-8", errors="replace")
        if has_bom:
            plan.failures.append(
                Failure(
                    mode=FAILURE_BOM,
                    file=rel,
                    auto_repairable=True,
                    detail="Byte-order mark detected; strip and re-encode as UTF-8.",
                )
            )
        # Strip BOM for content-level inspections so we see what the deploy would see.
        if text.startswith("\ufeff"):
            text = text[1:]
        contents[path] = text

        if len(raw) == 0:
            plan.failures.append(
                Failure(
                    mode=FAILURE_EMPTY_FILE,
                    file=rel,
                    auto_repairable=False,
                    detail="Zero-byte markdown file is almost always a mistake; remove or fill it.",
                )
            )

        if "\r\n" in text:
            plan.failures.append(
                Failure(
                    mode=FAILURE_CRLF,
                    file=rel,
                    line=1,
                    auto_repairable=True,
                    detail="File uses CRLF line endings; normalise to LF for stable diffs.",
                )
            )

        # Trailing whitespace — count lines containing ' \t' at the end.
        for idx, line in enumerate(text.split("\n"), start=1):
            if line.rstrip(" \t") != line:
                plan.failures.append(
                    Failure(
                        mode=FAILURE_TRAILING_WS,
                        file=rel,
                        line=idx,
                        auto_repairable=True,
                        detail="Line has trailing spaces/tabs; strip to reduce diff noise.",
                    )
                )

        if text and not text.endswith("\n"):
            plan.failures.append(
                Failure(
                    mode=FAILURE_MISSING_NEWLINE,
                    file=rel,
                    line=text.count("\n") + 1,
                    auto_repairable=True,
                    detail="File is missing the final newline; append one for POSIX compliance.",
                )
            )

        if "\ufffd" in text:
            # UTF-8 replacement char — indicates a decode failure mid-content.
            count = text.count("\ufffd")
            plan.failures.append(
                Failure(
                    mode=FAILURE_UNICODE_REPLACEMENT,
                    file=rel,
                    auto_repairable=False,
                    detail=f"{count} U+FFFD replacement char(s); decode failed — inspect bytes.",
                )
            )

        headings = extract_headings(text, rel)
        # Within-file duplicate anchors (same level + slug).
        seen: dict[tuple[int, str], int] = {}
        for line, level, heading_text in headings:
            key = (level, slugify(heading_text))
            if key in seen:
                plan.failures.append(
                    Failure(
                        mode=FAILURE_DUPLICATE_ANCHOR,
                        file=rel,
                        line=line,
                        auto_repairable=True,
                        detail=(
                            f"Duplicate H{level} heading '{heading_text}' "
                            f"(slug '{key[1]}', first at line {seen[key]}); "
                            "rename with `(<file> <idx>)` suffix."
                        ),
                    )
                )
            else:
                seen[key] = line

    # Cross-file duplicate anchors — same slug on the same level across files.
    by_anchor: dict[tuple[int, str], list[tuple[str, int, str]]] = {}
    for path in files:
        rel = str(path.relative_to(root))
        for line, level, heading_text in extract_headings(contents[path], rel):
            by_anchor.setdefault((level, slugify(heading_text)), []).append(
                (rel, line, heading_text)
            )
    for (level, slug), hits in by_anchor.items():
        files_with = {h[0] for h in hits}
        if len(files_with) > 1:
            # Only report once per (level, slug), with the first occurrence as
            # the canonical one and the rest as the duplicates.
            canonical, *dupes = hits
            for dupe_rel, dupe_line, heading_text in dupes:
                plan.failures.append(
                    Failure(
                        mode=FAILURE_DUPLICATE_ANCHOR,
                        file=dupe_rel,
                        line=dupe_line,
                        auto_repairable=True,
                        detail=(
                            f"Cross-file duplicate H{level} anchor '{slug}' "
                            f"(canonical: {canonical[0]}:{canonical[1]}); "
                            "update the heading text or add a `(file basename)` suffix."
                        ),
                    )
                )

    # Circular links within docs (only local-link graph is walked).
    plan.failures.extend(_detect_circular_links(root, files, contents))

    # Compute the current sha and compare against baseline if provided.
    current_sha = hashlib.sha256(bytes(byte_buffer)).hexdigest()
    plan.current_sha256 = current_sha
    if baseline_sha and baseline_sha != current_sha:
        plan.failures.append(
            Failure(
                mode=FAILURE_BASELINE_DRIFT,
                file="(tree)",
                auto_repairable=False,
                detail=(
                    f"Tree sha256 mismatch — baseline={baseline_sha[:12]}…, "
                    f"current={current_sha[:12]}…. Inspect via `git log -p -- docs/` for content drift."
                ),
            )
        )

    return plan, contents


def _detect_circular_links(
    root: Path, files: list[Path], contents: dict[Path, str]
) -> Iterable[Failure]:
    """Walk the local-link graph and yield circular-link failure reports.

    A "local link" is one whose target is a relative path (not http(s)://,
    not an #anchor, not an `mailto:`). We resolve links against the source
    file's directory. Depth-first traversal with an explicit stack; we cap
    the chain length at 8 hops to avoid pathological blowups.
    """
    by_path: dict[Path, list[Path]] = {}
    for path in files:
        text = contents[path]
        local_links: list[Path] = []
        for m in INLINE_LINK_RE.finditer(text):
            url = m.group(2).strip()
            if url.startswith(("http://", "https://", "mailto:", "#")):
                continue
            if url.startswith("/"):
                continue  # absolute — out of scope
            target = (path.parent / url).resolve()
            if target in files:
                local_links.append(target)
        by_path[path] = local_links

    max_depth = 8
    for start in files:
        stack: list[tuple[Path, list[Path]]] = [(start, [start])]
        while stack:
            node, chain = stack.pop()
            for nxt in by_path.get(node, []):
                # Direct self-loop A -> A.
                if nxt == node:
                    rel = node.relative_to(root)
                    yield Failure(
                        mode=FAILURE_CIRCULAR_LINK,
                        file=str(rel),
                        auto_repairable=False,
                        detail=f"Circular local-link chain (self): {rel} -> {rel}",
                    )
                    continue
                # Cycle back to the chain's start node. Only report when the
                # chain has length >= 2 to avoid double-reporting with the
                # self-loop case (which is already yielded above).
                if nxt == chain[0] and len(chain) > 1:
                    rel_chain = " -> ".join(
                        str(p.relative_to(root)) for p in chain + [nxt]
                    )
                    yield Failure(
                        mode=FAILURE_CIRCULAR_LINK,
                        file=str(chain[0].relative_to(root)),
                        auto_repairable=False,
                        detail=f"Circular local-link chain: {rel_chain}",
                    )
                    continue
                if nxt in chain:
                    continue  # already visited on this branch
                if len(chain) >= max_depth:
                    continue
                stack.append((nxt, chain + [nxt]))


def apply_repairs(
    root: Path, plan: RecoveryPlan, contents: dict[Path, str]
) -> list[dict[str, Any]]:
    """Apply every auto-repairable failure to the file system.

    Returns an audit log of `{file, mode, action}` records.

    Idempotent — running twice leaves the tree unchanged.
    """
    log: list[dict[str, Any]] = []

    # Group failures by (file, mode) so we can apply each repair once per file.
    by_file_mode: dict[tuple[str, str], list[Failure]] = {}
    for f in plan.repairable_failures:
        by_file_mode.setdefault((f.file, f.mode), []).append(f)

    # BOM strip — also serves to fix CRLF in one pass (we re-encode as UTF-8 LF).
    for (file_rel, mode), _ in by_file_mode.items():
        if mode != FAILURE_BOM:
            continue
        path = root / file_rel
        new_text = contents[path].lstrip("\ufeff").lstrip("\ufffe")
        path.write_text(new_text, encoding="utf-8", newline="\n")
        contents[path] = new_text
        log.append(
            {
                "file": file_rel,
                "mode": mode,
                "action": "stripped BOM, re-encoded as UTF-8 LF",
            }
        )

    # CRLF normalisation (covers files that had CRLF without BOM).
    for (file_rel, mode), _ in by_file_mode.items():
        if mode != FAILURE_CRLF:
            continue
        path = root / file_rel
        text = contents[path]
        new_text = text.replace("\r\n", "\n").replace("\r", "\n")
        if new_text != text:
            path.write_text(new_text, encoding="utf-8", newline="\n")
            contents[path] = new_text
            log.append(
                {"file": file_rel, "mode": mode, "action": "normalised CRLF to LF"}
            )

    # Trailing whitespace strip.
    by_file_trailing: dict[str, set[int]] = {}
    for (file_rel, mode), fails in by_file_mode.items():
        if mode != FAILURE_TRAILING_WS:
            continue
        by_file_trailing.setdefault(file_rel, set()).update(f.line for f in fails)
    for file_rel, lines in by_file_trailing.items():
        path = root / file_rel
        text = contents[path]
        ls = text.split("\n")
        for idx in lines:
            if 1 <= idx <= len(ls):
                ls[idx - 1] = ls[idx - 1].rstrip(" \t")
        new_text = "\n".join(ls)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8", newline="\n")
            contents[path] = new_text
            log.append(
                {
                    "file": file_rel,
                    "mode": FAILURE_TRAILING_WS,
                    "action": f"stripped trailing whitespace on {len(lines)} line(s)",
                }
            )

    # Append final newline.
    for (file_rel, mode), _ in by_file_mode.items():
        if mode != FAILURE_MISSING_NEWLINE:
            continue
        path = root / file_rel
        text = contents[path]
        if text and not text.endswith("\n"):
            new_text = text + "\n"
            path.write_text(new_text, encoding="utf-8", newline="\n")
            contents[path] = new_text
            log.append(
                {"file": file_rel, "mode": mode, "action": "appended final newline"}
            )

    # Rename duplicate within-file headings with `(<file-stem> <idx>)` suffix.
    by_file_anchor: dict[str, list[tuple[int, str]]] = {}
    for (file_rel, mode), fails in by_file_mode.items():
        if mode != FAILURE_DUPLICATE_ANCHOR:
            continue
        # Each failure has its line + the original heading text captured.
        for f in fails:
            # Strip the heading-text out of the detail for safe parsing.
            # Failure.detail follows the format:
            # "Duplicate H<n> heading '<text>' (slug '<slug>', first at line <n>); ..."
            # or
            # "Cross-file duplicate H<n> anchor '<slug>' ..."
            # Both carry the affected line on the Failure itself.
            # Parse the original heading text by inspecting the file at the line.
            by_file_anchor.setdefault(file_rel, []).append((f.line, ""))

    for file_rel, line_list in by_file_anchor.items():
        path = root / file_rel
        text = contents[path]
        lines = text.split("\n")
        stem = Path(file_rel).stem
        for idx, (line_no, _) in enumerate(line_list, start=1):
            target_idx = line_no - 1
            if 0 <= target_idx < len(lines):
                m = re.match(r"^(#{1,6}\s+)(.+?)(\s*#*\s*)$", lines[target_idx])
                if m:
                    old_text = m.group(2).strip()
                    new_text = f"{old_text} ({stem} {idx})"
                    lines[target_idx] = f"{m.group(1)}{new_text}{m.group(3)}"
                    log.append(
                        {
                            "file": file_rel,
                            "mode": FAILURE_DUPLICATE_ANCHOR,
                            "action": f"renamed heading at line {line_no}: '{old_text}' -> '{new_text}'",
                        }
                    )
        new_text = "\n".join(lines)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8", newline="\n")
            contents[path] = new_text

    return log


def format_plan(plan: RecoveryPlan, root: Path) -> str:
    """Render a human-readable plan summary."""
    if plan.is_clean():
        return "Docs build is healthy. No failures detected."

    lines: list[str] = []
    lines.append(f"Detected {plan.total_failures} failure(s):")
    lines.append(f"  - {len(plan.repairable_failures)} auto-repairable")
    lines.append(f"  - {len(plan.unrepairable_failures)} manual (no auto-repair)")
    lines.append("")

    mode_groups: dict[str, list[Failure]] = {}
    for f in plan.failures:
        mode_groups.setdefault(f.mode, []).append(f)

    for mode in sorted(mode_groups):
        fails = mode_groups[mode]
        tag = "AUTO" if any(f.auto_repairable for f in fails) else "MANUAL"
        lines.append(f"[{tag}] {mode} — {len(fails)} occurrence(s):")
        for f in fails:
            loc = f.file if not f.line else f"{f.file}:{f.line}"
            lines.append(f"  - {loc}")
            if f.detail:
                lines.append(f"      {f.detail}")
        lines.append("")

    if plan.baseline_sha256 and plan.current_sha256:
        if plan.baseline_sha256 != plan.current_sha256:
            lines.append(
                "Baseline sha256 mismatch detected — see FAILURE_BASELINE_DRIFT above."
            )
        else:
            lines.append("Baseline sha256 matches current tree (no drift).")
        lines.append("")

    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Detect and repair docs build failure modes."
    )
    parser.add_argument(
        "--root", type=Path, default=REPO_ROOT_DEFAULT, help="Repo root"
    )
    parser.add_argument(
        "--glob",
        action="append",
        default=None,
        dest="globs",
        help="Glob pattern to scan (repeatable). Defaults to 'docs/**/*.md README.md *.md'.",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=None,
        help="Path to a JSON metrics snapshot (issue #929 --write-baseline output) "
        "for sha256 drift detection.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if failures are detected (CI gate).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply auto-repairs in-place. Idempotent.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON plan instead of human-readable text.",
    )

    args = parser.parse_args(argv)
    globs = tuple(args.globs) if args.globs else DOCS_DEFAULT_GLOBS
    root = args.root.resolve()

    if not root.is_dir():
        print(f"error: root is not a directory: {root}", file=sys.stderr)
        return 2

    baseline_sha: str | None = None
    if args.baseline:
        if not args.baseline.is_file():
            print(f"error: baseline not found: {args.baseline}", file=sys.stderr)
            return 2
        baseline_payload = json.loads(args.baseline.read_text(encoding="utf-8"))
        baseline_sha = baseline_payload.get("docs_sha256_total")
        if not baseline_sha:
            print(
                "error: baseline JSON does not contain 'docs_sha256_total'",
                file=sys.stderr,
            )
            return 2

    try:
        files = collect_docs(root, globs)
        plan, contents = detect_failures(root, files, baseline_sha)
    except OSError as exc:
        print(f"error: failed to inspect docs: {exc}", file=sys.stderr)
        return 2

    if args.apply:
        plan.applied_repairs = apply_repairs(root, plan, contents)
        if plan.applied_repairs:
            print(f"Applied {len(plan.applied_repairs)} repair(s):")
            for r in plan.applied_repairs:
                print(f"  - {r['file']} [{r['mode']}]: {r['action']}")
            # Re-inspect to verify repairs landed.
            files = collect_docs(root, globs)
            plan, _ = detect_failures(root, files, baseline_sha)
            if not plan.is_clean() and args.check:
                unrep = plan.unrepairable_failures
                if unrep:
                    print(
                        f"warning: {len(unrep)} unrepairable failure(s) remain — manual review required.",
                        file=sys.stderr,
                    )

    if args.json:
        print(json.dumps(plan.to_dict(), indent=2))
    else:
        print(format_plan(plan, root))

    if args.check and not plan.is_clean():
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
