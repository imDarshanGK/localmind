import asyncio
import pytest
import time
from unittest.mock import patch, MagicMock
import unittest.mock
from utils.cache import TTLCache
from services.ollama_service import get_model_info, model_metadata_cache
from routes.models import switch_model # <-- Import the function directly!

def test_ttl_cache_hit_and_miss():
    cache = TTLCache(ttl_seconds=2)
    
    # Test miss
    assert cache.get("llama3") is None
    
    # Test set and hit
    cache.set("llama3", {"details": "meta"})
    assert cache.get("llama3") == {"details": "meta"}

def test_ttl_cache_expiration():
    cache = TTLCache(ttl_seconds=1)
    
    cache.set("gemma2", {"details": "google"})
    assert cache.get("gemma2") == {"details": "google"}
    
    # Wait for expiration
    time.sleep(1.1)
    
    # Test expired miss
    assert cache.get("gemma2") is None

@pytest.mark.asyncio
async def test_get_model_info_uses_cache():
    model_metadata_cache.clear()
    
    with patch("httpx.AsyncClient.post") as mock_post:
        # Setup mock response
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={"details": {"family": "llama", "parameter_size": "8B"}})
        mock_post.return_value = mock_response

        # First call should hit the API (Cache Miss)
        info1 = await get_model_info("test-model")
        assert info1 == {"details": {"family": "llama", "parameter_size": "8B"}}
        assert mock_post.call_count == 1
        
        # Second call should use cache (Cache Hit)
        info2 = await get_model_info("test-model")
        assert info2 == {"details": {"family": "llama", "parameter_size": "8B"}}
        assert mock_post.call_count == 1

@pytest.mark.asyncio
async def test_get_model_info_fallback():
    model_metadata_cache.clear()
    
    with patch("httpx.AsyncClient.post") as mock_post:
        # Setup mock 404 response
        mock_response = MagicMock()
        mock_response.status_code = 404

        # Mock httpx.HTTPStatusError
        import httpx
        error = httpx.HTTPStatusError("Not Found", request=MagicMock(), response=mock_response)
        
        # Define raise_for_status to actually raise the error
        mock_response.raise_for_status = MagicMock(side_effect=error)
        mock_response.json = MagicMock()
        mock_post.return_value = mock_response

        # Call should handle 404 and return empty dict
        info = await get_model_info("non-existent")
        assert info == {}

@pytest.mark.asyncio
async def test_switch_model_timeout():
    """Assert that the switch_model function raises an HTTPException upon encountering a timeout."""
    # Force the asyncio runtime wrapper to simulate an immediate timeout hang condition
    with patch("asyncio.timeout", side_effect=asyncio.TimeoutError):
        # Mock the dependency to simulate a running Ollama service instance
        with patch("services.ollama_service.is_ollama_running", return_value=True):
            # Since we invoke the endpoint function directly, catch the raised exception
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc_info:
                await switch_model("llama3")
            
            # Verify it maps perfectly to the expected 504 Gateway Timeout error code
            assert exc_info.value.status_code == 504
            assert "timed out" in exc_info.value.detail.lower()
            