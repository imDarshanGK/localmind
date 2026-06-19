import asyncio
import tempfile
from unittest.mock import AsyncMock, patch

import services.db_service as db
from routes.chat import chat_stream, cancel_stream
from models.schemas import ChatRequest

db.DB_PATH = tempfile.mktemp(suffix=".db")
db.init_db()

async def mock_ollama_generator(*args, **kwargs):
    words = ["I", " am", " generating", " a", " really", " long", " sentence", " but", " you", " stopped", " me!"]
    for w in words:
        await asyncio.sleep(0.3)
        yield w

@patch("routes.chat.ollama_service.is_ollama_running", new_callable=AsyncMock, return_value=True)
@patch("routes.chat.ollama_service.chat_stream", side_effect=mock_ollama_generator)
@patch("routes.chat.rag_service.retrieve_context", return_value=("", []))
async def main(*args):
    print("--- STARTING STREAMING REQUEST ---")
    session_id = "demo-session-99"
    req = ChatRequest(
        message="Write me a sentence.",
        session_id=session_id,
        model="llama3",
        use_documents=False,
        resume_offset=0
    )

    # 1. Start streaming response
    response = await chat_stream(req)
    
    # 2. Start reading the stream chunks
    iterator = response.body_iterator.__aiter__()
    
    print("UI Receives: ", end="", flush=True)
    
    # Read first 3 chunks (simulate user watching it type)
    for _ in range(3):
        chunk = await iterator.__anext__()
        print(chunk.strip(), end=" | ", flush=True)
        
    print("\n\n--- USER CLICKS 'STOP' BUTTON ---")
    
    # 3. Simulate hitting the cancel endpoint
    cancel_res = await cancel_stream(session_id)
    print(f"Cancel Endpoint Response: {cancel_res}")
    
    print("\n--- WAITING 1 SECOND FOR BACKEND TO CLEAN UP ---")
    await asyncio.sleep(1)
    
    # 4. Read database to see what was saved!
    print("--- WHAT IS SAVED IN THE DATABASE? ---")
    messages = db.get_messages_full(session_id)
    print(f"User Message: {messages[0]['content']}")
    print(f"Assistant Message: {messages[1]['content']}")

if __name__ == "__main__":
    asyncio.run(main())
