import sys
from unittest.mock import MagicMock, patch

# Mock sentence_transformers, chromadb, and langchain packages globally for tests
mock_sentence_transformers_lib = MagicMock()
sys.modules["sentence_transformers"] = mock_sentence_transformers_lib

mock_chromadb = MagicMock()
sys.modules["chromadb"] = mock_chromadb
sys.modules["chromadb.config"] = MagicMock()

mock_langchain = MagicMock()
sys.modules["langchain"] = mock_langchain
sys.modules["langchain.text_splitter"] = mock_langchain.text_splitter

mock_langchain_community = MagicMock()
sys.modules["langchain_community"] = mock_langchain_community
sys.modules["langchain_community.document_loaders"] = mock_langchain_community.document_loaders

# Set up mock return values for TextLoader (or loader class lookup) and TextSplitter
mock_langchain_community.document_loaders.TextLoader = MagicMock()

import pytest
from services.embeddings.base import EmbeddingProvider
from services.embeddings.sentence_transformers import SentenceTransformersEmbeddingProvider
from services.embeddings.ollama import OllamaEmbeddingProvider
from services.embeddings.factory import get_embedding_provider, clear_provider_cache
from services.rag_service import index_document, retrieve_context


def test_provider_interface_compliance():
    """Verify that both embedding provider implementations comply with the interface."""
    assert issubclass(SentenceTransformersEmbeddingProvider, EmbeddingProvider)
    assert issubclass(OllamaEmbeddingProvider, EmbeddingProvider)


def test_sentence_transformers_embedding():
    """Verify that the sentence-transformers provider correctly loads model and generates embeddings."""
    mock_instance = MagicMock()
    mock_sentence_transformers_lib.SentenceTransformer.return_value = mock_instance

    # Mock the return value of encode
    mock_array = MagicMock()
    mock_array.tolist.return_value = [[0.1, 0.2, 0.3]]
    
    mock_1d_array = MagicMock()
    mock_1d_array.tolist.return_value = [0.4, 0.5, 0.6]
    
    mock_array.__getitem__.return_value = mock_1d_array
    mock_instance.encode.return_value = mock_array

    provider = SentenceTransformersEmbeddingProvider(model_name="all-MiniLM-L6-v2")

    # Test document embedding
    docs = ["hello", "world"]
    res = provider.embed_documents(docs)
    assert res == [[0.1, 0.2, 0.3]]
    mock_instance.encode.assert_called_with(docs, show_progress_bar=False)
    mock_sentence_transformers_lib.SentenceTransformer.assert_called_with("all-MiniLM-L6-v2")

    # Test query embedding
    q_res = provider.embed_query("query")
    assert q_res == [0.4, 0.5, 0.6]
    mock_instance.encode.assert_called_with(["query"], show_progress_bar=False)


@patch("httpx.Client")
def test_ollama_embedding_api_embed(mock_client_cls):
    """Verify that the Ollama provider formats requests to `/api/embed` correctly."""
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "embeddings": [[0.1, 0.2], [0.3, 0.4]]
    }
    mock_client.post.return_value = mock_response
    mock_client_cls.return_value.__enter__.return_value = mock_client

    provider = OllamaEmbeddingProvider(model_name="nomic-embed-text")
    res = provider.embed_documents(["doc1", "doc2"])

    assert res == [[0.1, 0.2], [0.3, 0.4]]
    mock_client.post.assert_any_call(
        "http://localhost:11434/api/embed",
        json={"model": "nomic-embed-text", "input": ["doc1", "doc2"]}
    )


@patch("httpx.Client")
def test_ollama_embedding_api_embeddings_fallback(mock_client_cls):
    """Verify that the Ollama provider falls back to `/api/embeddings` if `/api/embed` fails."""
    mock_client = MagicMock()

    # /api/embed returns 500 internal server error
    mock_resp_embed = MagicMock()
    mock_resp_embed.status_code = 500

    # /api/embeddings succeeds and returns the embedding
    mock_resp_embeddings = MagicMock()
    mock_resp_embeddings.status_code = 200
    mock_resp_embeddings.json.return_value = {
        "embedding": [0.9, 0.8]
    }

    mock_client.post.side_effect = [mock_resp_embed, mock_resp_embeddings]
    mock_client_cls.return_value.__enter__.return_value = mock_client

    provider = OllamaEmbeddingProvider(model_name="nomic-embed-text")
    res = provider.embed_query("hello")

    assert res == [0.9, 0.8]
    assert mock_client.post.call_count == 2
    mock_client.post.assert_any_call(
        "http://localhost:11434/api/embeddings",
        json={"model": "nomic-embed-text", "prompt": "hello"}
    )


