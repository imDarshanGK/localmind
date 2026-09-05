"""Tests for rag_service empty-document handling."""

import os
import tempfile

from langchain_core.documents import Document


class MockLoader:
    """Loader that returns an empty list of documents."""
    def __init__(self, file_path):
        self.file_path = file_path
    def load(self):
        return []


class MockLoaderWithNone:
    """Loader that returns None."""
    def __init__(self, file_path):
        self.file_path = file_path
    def load(self):
        return None


class MockLoaderWithEmptyDoc:
    """Loader that returns a list with one empty Document."""
    def __init__(self, file_path):
        self.file_path = file_path
    def load(self):
        return [Document(page_content="")]


def test_index_document_empty_docs_returns_0(monkeypatch, tmp_path):
    """index_document returns 0 without calling ChromaDB when loader returns no docs."""
    # Create a dummy file so the path resolves
    dummy_file = tmp_path / "empty.txt"
    dummy_file.write_text("")

    calls = []

    class MockCollection:
        def upsert(self, **kwargs):
            calls.append(kwargs)

    class MockChromaClient:
        def get_or_create_collection(self, **kwargs):
            return MockCollection()

    import rag_service
    monkeypatch.setattr(rag_service, "chroma_client", MockChromaClient())
    monkeypatch.setattr(rag_service.LOADERS, ".txt", MockLoader)

    result = rag_service.index_document(str(dummy_file), session_id="test-session")

    assert result == 0
    assert len(calls) == 0, "ChromaDB upsert should not be called for empty docs"


def test_index_document_none_docs_returns_0(monkeypatch, tmp_path):
    """index_document returns 0 when loader returns None."""
    dummy_file = tmp_path / "empty.txt"
    dummy_file.write_text("")

    calls = []

    class MockCollection:
        def upsert(self, **kwargs):
            calls.append(kwargs)

    class MockChromaClient:
        def get_or_create_collection(self, **kwargs):
            return MockCollection()

    import rag_service
    monkeypatch.setattr(rag_service, "chroma_client", MockChromaClient())
    monkeypatch.setattr(rag_service.LOADERS, ".txt", MockLoaderWithNone)

    result = rag_service.index_document(str(dummy_file), session_id="test-session")

    assert result == 0
    assert len(calls) == 0
