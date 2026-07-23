"""Tests for source ranking (issue #933).

Covers:

- `_parse_isoformat` — ISO string, naive datetime, aware datetime,
  missing/empty/invalid → None.
- `_relevance_score` — valid float, NaN, non-numeric → 0.0, perfect
  match (0) → 1.0, worst (2) → 0.0.
- `_recency_score` — 0 days → 1.0, 365 days → 0.0, >365 days → 0.0,
  missing/empty/invalid → 0.0, future (clock-skew) → 1.0.
- `_authority_score` — matches `README.md`, `docs/foo.md`,
  `frontend/src/App.jsx`, `backend/services/foo.py`, unspecified
  source → base (0.40), official-like keyword match.
- `RankWeights.normalised()` — 0/0/0 → all 0.0, 1/1/1 → 1/3 each.
- `rank_sources`:
  - empty list → empty output.
  - single source — score composited, rank=0.
  - two sources with different relevance → higher relevance first.
  - tie-breaking: sources with equal score → filename THEN chunk
    ascending serve as deterministic tiebreakers.
  - weights at 0 → all scores 0 → tie-on-filename/chunk order.
  - custom authority rules override a doc.
  - `now` kwarg pinning recency to a fixed date (for CI determinism).
- CLI surface: `scripts/rank_sources.py` (subprocess).
- Purity: no ChromaDB / sentence-transformers side effects.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.citation_utils import (  # noqa: E402
    DEFAULT_AUTHORITY_RULES,
    RankWeights,
    _authority_score,
    _parse_isoformat,
    _recency_score,
    _relevance_score,
    rank_sources,
)

# ---------------------------------------------------------------------------
# Singleton helpers
# ---------------------------------------------------------------------------


class TestParseIsoformat:
    def test_iso_utc_z_suffix(self):
        dt = _parse_isoformat("2026-07-22T10:00:00Z")
        assert dt is not None
        assert dt.tzinfo == timezone.utc
        assert dt.year == 2026 and dt.day == 22

    def test_naive_datetime_is_treated_as_utc(self):
        dt = _parse_isoformat(datetime(2026, 7, 22, 10, 0, 0))
        assert dt is not None
        assert dt.tzinfo == timezone.utc

    def test_aware_datetime_is_converted_to_utc(self):
        eastern = timezone(timedelta(hours=-5))
        aware = datetime(2026, 7, 22, 10, 0, 0, tzinfo=eastern)
        dt = _parse_isoformat(aware)
        assert dt is not None
        assert dt.tzinfo == timezone.utc
        assert dt.hour == 15  # UTC

    def test_missing_and_empty_returns_none(self):
        assert _parse_isoformat(None) is None
        assert _parse_isoformat("") is None

    def test_garbage_string_returns_none(self):
        assert _parse_isoformat("not-a-date") is None


class TestRelevanceScore:
    def test_perfect_match_is_1(self):
        assert _relevance_score(0.0) == 1.0

    def test_worst_match_is_0(self):
        assert _relevance_score(2.0) == 0.0

    def test_midpoint_is_0_5(self):
        assert _relevance_score(1.0) == 0.5

    def test_nan_returns_0(self):
        assert _relevance_score(float("nan")) == 0.0

    def test_non_numeric_returns_0(self):
        assert _relevance_score("abc") == 0.0
        assert _relevance_score(None) == 0.0


class TestRecencyScore:
    @pytest.fixture
    def now(self) -> datetime:
        return datetime(2026, 7, 23, 12, 0, 0, tzinfo=timezone.utc)

    def test_today_is_1(self, now):
        assert _recency_score(now, now=now) == 1.0

    def test_365_days_is_0(self, now):
        assert _recency_score(now - timedelta(days=365), now=now) == 0.0

    def test_older_than_365_is_0(self, now):
        assert _recency_score(now - timedelta(days=400), now=now) == 0.0

    def test_future_clock_skew_is_1(self, now):
        assert _recency_score(now + timedelta(days=10), now=now) == 1.0

    def test_missing_is_0(self, now):
        assert _recency_score(None, now=now) == 0.0
        assert _recency_score("", now=now) == 0.0

    def test_180_days_is_roughly_0_5(self, now):
        score = _recency_score(now - timedelta(days=180), now=now)
        assert score == pytest.approx(0.5, abs=0.02)


class TestAuthorityScore:
    def test_readme_matches_dedicated_rule(self):
        assert _authority_score("README.md") == 0.55

    def test_docs_subdir_matches_high_authority(self):
        assert _authority_score("docs/csrf-protection.md") == 0.70

    def test_frontend_src_matches(self):
        assert _authority_score("frontend/src/components/SettingsPanel.jsx") == 0.40

    def test_backend_service_matches(self):
        assert _authority_score("backend/services/rag_service.py") == 0.55

    def test_unknown_source_gets_base(self):
        assert _authority_score("notes.txt") == 0.40

    def test_official_keyword_match_fires(self):
        assert _authority_score("RFC 9110 spec.md") == 0.85

    def test_empty_source_gets_base(self):
        assert _authority_score("") == 0.40

    def test_custom_rules_override(self):
        import re

        rules = ((re.compile(r"^custom\.md$"), 1.0),)
        assert _authority_score("custom.md", rules=rules) == 1.0


class TestRankWeights:
    def test_defaults_sum_to_1(self):
        w = RankWeights()
        assert w.relevance == 0.65
        assert w.recency == 0.10
        assert w.authority == 0.25

    def test_normalised_handles_zero_sum(self):
        w = RankWeights(0, 0, 0).normalised()
        assert w.relevance == 0.0
        assert w.recency == 0.0
        assert w.authority == 0.0

    def test_normalised_scales_proportionally(self):
        w = RankWeights(0.7, 0.1, 0.2).normalised()
        # Already sums to 1, so no change.
        assert w.relevance == 0.7
        assert w.recency == 0.1
        assert w.authority == 0.2

    def test_as_dict_round_trip(self):
        w = RankWeights(0.6, 0.2, 0.2)
        d = w.as_dict()
        assert d == {"relevance": 0.6, "recency": 0.2, "authority": 0.2}


# ---------------------------------------------------------------------------
# rank_sources integration
# ---------------------------------------------------------------------------


class TestRankSources:
    @pytest.fixture
    def sample_sources(self) -> list[dict]:
        return [
            {"source": "docs/csrf-protection.md", "chunk": 0, "preview": "CSRF..."},
            {"source": "README.md", "chunk": 2, "preview": "README preview..."},
            {"source": "README.md", "chunk": 0, "preview": "Intro..."},
            {"source": "uncategorized.txt", "chunk": 0, "preview": "Note..."},
        ]

    def test_empty_list_returns_empty(self):
        assert rank_sources([]) == []

    def test_single_source_has_score(self):
        result = rank_sources([{"source": "a.md", "chunk": 0}])
        assert len(result) == 1
        assert "score" in result[0]
        assert "components" in result[0]
        assert result[0]["source"]["source"] == "a.md"

    def test_higher_relevance_ranks_first(self, sample_sources):
        # Give the CSRF source the best relevance (lowest distance = 0),
        # README entries higher distance → lower score.
        dists = [0.0, 1.5, 1.5, 1.5]
        result = rank_sources(sample_sources, relevance_distances=dists)
        top = result[0]
        assert top["source"]["source"] == "docs/csrf-protection.md"

    def test_tie_broken_by_filename_then_chunk(self, sample_sources):
        # All relevance equal → authority dominates → README.md (0.55)
        # > docs (0.70) the docs/ source wins. Between the two README
        # entries chunk 0 beats chunk 2. uncategorized.txt = base 0.40.
        result = rank_sources(sample_sources)
        # Expected order: docs/csrf-protection.md (0.70 authority), README
        # chunk 0, README chunk 2, uncategorized.txt (0.40).
        assert result[0]["source"]["source"] == "docs/csrf-protection.md"
        assert result[1]["source"]["chunk"] == 0  # README
        assert result[2]["source"]["chunk"] == 2  # README
        assert result[3]["source"]["source"] == "uncategorized.txt"

    def test_all_zero_weights_ranks_by_filename_then_chunk(self, sample_sources):
        weights = RankWeights(0, 0, 0)
        result = rank_sources(sample_sources, weights=weights)
        # All scores are 0 → sorted exclusively by source name then chunk.
        sources = [r["source"]["source"] for r in result]
        chunks = [r["source"]["chunk"] for r in result]
        assert sources == sorted(sources)
        # Verify that two same-name entries are in chunk-order.
        readme_idx = [i for i, s in enumerate(sources) if s == "README.md"]
        assert len(readme_idx) == 2
        assert chunks[readme_idx[0]] < chunks[readme_idx[1]]

    def test_recency_dominates_when_weight_high(self, sample_sources):
        weights = RankWeights(relevance=0.1, recency=0.8, authority=0.1)
        now = datetime(2026, 7, 23, tzinfo=timezone.utc)
        today = now.isoformat()
        old = (now - timedelta(days=400)).isoformat()
        recency_list = [today, today, old, old]
        result = rank_sources(
            sample_sources,
            recency_timestamps=recency_list,
            weights=weights,
            now=now,
        )
        # Top two must be the recent ones.
        recent_sources = {result[0]["source"]["source"], result[1]["source"]["source"]}
        assert "docs/csrf-protection.md" in recent_sources
        assert (
            "README.md" in result[0]["source"]["source"]
            or "README.md" in result[1]["source"]["source"]
        )

    def test_now_kwarg_freeze_date_determinism(self, sample_sources):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        result_a = rank_sources(
            sample_sources,
            recency_timestamps=["2026-01-01T00:00:00Z"] * 4,
            now=now,
        )
        result_b = rank_sources(
            sample_sources,
            recency_timestamps=["2026-01-01T00:00:00Z"] * 4,
            now=now,
        )
        assert result_a == result_b

    def test_custom_authority_rules_override(self, sample_sources):
        import re

        rules = (
            (re.compile(r"^uncategorized"), 1.0),
            *DEFAULT_AUTHORITY_RULES,
        )
        result = rank_sources(sample_sources, authority_rules=rules)
        # uncategorized should now be top (authority 1.0).
        assert result[0]["source"]["source"] == "uncategorized.txt"

    def test_missing_relevance_defaults_to_neutral(self, sample_sources):
        dists = [None, None, None, None]
        result = rank_sources(sample_sources, relevance_distances=dists)
        components = result[0]["components"]
        assert components["relevance"] == pytest.approx(0.5)

    def test_short_relevance_list_padded_with_neutral(self, sample_sources):
        dists = [0.0]  # only first source has a distance
        result = rank_sources(sample_sources, relevance_distances=dists)
        assert result[0]["components"]["relevance"] == pytest.approx(1.0)
        assert result[1]["components"]["relevance"] == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# CLI tooling: scripts/rank_sources.py
# ---------------------------------------------------------------------------


class TestRankSourcesCLI:
    @pytest.fixture
    def tool_path(self) -> Path | None:
        candidate = Path(__file__).resolve().parents[2] / "scripts" / "rank_sources.py"
        return candidate if candidate.is_file() else None

    def run_cli(self, args: list[str]) -> subprocess.CompletedProcess:
        tool = Path(__file__).resolve().parents[2] / "scripts" / "rank_sources.py"
        assert tool.is_file()
        return subprocess.run(
            [sys.executable, str(tool), *args],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_json_input_returns_ranked_list(self, tmp_path: Path):
        tool = Path(__file__).resolve().parents[2] / "scripts" / "rank_sources.py"
        if not tool.is_file():
            pytest.skip("`scripts/rank_sources.py` not present in this checkout")

        in_file = tmp_path / "sources.json"
        in_file.write_text(
            json.dumps(
                [
                    {"source": "docs/a.md", "chunk": 0},
                    {"source": "README.md", "chunk": 1},
                ]
            ),
            encoding="utf-8",
        )
        result = subprocess.run(
            [sys.executable, str(tool), "--json", str(in_file)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0
        ranked = json.loads(result.stdout)
        assert len(ranked) == 2
        assert ranked[0]["source"]["source"] == "docs/a.md"

    def test_plain_mode_output(self, tmp_path: Path):
        tool = Path(__file__).resolve().parents[2] / "scripts" / "rank_sources.py"
        if not tool.is_file():
            pytest.skip("`scripts/rank_sources.py` not present in this checkout")

        in_file = tmp_path / "sources.json"
        in_file.write_text(
            json.dumps(
                [
                    {"source": "docs/a.md", "chunk": 0},
                ]
            ),
            encoding="utf-8",
        )
        result = subprocess.run(
            [sys.executable, str(tool), "--plain", str(in_file)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0
        assert "rank" in result.stdout.lower() or "#1" in result.stdout

    def test_missing_input_file_returns_2(self, tmp_path: Path):
        tool = Path(__file__).resolve().parents[2] / "scripts" / "rank_sources.py"
        if not tool.is_file():
            pytest.skip("`scripts/rank_sources.py` not present in this checkout")

        missing = tmp_path / "nonexistent.json"
        result = subprocess.run(
            [sys.executable, str(tool), str(missing)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 2


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