def test_factory_invalid_provider():
    """Verify that the factory raises an exception for unsupported providers."""
    with pytest.raises(ValueError) as exc:
        get_embedding_provider(provider_name="unknown-provider", model_name="test")
    assert "Unsupported embedding provider" in str(exc.value)


@patch("services.embeddings.factory.get_settings")
def test_factory_resolution_and_caching(mock_get_settings):
    """Verify factory resolutions, caching, and model parameter updates."""
    clear_provider_cache()

    mock_get_settings.return_value = {
        "embedding_provider": "sentence-transformers",
        "embedding_model": "all-MiniLM-L6-v2"
    }

    # Retrieve provider (should resolve from settings mock)
    provider1 = get_embedding_provider()
    assert isinstance(provider1, SentenceTransformersEmbeddingProvider)
    assert provider1.model_name == "all-MiniLM-L6-v2"

    # Retrieve again (should be the cached instance)
    provider2 = get_embedding_provider()
    assert provider1 is provider2

    # Change params explicitly (should return a new provider instance)
    provider3 = get_embedding_provider(provider_name="sentence-transformers", model_name="other-model")
    assert provider3 is not provider1
    assert provider3.model_name == "other-model"


@patch("services.embeddings.factory.get_settings")
def test_rag_service_backward_compatibility(mock_get_settings):
    """Verify default backward-compatible resolution in case settings database is absent."""
    clear_provider_cache()
    mock_get_settings.side_effect = Exception("DB mock error simulating uninitialized state")

    provider = get_embedding_provider()
    assert isinstance(provider, SentenceTransformersEmbeddingProvider)
    assert provider.model_name == "all-MiniLM-L6-v2"


@patch("services.rag_service.chroma_client")
@patch("services.rag_service.get_embedding_provider")
def test_rag_service_indexing_and_retrieval(mock_get_provider, mock_chroma_client):
    """Verify that RAG service integrates correctly with the pluggable embedding provider."""
    # 1. Setup Mock Provider
    mock_provider = MagicMock()
    mock_provider.embed_documents.return_value = [[0.1, 0.2], [0.3, 0.4]]
    mock_provider.embed_query.return_value = [0.1, 0.2]
    mock_get_provider.return_value = mock_provider

    # 2. Setup Mock ChromaDB Collection
    mock_collection = MagicMock()
    mock_chroma_client.get_or_create_collection.return_value = mock_collection

    # 3. Setup mock text splitting return value
    mock_doc1 = MagicMock()
    mock_doc1.page_content = "Hello world."
    mock_doc2 = MagicMock()
    mock_doc2.page_content = "This is a test document."
    
    mock_langchain.text_splitter.RecursiveCharacterTextSplitter.return_value.split_documents.return_value = [mock_doc1, mock_doc2]

    # Create temporary text file to index
    import tempfile
    import os
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as temp_file:
        temp_file.write("Hello world.\nThis is a test document.")
        temp_file_path = temp_file.name

    try:
        # Test document indexing pipeline
        chunks_count = index_document(temp_file_path, "session-123")
        
        # Verify the loader split the document and provider embedded them
        mock_provider.embed_documents.assert_called_once_with(
            ["Hello world.", "This is a test document."]
        )
        mock_collection.upsert.assert_called_once()
        assert chunks_count == 2

        # Test context retrieval pipeline
        mock_collection.count.return_value = 2
        mock_collection.query.return_value = {
            "documents": [["Hello world.", "This is a test document."]],
            "metadatas": [[{"source": "temp_file.txt"}, {"source": "temp_file.txt"}]]
        }

        context, sources = retrieve_context("search query", "session-123", top_k=2)

        # Verify query embedding generation
        mock_provider.embed_query.assert_called_once_with("search query")
        mock_collection.query.assert_called_once_with(
            query_embeddings=[[0.1, 0.2]],
            n_results=2,
            include=["documents", "metadatas"]
        )
        
        assert "Hello world." in context
        assert "This is a test document." in context
        assert any(s["source"] == "temp_file.txt" for s in sources)

    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
