"""
Tests for citation merging (issue #934).

Covers:
- merge_citations deduplicates by (source, chunk) across multiple lists.
- MergeResult exposes `merged`, `duplicates`, `contributed_by`.
- Score aggregation via default_score_merger (arithmetic mean).
- Preview selection via default_preview_merger (longest wins).
- Legacy string sources are upgrade-merged with dict sources.
- Conflict policy: first-seen entry wins structural fields; preview
  / score are aggregated deterministically.
- Edge cases: empty inputs, single list, scores short by one, None
  per-list scores, custom merger callables.
"""

from __future__ import annotations

from services.citation_utils import (
    MergeResult,
    default_preview_merger,
    default_score_merger,
    merge_citations,
    normalize_citations,
)


# ─── default_score_merger ───────────────────────────────────────


class TestDefaultScoreMerger:
    def test_empty_returns_zero(self):
        assert default_score_merger([]) == 0.0

    def test_single_value_pass_through(self):
        assert default_score_merger([0.5]) == 0.5

    def test_mean_of_two(self):
        assert default_score_merger([0.2, 0.8]) == 0.5

    def test_mean_of_three(self):
        assert abs(default_score_merger([0.2, 0.4, 0.6]) - 0.4) < 1e-9

    def test_none_scores_skipped(self):
        # No contributing entries -> 0.0 (no division by zero).
        assert default_score_merger([None, None]) == 0.0

    def test_partial_none(self):
        assert default_score_merger([0.4, None, 0.6]) == 0.5

    def test_non_numeric_string_skipped(self):
        assert default_score_merger(["garbage", 0.5]) == 0.5


# ─── default_preview_merger ─────────────────────────────────────


class TestDefaultPreviewMerger:
    def test_empty_returns_empty(self):
        assert default_preview_merger([]) == ""

    def test_single_passes_through(self):
        assert default_preview_merger(["Hello"]) == "Hello"

    def test_longest_wins(self):
        assert default_preview_merger(["short", "longer preview"]) == "longer preview"

    def test_tie_keeps_earliest_seen(self):
        # Both "foo" and "foo" have the same length — keep the first
        # since the function only replaces when strictly greater.
        assert default_preview_merger(["foo", "foo"]) == "foo"

    def test_none_entries_skipped(self):
        assert default_preview_merger([None, "kept"]) == "kept"

    def test_all_none_returns_empty(self):
        assert default_preview_merger([None, None]) == ""


# ─── merge_citations basics ─────────────────────────────────────


class TestMergeCitationsBasic:
    def test_no_inputs_returns_empty(self):
        result = merge_citations()
        assert isinstance(result, MergeResult)
        assert result.merged == []
        assert result.duplicates == []
        assert result.contributed_by == {}

    def test_single_list_passed_through(self):
        sources = [{"source": "a.md", "chunk": 0, "preview": "alpha"}]
        result = merge_citations(sources)
        assert len(result.merged) == 1
        assert result.merged[0]["source"] == "a.md"
        assert result.merged[0]["occurrence_count"] == 1
        assert result.contributed_by[("a.md", 0)] == [0]

    def test_two_disjoint_lists(self):
        a = [{"source": "a.md", "chunk": 0}]
        b = [{"source": "b.md", "chunk": 0}]
        result = merge_citations(a, b)
        sources = {m["source"] for m in result.merged}
        assert sources == {"a.md", "b.md"}
        assert len(result.duplicates) == 0

    def test_overlapping_lists_dedupe(self):
        a = [{"source": "a.md", "chunk": 0, "preview": "from a"}]
        b = [{"source": "a.md", "chunk": 0, "preview": "from b longer"}]
        result = merge_citations(a, b)
        assert len(result.merged) == 1
        merged = result.merged[0]
        assert merged["occurrence_count"] == 2
        # Preview takes the longest.
        assert merged["preview"] == "from b longer"
        # Both lists contributed.
        assert sorted(result.contributed_by[("a.md", 0)]) == [0, 1]
        # One duplicate recorded.
        assert len(result.duplicates) == 1
        assert result.duplicates[0]["list_idx"] == 1

    def test_different_chunks_same_file_kept(self):
        a = [{"source": "doc.md", "chunk": 0}]
        b = [{"source": "doc.md", "chunk": 1}]
        result = merge_citations(a, b)
        assert len(result.merged) == 2
        chunks = {m["chunk"] for m in result.merged}
        assert chunks == {0, 1}

    def test_preserves_ad_hoc_fields(self):
        a = [{"source": "a.md", "chunk": 0, "extra_field": "kept"}]
        result = merge_citations(a)
        assert result.merged[0].get("extra_field") == "kept"


