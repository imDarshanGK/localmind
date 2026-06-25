from abc import ABC, abstractmethod
from typing import List

class EmbeddingProvider(ABC):
    """
    Abstract base class defining the minimal interface for a pluggable embedding provider.
    """

    @abstractmethod
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of documents or document chunks.

        Args:
            texts: List of strings to be embedded.

        Returns:
            A list of lists of floats representing the generated embeddings.
        """
        pass

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """
        Generate embedding for a single search query.

        Args:
            text: Query string.

        Returns:
            A list of floats representing the query embedding.
        """
        pass
