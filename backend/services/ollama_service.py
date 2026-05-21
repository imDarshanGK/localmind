"""
Ollama Service — Local LLM inference
Connects to Ollama running on localhost
"""

import logging
import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://localhost:11434"
REQUEST_TIMEOUT = 120.0

SYSTEM_PROMPT = """You are LocalMind, a helpful and private AI assistant.
You run 100% locally — no internet, no cloud, no data sharing.
When answering questions about documents, base your answer ONLY on the provided context.
If the context doesn't contain the answer, say so honestly.
Be concise, clear, and helpful."""


async def chat(
    message: str,
    model: str = "llama3",
    context: str = "",
    history: list[dict] = None,
) -> str:
    """
    Send a message to Ollama and get a response.
    Includes RAG context if provided.
    """
    history = history or []

    user_content = message
    if context:
        user_content = (
            f"Use the following document context to answer the question.\n\n"
            f"CONTEXT:\n{context}\n\n"
            f"QUESTION: {message}"
        )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-6:])  # last 3 turns for context window
    messages.append({"role": "user", "content": user_content})

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.7,
            "top_p": 0.9,
            "num_predict": 1024,
        },
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"]


async def list_models() -> list[dict]:
    """List all locally available Ollama models."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            response.raise_for_status()
            data = response.json()
            models = []
            for m in data.get("models", []):
                size_bytes = m.get("size", 0)
                size_gb = round(size_bytes / 1e9, 1)
                models.append({
                    "name": m["name"],
                    "size": f"{size_gb} GB",
                    "status": "available",
                })
            return models
        except Exception:
            return []


async def is_ollama_running() -> bool:
    """Check if Ollama is running."""
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            return response.status_code == 200
        except Exception:
            return False
