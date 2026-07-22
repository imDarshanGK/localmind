# Docs Dedupe Check

> Companion to `.github/workflows/docs-regression.yml`. Runs on every push / pull
> request that touches `docs/**`, `*.md`, `scripts/dedupe_docs.py`, or
> `tests/test_dedupe_docs.py`. Fails the build if duplicates are detected.

## Why dedupe?

LocalMind's docs are deployed straight from `docs/**` and the repo root markdown
(`README.md`, etc.). When two files share a heading anchor — e.g. both
`docs/a.md` and `docs/b.md` have `## Configuration` — GitHub's auto-generated
anchor `#configuration` resolves to *one* of them and any deep link to the
other file silently breaks. Same hazard for in-file duplicate headings, repeated
`[ref]: https://example.com "Title"` lines (some static site generators pick
the last, some pick the first), and byte-identical docs (one usually is a copy
that should be a redirect).

## What gets flagged

`scripts/dedupe_docs.py` checks six categories:

| Category | What it catches |
| --- | --- |
| `DUP-H1` | A heading at the same H1–H6 level repeats **within a single file** with the same slugified anchor. |
| `DUP-HX` | The same anchor slug appears in **two different files** — deep links will resolve ambiguously. |
| `DUP-REF` | A `[label]: url` reference link is defined more than once in a file with conflicting URLs. |
| `DUP-INLINE` | The same `[text](url)` inline link is repeated verbatim (the first occurrence is preserved, duplicates flagged). |
| `DUP-FILE` | Two files normalize to the same SHA-256 (byte-identical, BOM differences ignored). |
| `BOM`     | A file starts with a UTF-8 / UTF-16 LE / UTF-16 BE byte-order mark. Deploy pipelines should emit UTF-8 without BOM. |

## Running locally

```bash
# Scan only — prints a human-readable report (exit 0).
python scripts/dedupe_docs.py

# CI mode — exit 1 if dupes detected (used by docs-regression.yml).
python scripts/dedupe_docs.py --check

# Apply auto-repairs (strips BOMs, renames duplicate in-file headings with
# a `(<filename> <idx>)` suffix). Idempotent.
python scripts/dedupe_docs.py --fix

# Machine-readable JSON report (for dashboards / other CI tooling).
python scripts/dedupe_docs.py --json

# Custom glob — scan only a subset.
python scripts/dedupe_docs.py --glob "src/**/*.md" --glob "CHANGELOG.md"
```

## Tests

```bash
python -m pytest tests/test_dedupe_docs.py -v
```

The suite covers every detector, the `--fix` rewriter (including idempotence
and side-effect isolation), and the CLI surface (exit codes for `--check`,
`--json`, `--fix`, default scan, plus a non-existent-root failure case).

## Design notes

- **No third-party dependencies.** The script intentionally uses only the
  Python stdlib so it runs in any CI runner or pre-commit hook without an
  extra pip install.
- **`--fix` is conservative.** It auto-strips BOMs and renames duplicate
  in-file headings (the FIRST occurrence is preserved; later duplicates get
  suffixed). Duplicate files and redefined ref-links are NOT auto-repaired
  because the correct fix depends on intent — those are reported for human
  review.
- **Image links are ignored.** `![alt](image.png)` is excluded from the
  inline-link duplicate check because reusing the same asset across many
  sections is normal and not a defect.
- **Empty headings are flagged.** A heading like `## ` (no text) generates
  the fallback `#section` anchor, which is almost always a documentation
  mistake.

## Issue

Resolves [issue #928](https://github.com/imDarshanGK/localmind/issues/928) —
*"Add dedupe logic to build and deploy docs"*.