# ─── merge order is deterministic ────────────────────────────────


class TestMergeOrder:
    def test_first_seen_order(self):
        a = [{"source": "b.md", "chunk": 0}, {"source": "a.md", "chunk": 0}]
        b = [{"source": "b.md", "chunk": 0}, {"source": "a.md", "chunk": 0}]
        result = merge_citations(a, b)
        sources_in_order = [m["source"] for m in result.merged]
        assert sources_in_order == ["b.md", "a.md"]

    def test_duplicates_dont_promote_later_entry(self):
        # Later list has a longer preview — does NOT move the entry to
        # the back of the merged output.
        a = [{"source": "x.md", "chunk": 0, "preview": "short"}]
        b = [{"source": "y.md", "chunk": 0, "preview": "other"}]
        c = [{"source": "x.md", "chunk": 0, "preview": "longer preview"}]
        result = merge_citations(a, b, c)
        assert result.merged[0]["source"] == "x.md"
        assert result.merged[1]["source"] == "y.md"
        assert result.merged[0]["preview"] == "longer preview"


# ─── Legacy string compatibility ────────────────────────────────


class TestLegacyStringCompatibility:
    def test_string_promoted_to_dict(self):
        result = merge_citations(["legacy.md"])
        assert result.merged[0]["source"] == "legacy.md"
        assert result.merged[0]["chunk"] == 0

    def test_mixed_string_and_dict_lists(self):
        result = merge_citations(
            ["string.md"],
            [{"source": "dict.md", "chunk": 2}],
        )
        sources = {m["source"] for m in result.merged}
        assert sources == {"string.md", "dict.md"}

    def test_duplicate_string_across_lists(self):
        result = merge_citations(["legacy.md"], ["legacy.md"])
        assert len(result.merged) == 1
        assert result.merged[0]["occurrence_count"] == 2


# ─── Score aggregation ──────────────────────────────────────────


class TestScoreAggregation:
    def test_score_set_from_scores_param(self):
        a = [{"source": "a.md", "chunk": 0}]
        result = merge_citations(a, scores=[[0.8]])
        assert result.merged[0]["score"] == 0.8

    def test_scores_aggregated_on_duplicate(self):
        a = [{"source": "a.md", "chunk": 0}]
        b = [{"source": "a.md", "chunk": 0}]
        result = merge_citations(a, b, scores=[[0.6], [0.8]])
        assert result.merged[0]["score"] == 0.7  # mean(0.6, 0.8)

    def test_scores_implied_none_for_short_scores(self):
        # scores shorter than citation_lists: padded with None.
        a = [{"source": "a.md", "chunk": 0}]
        b = [{"source": "a.md", "chunk": 0}]
        result = merge_citations(a, b, scores=[[0.6]])
        # Second list contributes no score — existing score retained.
        assert result.merged[0]["score"] == 0.6

    def test_explicit_none_in_scores(self):
        a = [{"source": "a.md", "chunk": 0, "score": 0.5}]
        result = merge_citations(a, scores=[None])
        # None for the score stream → existing score on the dict kept.
        assert result.merged[0]["score"] == 0.5

    def test_missing_score_kept_none_when_absent(self):
        # No "score" key on dict AND no scores param — score key absent.
        a = [{"source": "a.md", "chunk": 0}]
        result = merge_citations(a)
        assert "score" not in result.merged[0]


# ─── Custom merger callables ─────────────────────────────────────


class TestCustomMergers:
    def test_custom_score_merger_max(self):
        a = [{"source": "a.md", "chunk": 0}]
        b = [{"source": "a.md", "chunk": 0}]
        result = merge_citations(
            a,
            b,
            scores=[[0.2], [0.9]],
            score_merger=max,
        )
        assert result.merged[0]["score"] == 0.9

    def test_custom_preview_merger_first_seen(self):
        a = [{"source": "a.md", "chunk": 0, "preview": "first"}]
        b = [{"source": "a.md", "chunk": 0, "preview": "second longer"}]

        def first_seen(previews):
            for p in previews:
                if p:
                    return p
            return ""

        result = merge_citations(a, b, preview_merger=first_seen)
        assert result.merged[0]["preview"] == "first"


# ─── Edge cases ─────────────────────────────────────────────────


