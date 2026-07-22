#!/usr/bin/env python3
"""
Collect build & deploy docs observability metrics.

This utility is the observability companion to `scripts/dedupe_docs.py`. Where
the dedupe utility is a CI gate (fail the build if duplicates are detected),
the metrics utility exposes observable signals about the docs build & deploy
pipeline so maintainers can answer questions like:

- How big is the docs set today?
- Are docs growing faster than usual?
- Are there dead docs (zero headings, zero links, only-BOM)?
- Is the docs-regression pipeline drifting against a baseline?
- How many headings/links/images does the tree contain (for capacity planning)?

The utility emits metrics in two formats:

- **JSON** — structured object, suitable for dashboards and CI artifacts.
- **Prometheus** — text format compatible with `pushgateway` / `node_exporter`
  textfile collector, so a deploy runner can scrape the metrics into Grafana.

Optional baseline support:

    python scripts/collect_docs_metrics.py --write-baseline .docs.metrics.json
    # some time later
    python scripts/collect_docs_metrics.py --baseline .docs.metrics.json --check

In `--check` mode the utility exits 1 if any metric drifts outside the
configured thresholds. Thresholds default to ±20% but can be overridden
per-metric in the baseline JSON via a `thresholds` block (see
`docs/observability-metrics.md` for examples).

Exit codes:
- 0 = ok (no drift, or drift within thresholds)
- 1 = drift outside thresholds when `--check` is set
- 2 = I/O error or invalid arguments
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT_DEFAULT = Path(__file__).resolve().parent.parent
DOCS_DEFAULT_GLOBS = ("docs/**/*.md", "README.md", "*.md")

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$", re.MULTILINE)
INLINE_LINK_RE = re.compile(r"(?<!\!)\[([^\]]+)\]\(([^)]+)\)")
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
CODE_BLOCK_RE = re.compile(r"^```.*?^```", re.MULTILINE | re.DOTALL)
BOMS = (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff")

# Default drift threshold (multiplicative). e.g. 0.20 = ±20%.
DEFAULT_DRIFT = 0.20


@dataclass
class DocsMetrics:
    """Aggregated metrics for the docs tree."""

    build_started_at_unix: float = field(default_factory=time.time)
    build_duration_seconds: float = 0.0
    docs_total_files: int = 0
    docs_total_bytes: int = 0
    docs_total_words: int = 0
    docs_total_lines: int = 0
    docs_largest_file_bytes: int = 0
    docs_smallest_file_bytes: int = 0
    docs_avg_file_bytes: float = 0.0
    docs_files_by_extension: dict[str, int] = field(default_factory=dict)
    docs_bom_files: int = 0
    docs_empty_files: int = 0
    heading_count_total: int = 0
    heading_count_by_level: dict[int, int] = field(default_factory=dict)
    link_count_total: int = 0
    link_count_external: int = 0
    link_count_internal: int = 0
    link_count_image: int = 0
    code_block_count: int = 0
    docs_sha256_total: str = ""
    metric_collection_ok: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_prometheus(self, prefix: str = "localmind_docs") -> str:
        """Render as Prometheus text format.

        Numeric scalars use the `metric_name value` form; dict-valued counters
        are flattened with label keys per entry (one line per label combo).
        Non-numeric / non-emitted fields (sha256, timestamp, ok flag, duration)
        are emitted as info-style metrics where it makes sense.
        """
        lines: list[str] = []

        def emit(
            name: str,
            value: float,
            help_text: str = "",
            labels: dict[str, str] | None = None,
        ) -> None:
            if help_text:
                lines.append(f"# HELP {prefix}_{name} {help_text}")
            label_str = ""
            if labels:
                kvs = ",".join(f'{k}="{v}"' for k, v in labels.items())
                label_str = "{" + kvs + "}"
            lines.append(f"{prefix}_{name}{label_str} {value}")

        emit(
            "build_started_at_unix",
            self.build_started_at_unix,
            "Unix epoch when the build scan started",
        )
        emit(
            "build_duration_seconds",
            self.build_duration_seconds,
            "Wall-clock duration of the docs scan",
        )
        emit("total_files", self.docs_total_files, "Total markdown files scanned")
        emit("total_bytes", self.docs_total_bytes, "Sum of file sizes in bytes")
        emit(
            "total_words",
            self.docs_total_words,
            "Whitespace-separated word count across all docs",
        )
        emit("total_lines", self.docs_total_lines, "Total line count across all docs")
        emit(
            "largest_file_bytes",
            self.docs_largest_file_bytes,
            "Largest file size in bytes",
        )
        emit(
            "smallest_file_bytes",
            self.docs_smallest_file_bytes,
            "Smallest file size in bytes",
        )
        emit("avg_file_bytes", self.docs_avg_file_bytes, "Average file size in bytes")
        emit("bom_files", self.docs_bom_files, "Files carrying a byte-order mark")
        emit("empty_files", self.docs_empty_files, "Files with zero bytes")
        emit(
            "heading_count_total",
            self.heading_count_total,
            "Total ATX headings across all docs",
        )
        emit("link_count_total", self.link_count_total, "Total inline + image links")
        emit("link_count_external", self.link_count_external, "Links to http(s) URLs")
        emit(
            "link_count_internal",
            self.link_count_internal,
            "Links to local paths / #anchors",
        )
        emit(
            "link_count_image",
            self.link_count_image,
            "Image links (not counting inline text links)",
        )
        emit("code_block_count", self.code_block_count, "Fenced ``` code blocks")

        # Dict-flattened counters: emit one line per label.
        for ext, count in sorted(self.docs_files_by_extension.items()):
            emit(
                "files_by_extension",
                count,
                "Files by extension",
                labels={"extension": ext},
            )
        for level in sorted(self.heading_count_by_level):
            count = self.heading_count_by_level[level]
            emit(
                "headings_by_level",
                count,
                "Headings by ATX level",
                labels={"level": f"h{level}"},
            )

        # Info-style scalar kept as a label-less SHA256 gauge so it can be
        # compared with a baseline (Grafana `changes()` alerting).
        # Prometheus gauge with a string requires encoding it as a label.
        # A common idiom: emit a zero-valued gauge with the sha as a label.
        if self.docs_sha256_total:
            emit(
                "build_info",
                1,
                "Docs build info (sha256 of all bytes, surfaces dedupe drift via changes())",
                labels={"sha256": self.docs_sha256_total[:12]},
            )

        lines.append("")  # final newline
        return "\n".join(lines)


def collect_docs(root: Path, globs: Iterable[str]) -> tuple[DocsMetrics, list[Path]]:
    """Collect metrics from every markdown file matching `globs` under `root`.

    Returns the metrics plus the sorted file list (so callers can iterate or
    surface error messages per file).
    """
    started = time.time()
    metrics = DocsMetrics()
    files: set[Path] = set()
    for pattern in globs:
        for path in root.glob(pattern):
            if path.is_file():
                files.add(path.resolve())
    files_sorted = sorted(files)

    if not files_sorted:
        metrics.build_duration_seconds = time.time() - started
        return metrics, []

    sizes: list[int] = []
    byte_buffer = bytearray()
    per_file_hashes: list[str] = []

    for path in files_sorted:
        raw = path.read_bytes()
        sizes.append(len(raw))
        byte_buffer.extend(raw)
        per_file_hashes.append(hashlib.sha256(raw).hexdigest())

        ext = path.suffix.lower() or "(none)"
        metrics.docs_files_by_extension[ext] = (
            metrics.docs_files_by_extension.get(ext, 0) + 1
        )

        if any(raw.startswith(bom) for bom in BOMS):
            metrics.docs_bom_files += 1
        if len(raw) == 0:
            metrics.docs_empty_files += 1

        text = raw.decode("utf-8", errors="replace")
        # Strip BOM for accurate word/line counting (matches what deploy would see).
        if text.startswith("\ufeff"):
            text = text[1:]

        metrics.docs_total_words += len(text.split())
        metrics.docs_total_lines += text.count("\n") + (0 if text.endswith("\n") else 1)

        for m in HEADING_RE.finditer(text):
            level = len(m.group(1))
            metrics.heading_count_total += 1
            metrics.heading_count_by_level[level] = (
                metrics.heading_count_by_level.get(level, 0) + 1
            )

        for m in INLINE_LINK_RE.finditer(text):
            url = m.group(2).strip()
            metrics.link_count_total += 1
            if url.startswith(("http://", "https://")):
                metrics.link_count_external += 1
            else:
                metrics.link_count_internal += 1

        for m in IMAGE_RE.finditer(text):
            metrics.link_count_image += 1

        metrics.code_block_count += len(CODE_BLOCK_RE.findall(text))

    metrics.docs_total_files = len(files_sorted)
    metrics.docs_total_bytes = sum(sizes)
    metrics.docs_smallest_file_bytes = min(sizes)
    metrics.docs_largest_file_bytes = max(sizes)
    metrics.docs_avg_file_bytes = (
        metrics.docs_total_bytes / metrics.docs_total_files
        if metrics.docs_total_files
        else 0.0
    )
    metrics.docs_sha256_total = hashlib.sha256(bytes(byte_buffer)).hexdigest()
    metrics.build_duration_seconds = time.time() - started
    return metrics, files_sorted


def drift_report(
    current: DocsMetrics, baseline: dict[str, Any], ignored: set[str], threshold: float
) -> dict[str, dict[str, Any]]:
    """Compare `current` against `baseline` metrics. Returns a dict of
    "metric_name": {current, baseline, delta, delta_pct, in_threshold} for
    every numeric scalar that drifted.

    `ignored` is the set of metric keys never compared (e.g. timestamps).
    Per-metric thresholds in `baseline["thresholds"]` override the global
    `threshold` value.
    """
    out: dict[str, dict[str, Any]] = {}
    cur = current.to_dict()
    per_metric_thresholds = baseline.get("thresholds", {}) or {}
    for key, new_val in cur.items():
        if not isinstance(new_val, (int, float)) or isinstance(new_val, bool):
            continue
        if key in ignored:
            continue
        if key not in baseline:
            continue
        old_val = baseline[key]
        if not isinstance(old_val, (int, float)) or isinstance(old_val, bool):
            continue
        if new_val == old_val:
            continue
        delta = new_val - old_val
        delta_pct = (delta / old_val) if old_val else 0.0
        max_pct = per_metric_thresholds.get(key, threshold)
        in_threshold = abs(delta_pct) <= max_pct
        out[key] = {
            "current": new_val,
            "baseline": old_val,
            "delta": delta,
            "delta_pct": delta_pct,
            "max_pct": max_pct,
            "in_threshold": in_threshold,
        }
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Collect observability metrics for the build & deploy docs."
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
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    parser.add_argument(
        "--prometheus", action="store_true", help="Emit Prometheus text format"
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=None,
        help="Path to a JSON file containing a previous metrics snapshot. "
        "Sets --check into drift-detection mode if combined with --check.",
    )
    parser.add_argument(
        "--write-baseline",
        type=Path,
        default=None,
        help="Write the current metrics snapshot to this path as JSON.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="In --baseline mode: exit 1 if any metric drifts outside thresholds.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_DRIFT,
        help="Maximum acceptable fraction of drift (default: 0.20 = +/-20%%).",
    )

    args = parser.parse_args(argv)
    globs = tuple(args.globs) if args.globs else DOCS_DEFAULT_GLOBS
    root = args.root.resolve()

    if not root.is_dir():
        print(f"error: root is not a directory: {root}", file=sys.stderr)
        return 2

    if not (args.json or args.prometheus or args.write_baseline or args.baseline):
        # Default to JSON output if nothing else requested.
        args.json = True

    try:
        metrics, _ = collect_docs(root, globs)
    except OSError as exc:
        print(f"error: failed to collect metrics: {exc}", file=sys.stderr)
        return 2

    if args.write_baseline:
        args.write_baseline.parent.mkdir(parents=True, exist_ok=True)
        args.write_baseline.write_text(
            json.dumps(metrics.to_dict(), indent=2) + "\n", encoding="utf-8"
        )

    drift_to_check: dict[str, dict[str, Any]] = {}
    if args.baseline:
        if not args.baseline.is_file():
            print(f"error: baseline not found: {args.baseline}", file=sys.stderr)
            return 2
        baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
        ignored = {
            "build_started_at_unix",
            "build_duration_seconds",
            "metric_collection_ok",
            "docs_sha256_total",
        }
        drift_to_check = drift_report(metrics, baseline, ignored, args.threshold)
        if args.check:
            out_of_bounds = {
                k: v for k, v in drift_to_check.items() if not v["in_threshold"]
            }
            if out_of_bounds:
                print("error: drift outside thresholds detected:", file=sys.stderr)
                for k, v in sorted(out_of_bounds.items()):
                    print(
                        f"  {k}: baseline={v['baseline']} current={v['current']} "
                        f"(delta={v['delta']:+.2f}, {v['delta_pct']:+.1%} vs ±{v['max_pct']:.0%})",
                        file=sys.stderr,
                    )
                return 1

    if args.prometheus:
        print(metrics.to_prometheus())

    if args.json:
        payload = metrics.to_dict()
        if args.baseline and drift_to_check:
            payload["drift"] = drift_to_check
        print(json.dumps(payload, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
