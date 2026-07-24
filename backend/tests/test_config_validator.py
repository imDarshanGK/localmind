"""Tests for backend/utils/config_validator.py (issue #937).

Covers:
- ValidationIssue severity validation.
- ValidationRule invocation (happy + exception propagation).
- Each rule in DEFAULT_RULES, both clean & mutant inputs.
- Cross-field rules (overlap < chunk size).
- Environment-variable rules (OLLAMA_HOST, CORS_ORIGINS).
- summarise / has_errors / has_warnings shape.
- load_rules_from_module round-trips via a stub module on sys.path.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from utils.config_validator import (
    DEFAULT_RULES,
    SEVERITY_ERROR,
    SEVERITY_INFO,
    SEVERITY_WARN,
    ValidationIssue,
    ValidationRule,
    has_errors,
    has_warnings,
    load_rules_from_module,
    summarise,
    validate,
)


def _env_rule_names() -> list[str]:
    return [r.name for r in DEFAULT_RULES]


# ─── ValidationIssue dataclass ────────────────────────────────────


class TestValidationIssue:
    def test_clean_construction(self):
        i = ValidationIssue(SEVERITY_ERROR, "settings.x", "bad")
        assert i.severity == SEVERITY_ERROR
        assert i.location == "settings.x"
        assert i.message == "bad"

    def test_invalid_severity_raises(self):
        with pytest.raises(ValueError, match="severity"):
            ValidationIssue("FATAL", "settings.x", "x")

    def test_to_dict_shape(self):
        d = ValidationIssue(SEVERITY_WARN, "a", "b").to_dict()
        assert d == {"severity": SEVERITY_WARN, "location": "a", "message": "b"}


# ─── validate() — happy + exception paths ────────────────────────


class TestValidateDriver:
    def test_empty_rules_returns_empty(self):
        issues = validate({}, rules=[])
        assert issues == []

    def test_no_issue_when_rule_passes(self):
        rule = ValidationRule("noop", lambda c: [])
        assert validate({}, rules=[rule]) == []

    def test_rule_exception_surfaces_as_error(self):
        def boom(cfg):
            raise RuntimeError("kaput")

        rule = ValidationRule("boom", boom)
        issues = validate({}, rules=[rule])
        assert len(issues) == 1
        assert issues[0].severity == SEVERITY_ERROR
        assert issues[0].location == "__rule__.boom"
        assert "kaput" in issues[0].message

    def test_default_ruleset_runs_clean_config(self):
        config = {
            "settings": {
                "default_model": "llama3",
                "default_language": "en",
                "temperature": 0.7,
                "max_history_turns": 10,
                "rag_top_k": 4,
                "rag_chunk_overlap": 70,  # non-divisor of 600 → no INFO.
                "rag_chunk_size": 600,
                "theme": "dark",
            },
            "env": {"OLLAMA_HOST": "http://localhost:11434"},
        }
        os.environ.pop("CORS_ORIGINS", None)
        issues = validate(config)
        # application has clean running config; OLLAMA_HOST explicit.
        assert not has_errors(issues)


# ─── Individual default-ruleset rules ─────────────────────────────


class TestDefaultModelRule:
    def test_missing(self):
        issues = validate({"settings": {}}, rules=[DEFAULT_RULES[0]])
        assert has_errors(issues)

    def test_empty_string(self):
        issues = validate({"settings": {"default_model": ""}}, rules=[DEFAULT_RULES[0]])
        assert has_errors(issues)

    def test_non_string(self):
        issues = validate({"settings": {"default_model": 42}}, rules=[DEFAULT_RULES[0]])
        assert has_errors(issues)


class TestLanguageRule:
    def test_supported_no_issue(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "language_supported")
        issues = validate({"settings": {"default_language": "en"}}, rules=[rule])
        assert issues == []

    def test_unsupported_warns(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "language_supported")
        issues = validate({"settings": {"default_language": "xx"}}, rules=[rule])
        assert has_warnings(issues)


class TestTemperatureRule:
    def test_negative(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "temperature_range")
        issues = validate({"settings": {"temperature": -0.1}}, rules=[rule])
        assert has_errors(issues)

    def test_too_high(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "temperature_range")
        issues = validate({"settings": {"temperature": 3.0}}, rules=[rule])
        assert has_errors(issues)

    def test_extreme_boundaries_ok(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "temperature_range")
        # 0.0 and 2.0 should pass (ge/le inclusive).
        assert validate({"settings": {"temperature": 0.0}}, rules=[rule]) == []
        assert validate({"settings": {"temperature": 2.0}}, rules=[rule]) == []


class TestMaxHistoryTurnsRule:
    def test_zero_rejected(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "max_history_turns")
        issues = validate({"settings": {"max_history_turns": 0}}, rules=[rule])
        assert has_errors(issues)

    def test_negative_rejected(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "max_history_turns")
        issues = validate({"settings": {"max_history_turns": -1}}, rules=[rule])
        assert has_errors(issues)

    def test_huge_warns(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "max_history_turns")
        issues = validate({"settings": {"max_history_turns": 200}}, rules=[rule])
        assert has_warnings(issues)
        assert not has_errors(issues)

    def test_bool_rejected(self):
        # bool is a subclass of int — must be rejected explicitly.
        rule = next(r for r in DEFAULT_RULES if r.name == "max_history_turns")
        issues = validate({"settings": {"max_history_turns": True}}, rules=[rule])
        assert has_errors(issues)


class TestRagTopKRule:
    def test_zero_rejected(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "rag_top_k")
        issues = validate({"settings": {"rag_top_k": 0}}, rules=[rule])
        assert has_errors(issues)

    def test_too_large(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "rag_top_k")
        issues = validate({"settings": {"rag_top_k": 65}}, rules=[rule])
        assert has_errors(issues)

    def test_upper_boundary(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "rag_top_k")
        assert validate({"settings": {"rag_top_k": 64}}, rules=[rule]) == []


class TestRagOverlapRule:
    RULEName = "rag_overlap_lt_chunk"

    def test_overlap_ge_size_error(self):
        rule = next(r for r in DEFAULT_RULES if r.name == self.RULEName)
        issues = validate(
            {"settings": {"rag_chunk_overlap": 600, "rag_chunk_size": 600}},
            rules=[rule],
        )
        assert has_errors(issues)

    def test_overlap_greater_than_size_error(self):
        rule = next(r for r in DEFAULT_RULES if r.name == self.RULEName)
        issues = validate(
            {"settings": {"rag_chunk_overlap": 700, "rag_chunk_size": 600}},
            rules=[rule],
        )
        assert has_errors(issues)

    def test_overlap_lt_size_ok(self):
        rule = next(r for r in DEFAULT_RULES if r.name == self.RULEName)
        assert (
            validate(
                {"settings": {"rag_chunk_overlap": 50, "rag_chunk_size": 600}},
                rules=[rule],
            )
            == []
        )

    def test_overlap_zero_ok(self):
        rule = next(r for r in DEFAULT_RULES if r.name == self.RULEName)
        assert (
            validate(
                {"settings": {"rag_chunk_overlap": 0, "rag_chunk_size": 600}},
                rules=[rule],
            )
            == []
        )

    def test_non_int_overlap_rejected(self):
        rule = next(r for r in DEFAULT_RULES if r.name == self.RULEName)
        issues = validate(
            {"settings": {"rag_chunk_overlap": "fifty"}},
            rules=[rule],
        )
        assert has_errors(issues)


class TestChunkTuningConsistency:
    RULEName = "chunk_tuning_consistency"

    def test_multiple_warns_info(self):
        rule = next(r for r in DEFAULT_RULES if r.name == self.RULEName)
        issues = validate(
            {"settings": {"rag_chunk_overlap": 100, "rag_chunk_size": 1000}},
            rules=[rule],
        )
        # This is an INFO — not an error/warning — but worth surfacing.
        assert any(i.severity == SEVERITY_INFO for i in issues)

    def test_non_multiple_no_issue(self):
        rule = next(r for r in DEFAULT_RULES if r.name == self.RULEName)
        # 600 is divisible by 50; pick values that aren't divisible.
        issues = validate(
            {"settings": {"rag_chunk_overlap": 70, "rag_chunk_size": 600}},
            rules=[rule],
        )
        assert issues == []


class TestThemeRule:
    def test_unknown_theme_warns(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "theme_value")
        issues = validate({"settings": {"theme": "lavender"}}, rules=[rule])
        assert has_warnings(issues)

    def test_dark_ok(self):
        rule = next(r for r in DEFAULT_RULES if r.name == "theme_value")
        assert validate({"settings": {"theme": "dark"}}, rules=[rule]) == []


# ─── Environment-variable rules ────────────────────────────────────


class TestEnvRules:
    def test_ollama_host_unset_info(self, monkeypatch):
        monkeypatch.delenv("OLLAMA_HOST", raising=False)
        rule = next(r for r in DEFAULT_RULES if r.name == "ollama_host_env")
        issues = validate({"env": {}}, rules=[rule])
        assert any(i.severity == SEVERITY_INFO for i in issues)

    def test_ollama_host_set_no_issue(self, monkeypatch):
        monkeypatch.setenv("OLLAMA_HOST", "http://ollama:11434")
        rule = next(r for r in DEFAULT_RULES if r.name == "ollama_host_env")
        issues = validate({"env": {}}, rules=[rule])
        assert issues == []

    def test_cors_wildcard_rejected(self, monkeypatch):
        monkeypatch.setenv("CORS_ORIGINS", "*")
        rule = next(r for r in DEFAULT_RULES if r.name == "cors_origins_env")
        issues = validate({}, rules=[rule])
        assert has_errors(issues)

    def test_cors_no_scheme_warns(self, monkeypatch):
        monkeypatch.setenv("CORS_ORIGINS", "example.com, http://ok")
        rule = next(r for r in DEFAULT_RULES if r.name == "cors_origins_env")
        issues = validate({}, rules=[rule])
        assert has_warnings(issues)

    def test_cors_well_formed_ok(self, monkeypatch):
        monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000, https://app.x")
        rule = next(r for r in DEFAULT_RULES if r.name == "cors_origins_env")
        issues = validate({}, rules=[rule])
        assert issues == []


# ─── summarise / has_errors / has_warnings ────────────────────────


class TestSummarise:
    def test_empty_summary_zero(self):
        s = summarise([])
        assert s == {
            "total": 0,
            "errors": 0,
            "warnings": 0,
            "infos": 0,
            "issues": [],
        }

    def test_mixed_counts(self):
        issues = [
            ValidationIssue(SEVERITY_ERROR, "a", "x"),
            ValidationIssue(SEVERITY_WARN, "b", "y"),
            ValidationIssue(SEVERITY_INFO, "c", "z"),
        ]
        s = summarise(issues)
        assert s["total"] == 3
        assert s["errors"] == 1
        assert s["warnings"] == 1
        assert s["infos"] == 1
        assert len(s["issues"]) == 3


class TestAggregateHelpers:
    def test_has_errors_false_when_clean(self):
        assert has_errors([]) is False

    def test_has_errors_true_with_one(self):
        assert has_errors([ValidationIssue(SEVERITY_ERROR, "x", "y")]) is True

    def test_has_warnings_true_with_one(self):
        assert has_warnings([ValidationIssue(SEVERITY_WARN, "x", "y")]) is True

    def test_has_warnings_false_with_only_info(self):
        assert has_warnings([ValidationIssue(SEVERITY_INFO, "x", "y")]) is False


# ─── load_rules_from_module ────────────────────────────────────────


class TestLoadRulesFromModule:
    def test_loads_rules_list(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        # Write a stub module to tmp_path and put it on sys.path.
        stub = tmp_path / "extra_rules_for_test.py"
        stub.write_text(
            "from utils.config_validator import ValidationRule, ValidationIssue, "
            "SEVERITY_INFO\n"
            "def _check(cfg):\n"
            "    return [ValidationIssue(SEVERITY_INFO, 'synthetic', 'hi')]\n"
            "RULES = [ValidationRule('synthetic', _check)]\n",
            encoding="utf-8",
        )
        monkeypatch.syspath_prepend(str(tmp_path))
        rules = load_rules_from_module("extra_rules_for_test")
        assert len(rules) == 1
        assert rules[0].name == "synthetic"
        issues = rules[0].fn({})
        assert issues[0].severity == SEVERITY_INFO

    def test_missing_rules_raises(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        stub = tmp_path / "no_rules_module.py"
        stub.write_text("x = 1\n", encoding="utf-8")
        monkeypatch.syspath_prepend(str(tmp_path))
        # RULES attribute defaults to empty list — load returns [].
        rules = load_rules_from_module("no_rules_module")
        assert rules == []

    def test_wrong_type_rules_raises(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        stub = tmp_path / "bad_rules_module.py"
        stub.write_text("RULES = 'not a list'\n", encoding="utf-8")
        monkeypatch.syspath_prepend(str(tmp_path))
        with pytest.raises(TypeError, match="RULES"):
            load_rules_from_module("bad_rules_module")


# ─── End-to-end: validate a default LocalMind config ──────────────


class TestEndToEnd:
    def test_clean_config_no_errors(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("OLLAMA_HOST", "http://ollama:11434")
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        config = {
            "settings": {
                "default_model": "llama3",
                "default_language": "en",
                "temperature": 0.7,
                "max_history_turns": 10,
                "rag_top_k": 4,
                "rag_chunk_overlap": 70,  # non-divisor → no INFO.
                "rag_chunk_size": 600,
                "theme": "dark",
                "minimal_mode": False,
            },
            "env": {"OLLAMA_HOST": "http://ollama:11434"},
        }
        issues = validate(config)
        results = summarise(issues)
        assert results["errors"] == 0
