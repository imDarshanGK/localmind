# Docs Build & Deploy Observability Metrics

> Companion to `.github/workflows/docs-regression.yml`. Runs on every push
> and pull request that touches `docs/**`, `*.md`, the metrics util itself,
> or its tests. Collects observable signals about the docs build and
> uploads them as a workflow artifact for downstream dashboards.

## Why metrics?

LocalMind's docs deploy straight from `docs/**` and the repo-root markdown.
The build pipeline is the `docs-regression.yml` GitHub workflow. When docs
silently grow (a maintainer adds 50 KB of new sections), develop a BOM noise
problem from a Windows-side editor, or start accumulating dead empty files,
no one notices until a contributor reports broken rendering. Observability
metrics turn those silent drift signals into queryable Prometheus gauges and
JSON snapshots so a maintainer can answer:

- How much content does the docs tree carry right now?
- Is the tree growing within healthy bounds?
- Are there observable defects (BOMs, empty files, zero-heading files)?
- Has anything drifted since the last deploy baseline?

## The script

`scripts/collect_docs_metrics.py` (zero dependencies — Python stdlib only).

### Modes

```bash
# Default: emit a JSON report to stdout.
python scripts/collect_docs_metrics.py

# Prometheus text-format (for node_exporter textfile collector / pushgateway)
python scripts/collect_docs_metrics.py --prometheus > docs-metrics.prom

# Both
python scripts/collect_docs_metrics.py --json --prometheus

# Custom repo root (CI: $(pwd) in the workflow)
python scripts/collect_docs_metrics.py --root /path/to/repo

# Custom glob patterns (defaults to 'docs/**/*.md README.md *.md')
python scripts/collect_docs_metrics.py --glob "docs/**/*.md" --glob "CHANGELOG.md"
```

### Drift detection with baselines

```bash
# Capture the current metrics as a baseline and write to disk.
python scripts/collect_docs_metrics.py --write-baseline .docs.metrics.baseline.json

# ... some time later, after another deploy ...
python scripts/collect_docs_metrics.py \
  --baseline .docs.metrics.baseline.json \
  --check                                   # exit 1 if any metric drifts
```

Drift is computed as `delta_pct = (current - baseline) / baseline`. The
default acceptance band is ±20%. To relax the threshold for a specific
metric, add a `thresholds` block to the baseline JSON:

```json
{
  "docs_total_files": 12,
  "docs_total_bytes": 45902,
  "_comment": "Allow docs_total_bytes to swing up to ±100% — large docs additions are expected.",
  "thresholds": {
    "docs_total_bytes": 1.00,
    "docs_total_words": 0.50
  }
}
```

The metrics that should not be compared (`build_started_at_unix`,
`build_duration_seconds`, `metric_collection_ok`, `docs_sha256_total`) are
automatically excluded from drift — they capture run-to-run noise or
are themselves the canonical "has the tree changed?" signal.

## Exported metrics

All emitted as Prometheus gauges, prefixed `localmind_docs_`:

| Metric | What it counts |
| --- | --- |
| `build_started_at_unix` | Unix epoch when the scan started (correlation id) |
| `build_duration_seconds` | Wall-clock duration of the scan |
| `total_files` | Markdown files scanned |
| `total_bytes` | Sum of file sizes in bytes |
| `total_words` | Whitespace-separated word count |
| `total_lines` | Total line count |
| `largest_file_bytes` | Largest file size in bytes |
| `smallest_file_bytes` | Smallest file size in bytes |
| `avg_file_bytes` | Average file size in bytes |
| `bom_files` | Files carrying a UTF-8/UTF-16 byte-order mark |
| `empty_files` | Files with zero bytes |
| `heading_count_total` | Total ATX headings across all docs |
| `headings_by_level{level="hN"}` | Per-level H1..H6 heading counts |
| `link_count_total` | Inline (non-image) link count |
| `link_count_external` | Links to `http(s)://…` URLs |
| `link_count_internal` | Links to local paths / `#anchor`s |
| `link_count_image` | `![alt](image)` occurrences |
| `code_block_count` | Fenced ``` code blocks |
| `files_by_extension{extension=".md"}` | Files per extension |
| `build_info{sha256="…"}` | Zero-valued info gauge; the sha256 label changes when the byte concatenation of the docs changes — surfaces dedupe drift via `changes()` in Prometheus |

## CI integration

`.github/workflows/docs-regression.yml` adds three new steps after the
existing markdown-lint and link-check:

1. `python scripts/collect_docs_metrics.py --prometheus --json > artifacts/docs_metrics.json` — collect instruments.
2. `actions/upload-artifact@v4` — upload `docs-metrics-<sha>.json` with 30-day retention for baselines and dashboards.
3. `python -m pytest tests/test_collect_docs_metrics.py -q` — keep the metrics util itself under regression.

No additional secrets are required. The metrics util runs purely against
the file system.

## Alerting & runbook

Recommended alerts (configure in your Grafana / Alertmanager):

| Alert | Expression | Severity |
| --- | --- | --- |
| Docs shrunk unexpectedly | `abs((localmind_docs_total_bytes - localmind_docs_total_bytes offset 1d) / localmind_docs_total_bytes offset 1d) > 0.20` for 10m | warning |
| BOM drift entered the tree | `increase(localmind_docs_bom_files[1h]) > 0` | warning |
| Empty files added | `increase(localmind_docs_empty_files[1h]) > 0` | info |
| Docs build grew > 50% day-over-day | `(localmind_docs_total_bytes - localmind_docs_total_bytes offset 1d) / (localmind_docs_total_bytes offset 1d) > 0.50` for 10m | info |

### Runbook

- **BOM drift**: open the offending file in VS Code with `files.encoding: utf8` and Save. Use `python scripts/dedupe_docs.py --fix` (the #928 dedupe util also strips BOMs).
- **Empty files added**: remove the empty file (almost always a mistake).
- **Docs shrunk**: `git log --oneline -- docs/ | head -5` to find the most recent deletion. If unintended, revert the offending commit.
- **Docs grew >50% overnight**: open the PR; large additions are usually intentional (new feature doc). The alert is informational, not blocking.

## Tests

```bash
python -m pytest tests/test_collect_docs_metrics.py -v
```

The suite covers metric extraction (files, bytes, headings, links, code
blocks, BOMs, empty files, extensions, sha256 stability), Prometheus
output (HELP lines, dict-flattened label paragraphs, info gauge), JSON
output (round-trips through `json.loads`), baseline write/read round-trip,
drift detection (identical tree, size drop outside / within per-metric
threshold, non-numeric exclusion, boolean exclusion, missing-metric
exclusion), and full CLI surface (exit codes for missing root, missing
baseline, ok drift, drift outside --check threshold).

## Related

- [`docs/dedupe-docs.md`](dedupe-docs.md) — the dedupe gate from issue #928.
  Tests for that util live at `tests/test_dedupe_docs.py`.
- The metrics reported here are emitted by `scripts/collect_docs_metrics.py`
  and may be cross-referenced with the `--write-baseline` snapshot written
  by the first deploy of a fresh docs set.

## Issue

Resolves [issue #929](https://github.com/imDarshanGK/localmind/issues/929) —
*"Add observability metrics to build and deploy docs"*.
