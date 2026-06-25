import os
import httpx
import logging
from typing import List
from services.embeddings.base import EmbeddingProvider

logger = logging.getLogger(__name__)

class OllamaEmbeddingProvider(EmbeddingProvider):
    """
    Embedding provider that generates vector embeddings using a local Ollama instance.
    Supports both modern `/api/embed` batch API and legacy `/api/embeddings` single-prompt API.
    """
    def __init__(self, model_name: str = "nomic-embed-text", base_url: str = None):
        if not model_name:
            raise ValueError("Model name must be provided for OllamaEmbeddingProvider")
        self.model_name = model_name
        self.base_url = (base_url or os.getenv("OLLAMA_HOST", "http://localhost:11434")).rstrip("/")
        self.timeout = 60.0

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        # Attempt to call `/api/embed` (Ollama's newer batch API)
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.model_name, "input": texts}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if "embeddings" in data:
                        return data["embeddings"]
        except Exception as e:
            logger.warning(f"Ollama batch API `/api/embed` failed, trying fallback to individual `/api/embeddings`: {e}")

        # Fallback to sequential `/api/embeddings` calls
        embeddings = []
        try:
            with httpx.Client(timeout=self.timeout) as client:
                for text in texts:
                    resp = client.post(
                        f"{self.base_url}/api/embeddings",
                        json={"model": self.model_name, "prompt": text}
                    )
                    resp.raise_for_status()
                    embeddings.append(resp.json()["embedding"])
            return embeddings
        except Exception as e:
            logger.error(f"Ollama embedding generation failed: {e}")
            raise RuntimeError(f"Ollama embedding generation failed: {e}") from e

    def embed_query(self, text: str) -> List[float]:
        # Attempt to call `/api/embed`
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.model_name, "input": [text]}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if "embeddings" in data and len(data["embeddings"]) > 0:
                        return data["embeddings"][0]
        except Exception as e:
            logger.warning(f"Ollama query `/api/embed` call failed, trying fallback to `/api/embeddings`: {e}")

        # Fallback to `/api/embeddings`
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model_name, "prompt": text}
                )
                resp.raise_for_status()
                return resp.json()["embedding"]
        except Exception as e:
            logger.error(f"Ollama query embedding generation failed: {e}")
            raise RuntimeError(f"Ollama query embedding generation failed: {e}") from e