class TestEdgeCases:
    def test_empty_list_in_args(self):
        # An empty positional list counts as a contributor but yields nothing.
        a = [{"source": "a.md", "chunk": 0}]
        result = merge_citations([], a, [])
        assert len(result.merged) == 1
        assert result.contributed_by[("a.md", 0)] == [1]

    def test_non_list_arg_skipped(self):
        result = merge_citations(None, [{"source": "a.md", "chunk": 0}])  # type: ignore[arg-type]
        assert len(result.merged) == 1

    def test_malformed_entry_normalised_to_unknown(self):
        result = merge_citations([42, True])  # type: ignore[list-item]
        assert len(result.merged) == 1
        assert result.merged[0]["source"] == "unknown"
        assert result.merged[0]["chunk"] == 0

    def test_non_numeric_chunk_coerced_to_zero(self):
        result = merge_citations([{"source": "a.md", "chunk": "not_a_number"}])
        assert result.merged[0]["chunk"] == 0

    def test_three_way_merge_partial_overlap(self):
        a = [
            {"source": "a.md", "chunk": 0, "preview": "alpha"},
            {"source": "b.md", "chunk": 0, "preview": "beta"},
        ]
        b = [{"source": "a.md", "chunk": 0, "preview": "alpha longer"}]
        c = [
            {"source": "a.md", "chunk": 0, "preview": "alpha even longer still"},
            {"source": "c.md", "chunk": 0, "preview": "gamma"},
        ]
        result = merge_citations(a, b, c)
        sources = {m["source"] for m in result.merged}
        assert sources == {"a.md", "b.md", "c.md"}
        a_entry = next(m for m in result.merged if m["source"] == "a.md")
        assert a_entry["occurrence_count"] == 3
        assert a_entry["preview"] == "alpha even longer still"
        assert sorted(a_entry["contributors"]) == [0, 1, 2]

    def test_preview_merger_called_with_empty_returns_empty_string(self):
        # Both entries have no "preview" key — merger returns "" via
        # default_preview_merger's `best = ""` initial.
        a = [{"source": "a.md", "chunk": 0}]
        b = [{"source": "a.md", "chunk": 0}]
        result = merge_citations(a, b)
        assert "preview" in result.merged[0]
        assert result.merged[0]["preview"] == ""


# ─── normalize_citations helper ─────────────────────────────────


class TestNormalizeCitations:
    def test_empty_list(self):
        assert normalize_citations([]) == []

    def test_dict_list_passes_through_shallow_copy(self):
        source = {"source": "a.md", "chunk": 0, "preview": "x"}
        normalised = normalize_citations([source])
        assert normalised[0]["source"] == "a.md"
        # Mutable: caller mutating input must not leak through.
        source["source"] = "mutated.md"
        assert normalised[0]["source"] == "a.md"

    def test_string_promoted(self):
        result = normalize_citations(["legacy.md"])
        assert result[0] == {"source": "legacy.md", "chunk": 0}

    def test_non_list_returns_empty(self):
        assert normalize_citations("not a list") == []  # type: ignore[arg-type]

    def test_mixed_entries(self):
        result = normalize_citations(["legacy.md", {"source": "dict.md", "chunk": 1}])
        assert {r["source"] for r in result} == {"legacy.md", "dict.md"}
        assert result[1]["chunk"] == 1


# ─── MergeResult.to_dict serialisation ──────────────────────────


class TestMergeResultSerialisation:
    def test_to_dict_has_expected_keys(self):
        result = merge_citations(
            [{"source": "a.md", "chunk": 0}],
            [{"source": "a.md", "chunk": 0}],
        )
        serialised = result.to_dict()
        assert set(serialised.keys()) == {"merged", "duplicates", "contributed_by"}
        assert "a.md#0" in serialised["contributed_by"]

    def test_to_dict_empty_when_no_inputs(self):
        result = merge_citations()
        assert result.to_dict() == {
            "merged": [],
            "duplicates": [],
            "contributed_by": {},
        }


# ─── Backward compat: build_sources unchanged + merge interplay ──


class TestBuildSourcesInterplay:
    """Verify that merge_citations accepts output of build_sources."""

    def test_merge_two_build_sources_outputs(self):
        from services.citation_utils import build_sources

        docs_a = ["alpha chunk 0 text"]
        docs_b = ["alpha chunk 0 different text longer"]
        metas_a = [{"source": "alpha.md", "chunk": 0}]
        metas_b = [{"source": "alpha.md", "chunk": 0}]

        a = build_sources(docs_a, metas_a)
        b = build_sources(docs_b, metas_b)
        result = merge_citations(a, b)
        assert len(result.merged) == 1
        assert result.merged[0]["occurrence_count"] == 2
        # The longer preview (from b) wins.
        assert result.merged[0]["preview"] == "alpha chunk 0 different text longer"
