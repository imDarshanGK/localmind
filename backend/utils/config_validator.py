"""Config validation — zero-dependency rules-engine for app settings.

The existing ``AppSettings`` Pydantic model validates *individual* field
types but does not enforce cross-field or system-cap constraints
(e.g. ``rag_chunk_overlap < rag_chunk_size``, ``max_history_turns ≥ 1``,
``OLLAMA_HOST reachable``, ``rag_top_k within [1, 64]``).

This module supplies:
- ``ValidationRule`` — a named callable applied to a config dict,
  returns ``[ValidationIssue(severity, message)]`` (empty if fine).
- ``ValidationIssue`` — (severity, location, message) — Severity in
  {ERROR, WARN, INFO}; locations are dotted paths like
  ``settings.rag_chunk_overlap``.
- ``validate(config, rules=None)`` — apply a ruleset to a config dict
  and return a list of issues (empty list == no problems).
- ``load_rules_from_module(spec)`` — pull rules from any Python
  module that exposes ``RULES`` (uniform extension surface).
- Default ruleset ``DEFAULT_RULES`` — covers the LocalMind
  AppSettings surface plus environment-variable sanity.

Designed to be invoked at backend startup (``app.py`` lifespan), in
unit tests, and via the CLI tool.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any, Callable, Iterable

SEVERITY_ERROR = "ERROR"
SEVERITY_WARN = "WARN"
SEVERITY_INFO = "INFO"
_SEVERITIES = (SEVERITY_ERROR, SEVERITY_WARN, SEVERITY_INFO)


@dataclass(frozen=True)
class ValidationIssue:
    """A single issue surfaced by a ValidationRule."""

    severity: str
    location: str
    message: str

    def __post_init__(self):
        if self.severity not in _SEVERITIES:
            raise ValueError(f"severity must be one of {_SEVERITIES}")

    def to_dict(self) -> dict:
        return {
            "severity": self.severity,
            "location": self.location,
            "message": self.message,
        }


@dataclass
class ValidationRule:
    """A named check applied to a config dict.

    ``fn(config) -> [ValidationIssue]`` — return an empty list to
    signal success. Never raises; ``validate()`` wraps calls in a
    try/except so a buggy rule does not poison the report.
    """

    name: str
    fn: Callable[[dict], list[ValidationIssue]]


# ---------------------------------------------------------------------------
# Helpers used by the default ruleset; exposed for tests + custom rules.
# ---------------------------------------------------------------------------


def _get(config: dict, dotted: str, default: Any = None) -> Any:
    """Look up a nested key by dotted path."""
    cur: Any = config
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return default
    return cur


def _is_int_in_range(value: Any, low: int, high: int) -> bool:
    if isinstance(value, bool) or not isinstance(value, int):
        return False
    return low <= value <= high


def _is_float_in_range(value: Any, low: float, high: float) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return low <= float(value) <= high


def _is_str_in(value: Any, options: Iterable[str]) -> bool:
    return isinstance(value, str) and value in set(options)


# ---------------------------------------------------------------------------
# Default ruleset — covers LocalMind AppSettings + RAG/timing constraints.
# ---------------------------------------------------------------------------


def _check_model_name(config: dict) -> list[ValidationIssue]:
    """Default model should be a non-empty string."""
    model = _get(config, "settings.default_model")
    if not isinstance(model, str) or not model.strip():
        return [
            ValidationIssue(
                SEVERITY_ERROR,
                "settings.default_model",
                f"default_model must be a non-empty string (got {model!r})",
            )
        ]
    return []


def _check_language_supported(config: dict) -> list[ValidationIssue]:
    """Default language must be one of the supported set."""
    supported = ("en", "ja", "es", "fr", "de")
    lang = _get(config, "settings.default_language")
    if not _is_str_in(lang, supported):
        return [
            ValidationIssue(
                SEVERITY_WARN,
                "settings.default_language",
                f"default_language {lang!r} not in supported set {supported}; "
                "the UI may fall back to 'en'.",
            )
        ]
    return []


def _check_temperature_range(config: dict) -> list[ValidationIssue]:
    temp = _get(config, "settings.temperature")
    if not _is_float_in_range(temp, 0.0, 2.0):
        return [
            ValidationIssue(
                SEVERITY_ERROR,
                "settings.temperature",
                f"temperature must be a float in [0.0, 2.0] (got {temp!r})",
            )
        ]
    return []


def _check_max_history_turns(config: dict) -> list[ValidationIssue]:
    n = _get(config, "settings.max_history_turns")
    issues = []
    if not isinstance(n, int) or isinstance(n, bool):
        issues.append(
            ValidationIssue(
                SEVERITY_ERROR,
                "settings.max_history_turns",
                f"max_history_turns must be an int (got {type(n).__name__})",
            )
        )
        return issues
    if n < 1:
        issues.append(
            ValidationIssue(
                SEVERITY_ERROR,
                "settings.max_history_turns",
                f"max_history_turns must be ≥ 1 (got {n})",
            )
        )
    elif n > 100:
        issues.append(
            ValidationIssue(
                SEVERITY_WARN,
                "settings.max_history_turns",
                f"max_history_turns={n} causes large O(N) memory + token "
                "footprint per inference; consider ≤ 20",
            )
        )
    return issues


def _check_rag_top_k(config: dict) -> list[ValidationIssue]:
    k = _get(config, "settings.rag_top_k")
    if not _is_int_in_range(k, 1, 64):
        return [
            ValidationIssue(
                SEVERITY_ERROR,
                "settings.rag_top_k",
                f"rag_top_k must be an int in [1, 64] (got {k!r})",
            )
        ]
    return []


def _check_rag_overlap_lt_chunk_size(config: dict) -> list[ValidationIssue]:
    """Overlap must be strictly less than the chunk size, else the
    next chunk contains nothing new — wasteful & confusing."""
    overlap = _get(config, "settings.rag_chunk_overlap")
    size = _get(config, "settings.rag_chunk_size")
    issues = []
    if not _is_int_in_range(overlap, 0, 10000):
        issues.append(
            ValidationIssue(
                SEVERITY_ERROR,
                "settings.rag_chunk_overlap",
                f"rag_chunk_overlap must be an int in [0, 10000] (got {overlap!r})",
            )
        )
        return issues
    if size is not None and _is_int_in_range(size, 100, 10000):
        if overlap >= size:
            issues.append(
                ValidationIssue(
                    SEVERITY_ERROR,
                    "settings.rag_chunk_overlap",
                    f"rag_chunk_overlap ({overlap}) must be strictly less than "
                    f"rag_chunk_size ({size}) — otherwise chunks are "
                    "identical to their predecessor.",
                )
            )
    return issues


def _check_theme_value(config: dict) -> list[ValidationIssue]:
    theme = _get(config, "settings.theme")
    if not _is_str_in(theme, ("light", "dark", "system", "auto")):
        return [
            ValidationIssue(
                SEVERITY_WARN,
                "settings.theme",
                f"theme {theme!r} not in (light, dark, system, auto); "
                "UI may default incorrectly.",
            )
        ]
    return []


def _check_ollama_host_env(config: dict) -> list[ValidationIssue]:
    """If OLLAMA_HOST is unset we fall back to localhost — warn."""
    env_host = os.environ.get("OLLAMA_HOST")
    cfg_host = _get(config, "env.OLLAMA_HOST", env_host)
    if not cfg_host:
        return [
            ValidationIssue(
                SEVERITY_INFO,
                "env.OLLAMA_HOST",
                "OLLAMA_HOST unset; backend will fall back to "
                "http://localhost:11434. Set this in production.",
            )
        ]
    return []


def _check_cors_origins_env(config: dict) -> list[ValidationIssue]:
    origins = os.environ.get("CORS_ORIGINS") or _get(config, "env.CORS_ORIGINS")
    if origins is None:
        return []
    if isinstance(origins, str):
        parts = [o.strip() for o in origins.split(",") if o.strip()]
        if "*" in parts:
            return [
                ValidationIssue(
                    SEVERITY_ERROR,
                    "env.CORS_ORIGINS",
                    "Wildcard '*' in CORS_ORIGINS is unsafe outside dev.",
                )
            ]
        bad = [o for o in parts if not re.match(r"^[a-z]+://", o, re.IGNORECASE)]
        if bad:
            return [
                ValidationIssue(
                    SEVERITY_WARN,
                    "env.CORS_ORIGINS",
                    f"some origins are not absolute URIs (missing scheme): {bad}.",
                )
            ]
    return []


def _check_chunk_tuning_consistency(config: dict) -> list[ValidationIssue]:
    """A chunk-size that's a multiple of overlap is suspicious — it
    means no new content slips through the window and the retreival
    will return near-identical chunks for adjacent queries."""
    size = _get(config, "settings.rag_chunk_size")
    overlap = _get(config, "settings.rag_chunk_overlap")
    if (
        _is_int_in_range(overlap, 1, 10000)
        and _is_int_in_range(size, 100, 10000)
        and size > overlap
        and size % overlap == 0
    ):
        return [
            ValidationIssue(
                SEVERITY_INFO,
                "settings.rag_chunk_overlap",
                f"rag_chunk_size ({size}) is a multiple of rag_chunk_overlap "
                f"({overlap}). The retrieval window bleeds no new content; "
                "consider an overlap of size*0.2 for diversity.",
            )
        ]
    return []


DEFAULT_RULES: tuple[ValidationRule, ...] = (
    ValidationRule("model_name", _check_model_name),
    ValidationRule("language_supported", _check_language_supported),
    ValidationRule("temperature_range", _check_temperature_range),
    ValidationRule("max_history_turns", _check_max_history_turns),
    ValidationRule("rag_top_k", _check_rag_top_k),
    ValidationRule("rag_overlap_lt_chunk", _check_rag_overlap_lt_chunk_size),
    ValidationRule("theme_value", _check_theme_value),
    ValidationRule("ollama_host_env", _check_ollama_host_env),
    ValidationRule("cors_origins_env", _check_cors_origins_env),
    ValidationRule("chunk_tuning_consistency", _check_chunk_tuning_consistency),
)


def validate(
    config: dict,
    rules: Iterable[ValidationRule] | None = None,
) -> list[ValidationIssue]:
    """Run ``rules`` against ``config``; return a list of issues (empty = ok).

    Rules are wrapped in try/except — a buggy rule surfaces as a single
    ERROR issue with its exception string, not by crashing the run.
    """
    rules_to_run = list(rules) if rules is not None else list(DEFAULT_RULES)
    issues: list[ValidationIssue] = []
    for rule in rules_to_run:
        try:
            rule_issues = rule.fn(config)
        except Exception as exc:  # noqa: BLE001
            issues.append(
                ValidationIssue(
                    SEVERITY_ERROR,
                    f"__rule__.{rule.name}",
                    f"rule raised {type(exc).__name__}: {exc}",
                )
            )
            continue
        if rule_issues:
            issues.extend(rule_issues)
    return issues


def has_errors(issues: list[ValidationIssue]) -> bool:
    return any(i.severity == SEVERITY_ERROR for i in issues)


def has_warnings(issues: list[ValidationIssue]) -> bool:
    return any(i.severity == SEVERITY_WARN for i in issues)


def summarise(issues: list[ValidationIssue]) -> dict:
    return {
        "total": len(issues),
        "errors": sum(1 for i in issues if i.severity == SEVERITY_ERROR),
        "warnings": sum(1 for i in issues if i.severity == SEVERITY_WARN),
        "infos": sum(1 for i in issues if i.severity == SEVERITY_INFO),
        "issues": [i.to_dict() for i in issues],
    }


def load_rules_from_module(spec: str) -> list[ValidationRule]:
    """Import a Python module and pull its ``RULES`` list.

    Lets users extend the default ruleset without monkey-patching.
    ``spec`` is a dotted module path resolvable on sys.path.
    """
    import importlib

    mod = importlib.import_module(spec)
    rules = getattr(mod, "RULES", [])
    if not isinstance(rules, (list, tuple)):
        raise TypeError(
            f"{spec}.RULES must be a list/tuple of ValidationRule (got {type(rules).__name__})"
        )
    return list(rules)
