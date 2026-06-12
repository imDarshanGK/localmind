import logging
from typing import List
from services.embeddings.base import EmbeddingProvider

logger = logging.getLogger(__name__)

class SentenceTransformersEmbeddingProvider(EmbeddingProvider):
    """
    Embedding provider that uses a local SentenceTransformer model.
    Loads the model lazily on first embedding request to speed up startup.
    """
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        if not model_name:
            raise ValueError("Model name must be provided for SentenceTransformersEmbeddingProvider")
        self.model_name = model_name
        self._model = None

    @property
    def model(self):
        if self._model is None:
            try:
                # Lazy import to avoid loading heavy dependencies unless selected
                from sentence_transformers import SentenceTransformer
                logger.info(f"Loading sentence-transformers model: {self.model_name}")
                self._model = SentenceTransformer(self.model_name)
            except Exception as e:
                logger.error(f"Failed to load sentence-transformers model '{self.model_name}': {e}")
                raise ValueError(f"Failed to load sentence-transformers model '{self.model_name}': {e}") from e
        return self._model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            embeddings = self.model.encode(texts, show_progress_bar=False)
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Error encoding documents using sentence-transformers: {e}")
            raise RuntimeError(f"Error encoding documents using sentence-transformers: {e}") from e

    def embed_query(self, text: str) -> List[float]:
        try:
            embedding = self.model.encode([text], show_progress_bar=False)[0]
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error encoding query using sentence-transformers: {e}")
            raise RuntimeError(f"Error encoding query using sentence-transformers: {e}") from e
