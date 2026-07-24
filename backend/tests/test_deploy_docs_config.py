"""Regression checks for build and deploy configuration docs."""

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def read_repo_file(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_build_deploy_docs_include_config_validation_checklist():
    readme = read_repo_file("README.md")

    required_snippets = [
        "#### Build and deploy config validation",
        "docker compose config --quiet",
        "python -m json.tool vercel.json",
        "npm run build",
        "OLLAMA_HOST",
        "DEFAULT_MODEL",
        "CORS_ORIGINS",
        "VITE_API_BASE_URL",
        "include `/api`",
    ]

    for snippet in required_snippets:
        assert snippet in readme

    for snippet in ["render.yaml", "healthCheckPath", "/health", "frontend/dist", "cd frontend && npm run build"]:
        assert snippet in readme


def test_render_config_matches_documented_build_and_health_checks():
    readme = read_repo_file("README.md")
    render_config = read_repo_file("render.yaml")

    assert "healthCheckPath: /health" in render_config
    assert "buildCommand: npm install && npm run build" in render_config
    assert "`render.yaml`" in readme
    assert "healthCheckPath" in readme
    assert "/health" in readme
    assert "npm install && npm run build" in readme


def test_vercel_config_matches_documented_build_output():
    readme = read_repo_file("README.md")
    vercel_config = json.loads(read_repo_file("vercel.json"))

    assert vercel_config["buildCommand"] == "cd frontend && npm run build"
    assert vercel_config["outputDirectory"] == "frontend/dist"
    assert "frontend/dist" in readme
    assert "cd frontend && npm run build" in readme
