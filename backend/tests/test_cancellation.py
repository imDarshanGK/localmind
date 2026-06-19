import asyncio
import pytest
from unittest.mock import AsyncMock, patch

import tempfile

import services.db_service as db
from routes.chat import chat_stream, cancel_stream, ACTIVE_STREAMS
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

async def mock_chat_stream_slow(*args, **kwargs):
    tokens = ["Hello", " world", "!", " How", " are", " you?"]
    for t in tokens:
        await asyncio.sleep(0.1)
        yield t

@pytest.mark.asyncio
@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat_stream", side_effect=mock_chat_stream_slow)
@patch("routes.chat.rag_service.retrieve_context", return_value=("", []))
async def test_stream_cancellation(mock_rag, mock_stream, mock_ollama):
    session_id = "test-cancel-session"
    req = ChatRequest(
        message="Hi",
        session_id=session_id,
        model="llama3",
        use_documents=False,
        resume_offset=0
    )

    response = await chat_stream(req)
    
    iterator = response.body_iterator.__aiter__()
    first_chunk = await iterator.__anext__()
    assert "Hello" in first_chunk

    # Verify stream is active
    buffer = ACTIVE_STREAMS.get(session_id)
    assert buffer is not None
    assert not buffer.cancelled

    # Cancel the stream
    cancel_response = await cancel_stream(session_id)
    assert cancel_response == {"status": "cancelled"}
    assert buffer.cancelled is True

    # Wait for the background generator to process the cancellation
    await asyncio.sleep(0.3)

    # Verify the generator stopped and completed the buffer
    assert buffer.completed is True
    
    # Check that [Generation Stopped] was appended
    assert "[Generation Stopped]" in buffer.buffer
    
    # Check database to ensure preservation of streamed content
    messages = db.get_messages_full(session_id)
    assert len(messages) == 2
    assert messages[1]["role"] == "assistant"
    assert "Hello" in messages[1]["content"]
    assert "[Generation Stopped]" in messages[1]["content"]
    
    # Assert further tokens were prevented
    # If the stream wasn't cancelled, it would take 0.6 seconds to finish.
    # Because we cancelled after 1 token, the rest shouldn't be there.
    assert "you?" not in messages[1]["content"]
