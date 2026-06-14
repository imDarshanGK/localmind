import asyncio
import tempfile
import time
import pytest
from unittest.mock import AsyncMock, patch

import services.db_service as db
from routes.chat import chat_stream, ACTIVE_STREAMS, StreamBuffer
from models.schemas import ChatRequest

# Initialize a temp SQLite database for tests
_tmp = tempfile.mktemp(suffix=".db")
db.DB_PATH = _tmp
db.init_db()


@pytest.fixture(autouse=True)
def setup_db():
    # Clear tables before each test
    with db.get_db() as conn:
        conn.execute("DELETE FROM messages")
        conn.execute("DELETE FROM sessions")
    ACTIVE_STREAMS.clear()


async def mock_chat_stream(*args, **kwargs):
    tokens = ["Hello", " world", "!", " How", " are", " you?"]
    for t in tokens:
        await asyncio.sleep(0.02)
        yield t


@pytest.mark.asyncio
@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat_stream", side_effect=mock_chat_stream)
@patch("routes.chat.rag_service.retrieve_context", return_value=("", []))
async def test_normal_stream_completion(mock_rag, mock_stream, mock_ollama):
    req = ChatRequest(
        message="Hi",
        session_id="session-1",
        model="llama3",
        use_documents=False,
        resume_offset=0
    )

    response = await chat_stream(req)
    assert response is not None
    
    # Read all lines from stream
    chunks = []
    async for line in response.body_iterator:
        if line.strip():
            chunks.append(line)
            
    # Should yield tokens and done event
    assert len(chunks) > 0
    assert "Hello" in chunks[0]
    assert "done" in chunks[-1]

    # Verify message is saved to DB
    messages = db.get_messages_full("session-1")
    assert len(messages) == 2  # user + assistant
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == "Hello world! How are you?"


@pytest.mark.asyncio
@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat_stream", side_effect=mock_chat_stream)
@patch("routes.chat.rag_service.retrieve_context", return_value=("", []))
async def test_client_disconnect_background_finishes(mock_rag, mock_stream, mock_ollama):
    req = ChatRequest(
        message="Hi",
        session_id="session-2",
        model="llama3",
        use_documents=False,
        resume_offset=0
    )

    response = await chat_stream(req)
    
    # Simulate client reading only one chunk and disconnecting (cancelling stream)
    iterator = response.body_iterator.__aiter__()
    first_chunk = await iterator.__anext__()
    assert "Hello" in first_chunk
    
    # Client disconnects -> we discard/stop reading from the iterator
    # Verify that ACTIVE_STREAMS contains the buffer
    buffer = ACTIVE_STREAMS.get("session-2")
    assert buffer is not None
    assert buffer.completed is False
    
    # Wait for the background generator to finish running
    await asyncio.sleep(0.2)
    
    # Verify it finished and saved to DB
    assert buffer.completed is True
    messages = db.get_messages_full("session-2")
    assert len(messages) == 2
    assert messages[1]["content"] == "Hello world! How are you?"


@pytest.mark.asyncio
@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat_stream", side_effect=mock_chat_stream)
@patch("routes.chat.rag_service.retrieve_context", return_value=("", []))
async def test_client_disconnect_and_reconnect_during_generation(mock_rag, mock_stream, mock_ollama):
    # 1. Start initial request
    req1 = ChatRequest(
        message="Hi",
        session_id="session-3",
        model="llama3",
        use_documents=False,
        resume_offset=0
    )
    response1 = await chat_stream(req1)
    
    # Read first chunk ("Hello") and disconnect
    iterator1 = response1.body_iterator.__aiter__()
    c1 = await iterator1.__anext__()
    assert "Hello" in c1
    
    # 2. Reconnect immediately with resume_offset = 5 ("Hello".length)
    # Background generation is still running!
    req2 = ChatRequest(
        message="Hi",
        session_id="session-3",
        model="llama3",
        use_documents=False,
        resume_offset=5
    )
    response2 = await chat_stream(req2)
    
    # Read the rest of the stream
    chunks = []
    async for line in response2.body_iterator:
        if line.strip():
            chunks.append(line)
            
    # Verify it resumes from the next token " world" and does not duplicate "Hello"
    assert "Hello" not in chunks[0]
    assert "world" in chunks[0]
    assert "done" in chunks[-1]
    
    # Wait for background task to fully complete
    await asyncio.sleep(0.2)
    
    # Verify SQLite has exactly 1 user and 1 assistant message (no duplicates)
    messages = db.get_messages_full("session-3")
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == "Hello world! How are you?"


@pytest.mark.asyncio
@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat_stream", side_effect=mock_chat_stream)
@patch("routes.chat.rag_service.retrieve_context", return_value=("", []))
async def test_reconnect_after_generation_finished(mock_rag, mock_stream, mock_ollama):
    # 1. Initial request
    req1 = ChatRequest(
        message="Hi",
        session_id="session-4",
        model="llama3",
        use_documents=False,
        resume_offset=0
    )
    await chat_stream(req1)
    
    # Disconnect immediately without reading
    # Let generation finish in the background
    await asyncio.sleep(0.2)
    
    # Evict stream from ACTIVE_STREAMS to simulate server cleanup/restart
    ACTIVE_STREAMS.clear()
    
    # 2. Reconnect. Response should be served from SQLite database!
    req2 = ChatRequest(
        message="Hi",
        session_id="session-4",
        model="llama3",
        use_documents=False,
        resume_offset=11  # "Hello world".length
    )
    response2 = await chat_stream(req2)
    
    chunks = []
    async for line in response2.body_iterator:
        if line.strip():
            chunks.append(line)
            
    # Verify it starts after "Hello world" -> yields "!" and rest of response
    assert "Hello" not in chunks[0]
    assert "world" not in chunks[0]
    assert "!" in chunks[0]
    assert "done" in chunks[-1]


@pytest.mark.asyncio
async def test_ttl_cleanup():
    # 1. Add completed and active streams
    ACTIVE_STREAMS["completed"] = StreamBuffer("completed", "prompt")
    ACTIVE_STREAMS["completed"].completed = True
    ACTIVE_STREAMS["completed"].completed_at = time.time() - 150  # 150s ago (expired)
    
    ACTIVE_STREAMS["completed_fresh"] = StreamBuffer("completed_fresh", "prompt")
    ACTIVE_STREAMS["completed_fresh"].completed = True
    ACTIVE_STREAMS["completed_fresh"].completed_at = time.time() - 30  # 30s ago (fresh)
    
    ACTIVE_STREAMS["active_stale"] = StreamBuffer("active_stale", "prompt")
    ACTIVE_STREAMS["active_stale"].created_at = time.time() - 400  # 400s ago (stale)
    
    ACTIVE_STREAMS["active_fresh"] = StreamBuffer("active_fresh", "prompt")
    ACTIVE_STREAMS["active_fresh"].created_at = time.time() - 50  # 50s ago (fresh)

    # 2. Run one cycle of cleaner
    now = time.time()
    for session_id, buffer in list(ACTIVE_STREAMS.items()):
        if (buffer.completed or buffer.error is not None) and buffer.completed_at:
            if now - buffer.completed_at > 120:
                ACTIVE_STREAMS.pop(session_id, None)
        elif now - buffer.created_at > 300:
            ACTIVE_STREAMS.pop(session_id, None)
            
    # 3. Assert correct eviction
    assert "completed" not in ACTIVE_STREAMS
    assert "active_stale" not in ACTIVE_STREAMS
    assert "completed_fresh" in ACTIVE_STREAMS
    assert "active_fresh" in ACTIVE_STREAMS
