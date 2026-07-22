# Docs Build & Deploy Failure Recovery

> Companion to `.github/workflows/docs-regression.yml`. Runs as a CI gate on
> every push / pull request that touches `docs/**`, `*.md`, the recovery
> util itself, or its tests. Fails the build when manual-action failures
> are detected.

This document is the failure-mode catalogue + runbook for the
LocalMind build and deploy docs pipeline. The catalogue is enforced by
`scripts/recover_docs_build.py` (issue #930); refer to it for the
machine-readable detector.

## Why a failure catalogue?

The build & deploy docs pipeline (`docs-regression.yml`) lints markdown
and checks broken links. Both are silent to **content-level failure
modes** that slip past the linter but break deploys: byte-order marks,
CRLF line endings on Windows-side commits, missing final newlines,
duplicate heading anchors, byte-drift against a previous deploy baseline,
local-link cycles, and corruption markers like U+FFFD. The recovery
utility enumerates those modes, auto-repairs what it can, and on the
rest emits a structured plan with a documented runbook so an on-call
maintainer can resolve the failure in minutes.

## The script

`scripts/recover_docs_build.py` (zero dependencies — Python stdlib).

### Modes

```bash
# Default: scan + print the recovery plan.
python scripts/recover_docs_build.py

# CI gate: exit 1 if any failures are detected.
python scripts/recover_docs_build.py --check

# Apply auto-repairs in-place (idempotent).
python scripts/recover_docs_build.py --apply

# Repair + verify clean in one command.
python scripts/recover_docs_build.py --apply --check

# Machine-readable JSON plan (dashboards / chatops integration).
python scripts/recover_docs_build.py --json

# Also detect tree-level sha256 drift against an issue #929 baseline.
python scripts/recover_docs_build.py \
  --baseline .docs.metrics.baseline.json \
  --check
```

## Failure-mode catalogue

| Tag                        | Detected by                         | Auto-repair | On-call runbook |
| -------------------------- | ----------------------------------- | ----------- | --------------- |
| `bom_detected`             | File starts with a UTF-8/16 BOM      | Yes         | [BOM](#bom_detected) |
| `crlf_line_endings`        | `\r\n` sequences in content         | Yes         | [CRLF](#crlf_line_endings) |
| `trailing_whitespace`      | Line ends with spaces/tabs          | Yes         | [Trailing WS](#trailing_whitespace) |
| `missing_final_newline`    | File does not end with `\n`         | Yes         | [Missing newline](#missing_final_newline) |
| `duplicate_heading_anchor` | Two headings share a slug (within-file or cross-file) | Yes | [Duplicate anchor](#duplicate_heading_anchor) |
| `empty_file`               | Zero-byte markdown file             | No          | [Empty file](#empty_file) |
| `circular_link`            | Local-link cycle A → B → A          | No          | [Circular link](#circular_link) |
| `unicode_replacement_chars`| `U+FFFD` present in decoded content  | No          | [U+FFFD](#unicode_replacement_chars) |
| `baseline_sha_mismatch`    | `--baseline` sha differs from current tree sha | No  | [Baseline drift](#baseline_sha_mismatch) |

## Runbook

### bom_detected

**What:** A file (`docs/<file>.md` or root `*.md`) begins with `EF BB BF`
(UTF-8 BOM), `FF FE` (UTF-16 LE BOM), or `FE FF` (UTF-16 BE BOM). Render
sniffers/repo viewers display these as mojibake.

**Recovery:** `python scripts/recover_docs_build.py --apply` re-encodes the
file as UTF-8 without a BOM.

**Prevention:** Configure your editor: VS Code → `"files.encoding": "utf8"`,
`"files.insertFinalNewline": true`.

### crlf_line_endings

**What:** File contains `\r\n` line endings (typical from a Windows editor
without `core.autocrlf = input`). Causes unstable diffs and merge noise.

**Recovery:** `python scripts/recover_docs_build.py --apply` normalises all
line endings to `\n`.

**Prevention:** `git config --global core.autocrlf input`. For the repo,
add a `.gitattributes` rule: `*.md text eol=lf`.

### trailing_whitespace

**What:** Line ends with one or more spaces or tabs. Picked up as annoying
diff noise on otherwise identical edits.

**Recovery:** `python scripts/recover_docs_build.py --apply` strips trailing
whitespace per detected line.

**Prevention:** Most editors have a "Trim Trailing Whitespace on Save"
setting — enable it.

### missing_final_newline

**What:** File's last character is not `\n`. POSIX requires a trailing
newline; some deploy tooling concatenates files with `cat` and a missing
newline glues adjacent files together.

**Recovery:** `python scripts/recover_docs_build.py --apply` appends a
single newline.

**Prevention:** Configure your editor: VS Code `"files.insertFinalNewline": true`.

### duplicate_heading_anchor

**What:** Two ATX headings at the same level produce the same slug. Within
a file → ambiguous in-page navigation. Across files → ambiguous deep link
target (GitHub / static site generators resolve to the first match).

**Recovery:** `python scripts/recover_docs_build.py --apply` renames the
duplicate occurrence(s) (first is preserved) by appending `(<file stem>
<idx>)` to the heading text — e.g. `## Configuration` becomes `##
Configuration (csrf-protection 1)`.

**Prevention:** Disambiguate headings with topic-specific prefixes
(`CSRF Configuration` vs `Cache Configuration` vs `Model Configuration`).

### empty_file

**What:** Zero-byte markdown file. Almost always a `git mv` mistake or
an empty new-doc stub that was never filled in. The deploy pipeline
renders an empty page that links to nothing.

**Recovery:** Manual — the util **does not** auto-delete because the file
may be intentionally empty (a placeholder for future content). Delete the
file (`rm docs/empty.md`) or fill it with the intended content.

**Detection:** `python scripts/recover_docs_build.py --check` flags the
file; the JSON plan carries `{"mode": "empty_file", "file": "<path>"}`.

### circular_link

**What:** A local-link cycle was detected in the docs graph
(`docs/a.md` → `docs/b.md` → `docs/a.md`). A user navigating such a chain
lands on a page that links back to the start, with no escape. Self-loops
(`docs/a.md` → `docs/a.md`) are also flagged.

**Recovery:** Manual — the util **does not** auto-edit doc content to break
cycles. Inspect the chain, identify the unintended direction, and either
change one of the link targets to a different relevant page or convert it
to an external-link reference.

**Detection:** The JSON plan reports one failure per detected cycle
**starting at each start node**. For a 2-file cycle A → B → A you will see
two failures (`A → B → A` started from A; `B → A → B` started from B). Both
refer to the same underlying cycle; fixing one resolves both.

### unicode_replacement_chars

**What:** UTF-8 decode of file content produced `U+FFFD` replacement
characters, indicating byte corruption (e.g. an editor saved the file as
Latin-1, then re-opened it as UTF-8). Common after Windows-save-as-ANSI or
after a `git filter-branch` encoding rewrite gone wrong.

**Recovery:** Manual — the util reports the count and the file but does
not attempt to recover (any text-based auto-fix would lose the original
characters). Inspect the file byte-by-byte
(`xxd docs/<file>.md | head -100`) and recover from `git log -p -- docs/<file>.md`
if possible. If not, retyping the affected section is usually faster than
salvaging.

### baseline_sha_mismatch

**What:** The user passed `--baseline <json>` pointing at a previous deploy
metrics snapshot (the `--write-baseline` output from issue #929). The
current tree's canonical `sha256` of all concatenated bytes does not match.
This signals **content drift** between the last recorded deploy and now.

**Recovery:** Manual — this is informational. To investigate:
```bash
git log -p -- docs/ '*.md' | less
```
If the drift was intentional (expected docs edits), refresh the baseline:
```bash
python scripts/collect_docs_metrics.py --write-baseline .docs.metrics.baseline.json
```
If the drift was NOT intentional, identify the suspect commit (`git log
--oneline -- docs/`) and `git revert <sha>` it.

**Detection:** Pass `--baseline` to `recover_docs_build.py` so the drift
failure is included in the plan:

```bash
python scripts/recover_docs_build.py \
  --baseline .docs.metrics.baseline.json \
  --check
```

## CI integration

`.github/workflows/docs-regression.yml` adds two new steps after the
existing markdown-lint and link-check:

1. `python scripts/recover_docs_build.py --check` — fails the build on
   any failure, repairable or manual-action.
2. `python -m pytest tests/test_recover_docs_build.py -q` — keep the util
   itself under regression.

To auto-repair in CI (rarely advisable, but supported for tightly
controlled repos), swap step 1 for:

```bash
python scripts/recover_docs_build.py --apply --check
git diff --exit-code || ( \
  git config user.name  'docs-recovery-bot' && \
  git config user.email 'docs-recovery-bot@users.noreply.github.com' && \
  git commit -am 'chore(docs): auto-recovered build failures' && \
  git push \
)
```

## Tests

```bash
python -m pytest tests/test_recover_docs_build.py -v
```

The suite covers every failure-mode detector, every auto-repair, the
idempotence of the apply pipeline, side-effect isolation across untouched
files, and the CLI surface (default scan, `--check`, `--apply`,
`--apply --check`, `--json`, `--baseline` match + mismatch + missing
keys, plus a non-existent-root failure case).

## Related

- [`docs/dedupe-docs.md`](dedupe-docs.md) — the issue #928 dedupe gate.
- [`docs/observability-metrics.md`](observability-metrics.md) — the issue #929 metrics collector.
- The failure catalogue above is the canonical reference for alerts
  raised against the metrics emitted by issue #929 — pair the
  observability alerts with this runbook to triage them.

## Issue

Resolves [issue #930](https://github.com/imDarshanGK/localmind/issues/930) —
*"Add failure recovery to build and deploy docs"*.
