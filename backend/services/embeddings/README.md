# Pluggable Embedding Provider System

This system provides a pluggable abstraction layer for generating vector embeddings in LocalMind. It isolates the RAG service (`rag_service.py`) from direct coupling to any specific embedding library or network-based API.

## Structure

- **`base.py`**: Defines the abstract base class `EmbeddingProvider` that concrete providers must inherit from.
- **`sentence_transformers.py`**: A provider using the local `sentence-transformers` library (default).
- **`ollama.py`**: A provider that communicates with a local Ollama service.
- **`factory.py`**: Exposes `get_embedding_provider`, resolves the active provider from settings, and handles model instance caching.

---

## How it Works

### 1. Configuration
The database table `app_settings` holds:
* `embedding_provider`: The string identifier of the active provider (e.g. `"sentence-transformers"`, `"ollama"`).
* `embedding_model`: The model identifier/name to load (e.g. `"all-MiniLM-L6-v2"`, `"nomic-embed-text"`).

### 2. Resolution & Caching
When `get_embedding_provider()` is called:
1. It reads the current provider and model configuration from the settings database.
2. It looks up the provider identifier in the factory registry.
3. It initializes the provider class.
4. It caches the initialized provider instance under the key `(provider_name, model_name)` so weight files and model architectures are only loaded once.

---

## Adding a New Embedding Provider

To add a new embedding provider (e.g., `OpenAIEmbeddingProvider`), follow these steps:

### Step 1: Create the Provider File
Create a new file under `backend/services/embeddings/` (e.g., `openai.py`) and implement the `EmbeddingProvider` interface:

```python
import os
import httpx
from typing import List
from services.embeddings.base import EmbeddingProvider

class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str = "text-embedding-3-small"):
        self.model_name = model_name
        self.api_key = os.getenv("OPENAI_API_KEY")

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        # Call OpenAI embeddings endpoint
        ...
        return list_of_vectors

    def embed_query(self, text: str) -> List[float]:
        # Call OpenAI embeddings endpoint for a single query
        ...
        return vector
```

### Step 2: Register the Provider
Open `backend/services/embeddings/factory.py` and register your new provider class in the `_registry` dictionary:

```python
from services.embeddings.openai import OpenAIEmbeddingProvider

_registry: Dict[str, Type[EmbeddingProvider]] = {
    "sentence-transformers": SentenceTransformersEmbeddingProvider,
    "ollama": OllamaEmbeddingProvider,
    "openai": OpenAIEmbeddingProvider,  # Add your new provider here
}
```

### Step 3: Update Schemas & Seeding (Optional)
If you want to validate or list new providers, update the schemas in `backend/models/schemas.py`.

### Step 4: Configure in UI
You can now select the new provider in the Settings Panel in the UI by typing `"openai"` and your desired model name!
