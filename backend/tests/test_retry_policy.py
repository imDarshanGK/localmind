import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock

from services.ollama_service import chat, chat_stream

@pytest.mark.asyncio
async def test_chat_retry_success():
    """Test that chat() successfully recovers if the first 2 requests fail but the 3rd succeeds."""
    mock_responses = [
        httpx.ConnectError("Connection refused"),
        httpx.TimeoutException("Timeout"),
        httpx.Response(200, json={"message": {"content": "Final success!"}}, request=httpx.Request("POST", "url"))
    ]

    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        # Side effect will yield the mock_responses in order
        mock_post.side_effect = mock_responses

        # Override asyncio.sleep to not actually wait during tests
        with patch('asyncio.sleep', new_callable=AsyncMock) as mock_sleep:
            result = await chat("Hello")
            
            assert result == "Final success!"
            assert mock_post.call_count == 3
            assert mock_sleep.call_count == 2


@pytest.mark.asyncio
async def test_chat_retry_exhaustion():
    """Test that chat() fails after exhausting max_attempts."""
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        # Always fail with 503
        mock_post.side_effect = httpx.HTTPStatusError("503 Server Error", request=httpx.Request("POST", "url"), response=httpx.Response(503))

        with patch('asyncio.sleep', new_callable=AsyncMock):
            with pytest.raises(httpx.HTTPStatusError):
                await chat("Hello")
            
            assert mock_post.call_count == 3


@pytest.mark.asyncio
async def test_chat_non_transient_error():
    """Test that chat() does NOT retry on non-transient errors like 400 Bad Request."""
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        # Fail with 400
        mock_post.side_effect = httpx.HTTPStatusError("400 Bad Request", request=httpx.Request("POST", "url"), response=httpx.Response(400))

        with patch('asyncio.sleep', new_callable=AsyncMock):
            with pytest.raises(httpx.HTTPStatusError):
                await chat("Hello")
            
            # Should only attempt once!
            assert mock_post.call_count == 1


@pytest.mark.asyncio
async def test_chat_stream_retry_success():
    """Test that chat_stream() recovers if the initial connection fails."""
    
    # We will patch the client.stream context manager
    # Because testing httpx stream context managers is notoriously tricky, 
    # we patch httpx.AsyncClient directly.
    class MockStreamContext:
        def __init__(self, should_fail=False):
            self.should_fail = should_fail
        
        async def __aenter__(self):
            if self.should_fail:
                raise httpx.ConnectError("Connection refused")
            # Return a mock response object
            mock_resp = AsyncMock()
            
            async def mock_aiter_lines():
                yield '{"message": {"content": "token "}}'
                yield '{"message": {"content": "done!"}, "done": true}'
                
            mock_resp.aiter_lines = mock_aiter_lines
            mock_resp.raise_for_status = MagicMock()
            return mock_resp
            
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    # A mock client that fails the first time, succeeds the second time
    call_count = 0
    def mock_stream(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MockStreamContext(should_fail=True)
        return MockStreamContext(should_fail=False)

    with patch('httpx.AsyncClient.stream', side_effect=mock_stream):
        with patch('asyncio.sleep', new_callable=AsyncMock) as mock_sleep:
            generator = chat_stream("Hello")
            
            tokens = []
            async for token in generator:
                tokens.append(token)
                
            assert tokens == ["token ", "done!"]
            assert call_count == 2
            assert mock_sleep.call_count == 1
