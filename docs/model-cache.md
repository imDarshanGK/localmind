# Model Metadata Cache

To avoid repeatedly hitting the local Ollama API for model metadata (which is relatively static), LocalMind implements a lightweight, in-memory **Time-To-Live (TTL) Cache**.

## How it Works

The cache intercepts requests for detailed model metadata. When a request for a specific model is made:
1. **Cache Hit**: If the model's metadata was fetched recently, it is returned instantly from memory.
2. **Cache Miss**: If the metadata is not in memory (or has expired), the backend fetches it from Ollama's `/api/show` endpoint, stores it in the cache, and returns it.

## Configuration

The cache is defined in `backend/utils/cache.py` using the `TTLCache` class.
The global instance `model_metadata_cache` is initialized in `backend/services/ollama_service.py` with a **5-minute (300 seconds) TTL**.

```python
# backend/services/ollama_service.py
from utils.cache import TTLCache

model_metadata_cache = TTLCache(ttl_seconds=300)
```

## API Endpoint

The cached model information is accessible via a dedicated backend endpoint:

**`GET /api/models/{model_name}/info`**

This endpoint returns the detailed metadata for a specific model (e.g., parameter size, context length, system prompts), significantly reducing backend overhead and latency when switching or querying models.

## Verification & Debugging

The cache operations are logged at the `DEBUG` level. You can verify the cache behavior by running the backend with debug logging enabled and observing the console output:

- `CACHE MISS: {model_name}`: Indicates the data was fetched from Ollama.
- `CACHE SET: {model_name} (TTL: 300s)`: Indicates the data was saved to memory.
- `CACHE HIT: {model_name}`: Indicates the data was served directly from memory without hitting Ollama.
- `CACHE EXPIRED: {model_name}`: Indicates the TTL expired and the entry was evicted.

Unit tests covering cache hits, misses, expiration, and API fallbacks are located in `backend/tests/test_model_cache.py`.
