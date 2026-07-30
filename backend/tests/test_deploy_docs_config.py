"""Regression checks for build and deploy configuration docs."""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def read_repo_file(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_build_deploy_docs_include_config_validation_checklist():
    readme = read_repo_file("README.md")

    assert "#### Build and deploy config validation" in readme
    assert "docker compose config --quiet" in readme
    assert "python -m json.tool vercel.json" in readme
    assert "cd frontend" in readme
    assert "npm run build" in readme
    assert "python warmup.py" in readme
    assert "pytest tests/test_citations.py" in readme
    assert "pytest tests/test_chromadb_benchmark.py" in readme

    for snippet in ["OLLAMA_HOST", "DEFAULT_MODEL", "CORS_ORIGINS", "VITE_API_BASE_URL", "/api"]:
        assert snippet in readme

    for snippet in ["render.yaml", "healthCheckPath", "/health", "frontend/dist"]:
        assert snippet in readme


def test_build_deploy_docs_include_embeddings_cache_guidelines():
    readme = read_repo_file("README.md")
    model_cache_docs = read_repo_file("docs/model-cache.md")

    assert "### Embeddings Cache Deployment" in readme
    assert "all-MiniLM-L6-v2" in readme
    assert "python warmup.py" in readme
    assert "HF_HOME" in readme
    assert "Embeddings Cache: pre-warm sentence-transformers weights cache" in readme

    assert "## Embeddings Cache Warmup & Deployment" in model_cache_docs
    assert "sentence-transformers" in model_cache_docs
    assert "python warmup.py" in model_cache_docs
    assert "HF_HOME" in model_cache_docs


def test_build_deploy_docs_include_citation_merging_guidelines():
    readme = read_repo_file("README.md")
    citation_docs = read_repo_file("docs/citation-merging.md")

    assert "### Citation Merging in RAG Deployment" in readme
    assert "build_sources()" in readme
    assert "backend/services/citation_utils.py" in readme
    assert "docs/citation-merging.md" in readme
    assert "pytest tests/test_citations.py" in readme
    assert "Citation Merging: run backend citation unit tests" in readme

    assert "# Citation Merging & RAG Deployment Guidelines" in citation_docs
    assert "build_sources" in citation_docs
    assert "PREVIEW_MAX_CHARS" in citation_docs
    assert "ChatMessage.sources" in citation_docs
    assert "pytest tests/test_citations.py" in citation_docs


def test_build_deploy_docs_include_benchmark_harness_guidelines():
    readme = read_repo_file("README.md")
    benchmark_docs = read_repo_file("docs/benchmark-harness.md")

    assert "### Vector Retrieval Benchmark Harness" in readme
    assert "backend/tests/test_chromadb_benchmark.py" in readme
    assert "docs/benchmark-harness.md" in readme
    assert "pytest tests/test_chromadb_benchmark.py" in readme
    assert "Benchmark Harness: run ChromaDB retrieval benchmark tests" in readme

    assert "# Vector Retrieval Benchmark Harness & Deployment Guidelines" in benchmark_docs
    assert "TestChromaDBRetrievalLatency" in benchmark_docs
    assert "all-MiniLM-L6-v2" in benchmark_docs
    assert "pytest tests/test_chromadb_benchmark.py" in benchmark_docs
def test_render_config_matches_documented_build_and_health_checks():
    readme = read_repo_file("README.md")
    render_config = read_repo_file("render.yaml")

    assert "healthCheckPath: /health" in render_config
    assert "buildCommand: npm install && npm run build" in render_config
    assert "`render.yaml`" in readme
    assert "healthCheckPath" in readme
    assert "/health" in readme
    assert "npm install" in readme
    assert "npm run build" in readme


def test_vercel_config_matches_documented_build_output():
    readme = read_repo_file("README.md")
    vercel_config = json.loads(read_repo_file("vercel.json"))

    assert vercel_config["buildCommand"] == "cd frontend && npm run build"
    assert vercel_config["outputDirectory"] == "frontend/dist"
    assert "frontend/dist" in readme
    assert "cd frontend" in readme
    assert "npm run build" in readme
