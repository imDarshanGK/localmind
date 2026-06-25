import logging
from typing import Dict, Type
from services.embeddings.base import EmbeddingProvider
from services.embeddings.sentence_transformers import SentenceTransformersEmbeddingProvider
from services.embeddings.ollama import OllamaEmbeddingProvider
from services.db_service import get_settings

logger = logging.getLogger(__name__)

# Registry mapping configuration keys to provider classes
_registry: Dict[str, Type[EmbeddingProvider]] = {
    "sentence-transformers": SentenceTransformersEmbeddingProvider,
    "ollama": OllamaEmbeddingProvider,
}

# Caching instances of instantiated providers to prevent reloading weight files / endpoints
_provider_cache: Dict[tuple, EmbeddingProvider] = {}

def get_embedding_provider(provider_name: str = None, model_name: str = None) -> EmbeddingProvider:
    """
    Resolve and instantiate the embedding provider.
    If provider_name or model_name are omitted, values are read from database app settings.

    Args:
        provider_name: The name of the provider (e.g. 'sentence-transformers', 'ollama').
        model_name: The specific model key to pass to the provider.

    Returns:
        An instance conforming to the EmbeddingProvider interface.
    """
    if provider_name is None or model_name is None:
        try:
            settings = get_settings()
            if provider_name is None:
                provider_name = settings.get("embedding_provider", "sentence-transformers")
            if model_name is None:
                model_name = settings.get("embedding_model", "all-MiniLM-L6-v2")
        except Exception as e:
            # Fallback configuration in case database is uninitialized or in tests
            logger.debug(f"Could not load embedding settings from DB, using defaults: {e}")
            if provider_name is None:
                provider_name = "sentence-transformers"
            if model_name is None:
                model_name = "all-MiniLM-L6-v2"

    cache_key = (provider_name, model_name)
    if cache_key not in _provider_cache:
        provider_class = _registry.get(provider_name)
        if not provider_class:
            raise ValueError(
                f"Unsupported embedding provider: '{provider_name}'. "
                f"Supported: {list(_registry.keys())}"
            )
        _provider_cache[cache_key] = provider_class(model_name=model_name)
        logger.info(f"Initialized and cached embedding provider '{provider_name}' with model '{model_name}'")

    return _provider_cache[cache_key]

def clear_provider_cache():
    """Clear the cached embedding providers."""
    _provider_cache.clear()
