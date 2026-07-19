import asyncio
import time

class StreamBuffer:
    def __init__(self, session_id: str, prompt: str):
        self.session_id = session_id
        self.prompt = prompt
        self.buffer = ""
        self.completed = False
        self.listeners = set()
        self.created_at = time.time()
        self.updated_at = time.time()
        self.completed_at = None
        self.error = None
        self.sources = []
        self.cancelled = False

async def mock_ollama_stream():
    tokens = ["Hello", " world", "!", " How", " are", " you?"]
    for t in tokens:
        await asyncio.sleep(0.1)
        yield t

async def background_generator(buffer):
    try:
        async for token in mock_ollama_stream():
            if buffer.cancelled:
                print("Generator detected cancellation! Breaking loop.")
                break
            
            buffer.buffer += token
            buffer.updated_at = time.time()
            for listener in list(buffer.listeners):
                await listener.put({"token": token})

        if buffer.cancelled:
            buffer.buffer += "\n\n[Generation Stopped]"

        buffer.completed = True
        buffer.completed_at = time.time()

        for listener in list(buffer.listeners):
            await listener.put({"done": True})

    except Exception as e:
        print(f"Error: {e}")

async def run_tests():
    print("--- Test 1: Normal Completion ---")
    buf1 = StreamBuffer("sess1", "hi")
    await background_generator(buf1)
    print(f"Result 1: completed={buf1.completed}, buffer='{buf1.buffer}'\n")

    print("--- Test 2: Cancellation midway ---")
    buf2 = StreamBuffer("sess2", "hi")
    
    # Start generator in background
    task = asyncio.create_task(background_generator(buf2))
    
    # Let it generate 2 tokens
    await asyncio.sleep(0.25) 
    print(f"Current buffer: '{buf2.buffer}'")
    
    # Cancel it!
    print("Sending cancel signal...")
    buf2.cancelled = True
    
    # Wait for task to finish
    await task
    print(f"Result 2: completed={buf2.completed}, cancelled={buf2.cancelled}")
    print(f"Final buffer:\n{buf2.buffer}")

if __name__ == "__main__":
    asyncio.run(run_tests())
