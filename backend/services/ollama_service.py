"""
Ollama Service — Local LLM inference with streaming support
"""

import logging
import os
import httpx
import json
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
TIMEOUT = 180.0

SYSTEM_PROMPTS = {
    "en": "You are LocalMind, a helpful private AI assistant running 100% locally. No data leaves this machine. Be concise and accurate. When using document context, base your answer ONLY on it.",
    "hi": "आप LocalMind हैं, एक सहायक AI assistant जो पूरी तरह से locally चलता है। संक्षिप्त और सटीक रहें।",
    "ta": "நீங்கள் LocalMind, உள்ளூரில் இயங்கும் AI உதவியாளர். சுருக்கமாகவும் துல்லியமாகவும் இருங்கள்.",
    "te": "మీరు LocalMind, పూర్తిగా locally నడిచే AI assistant. సంక్షిప్తంగా మరియు ఖచ్చితంగా ఉండండి.",
    "kn": "ನೀವು LocalMind, ಸಂಪೂರ್ಣವಾಗಿ locally ಚಾಲಿತ AI assistant. ಸಂಕ್ಷಿಪ್ತ ಮತ್ತು ನಿಖರವಾಗಿರಿ.",
    "fr": "Vous êtes LocalMind, un assistant IA privé tournant 100% en local. Soyez concis et précis.",
    "de": "Sie sind LocalMind, ein privater KI-Assistent, der 100% lokal läuft. Seien Sie präzise.",
    "es": "Eres LocalMind, un asistente de IA privado que funciona 100% localmente. Sé conciso y preciso.",
    "ja": "あなたはLocalMindです。100%ローカルで動作するプライベートAIアシスタントです。データはこのマシンから外部に流出しません。簡潔かつ正確に答えてください。文書コンテキストを使用する場合は、そのコンテキストのみに基づいて回答してください。",
}


def _build_messages(message: str, context: str, history: list, language: str) -> list:
    system = SYSTEM_PROMPTS.get(language, SYSTEM_PROMPTS["en"])
    msgs = [{"role": "system", "content": system}]
    msgs.extend(history[-12:])  # last 6 turns
    user_content = message
    if context:
        user_content = (
            f"Use ONLY the following document context to answer:\n\n"
            f"---CONTEXT---\n{context}\n---END CONTEXT---\n\n"
            f"Question: {message}"
        )
    msgs.append({"role": "user", "content": user_content})
    return msgs


async def chat(
    message: str,
    model: str = "llama3",
    context: str = "",
    history: list = None,
    language: str = "en",
    temperature: float = 0.7,
) -> str:
    """Non-streaming chat. Returns full reply string."""
    history = history or []
    messages = _build_messages(message, context, history, language)
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature, "top_p": 0.9, "num_predict": 2048},
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
        response.raise_for_status()
        return response.json()["message"]["content"]


async def chat_stream(
    message: str,
    model: str = "llama3",
    context: str = "",
    history: list = None,
    language: str = "en",
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    """Streaming chat — yields token chunks as they arrive."""
    history = history or []
    messages = _build_messages(message, context, history, language)
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": temperature, "top_p": 0.9, "num_predict": 2048},
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        async with client.stream("POST", f"{OLLAMA_BASE_URL}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.strip():
                    try:
                        data = json.loads(line)
                        token = data.get("message", {}).get("content", "")
                        if token:
                            yield token
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue


async def list_models() -> list[dict]:
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            models = []
            for m in resp.json().get("models", []):
                size_gb = round(m.get("size", 0) / 1e9, 1)
                models.append({
                    "name": m["name"],
                    "size": f"{size_gb} GB",
                    "status": "available",
                    "modified_at": m.get("modified_at", ""),
                })
            return models
        except Exception as e:
            logger.warning(f"Could not list models: {e}")
            return []


async def pull_model(model_name: str) -> AsyncGenerator[str, None]:
    """Pull a model from Ollama registry with progress streaming."""
    async with httpx.AsyncClient(timeout=600.0) as client:
        async with client.stream(
            "POST", f"{OLLAMA_BASE_URL}/api/pull",
            json={"name": model_name, "stream": True}
        ) as resp:
            async for line in resp.aiter_lines():
                if line.strip():
                    yield line + "\n"


async def delete_model(model_name: str) -> bool:
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.delete(
                f"{OLLAMA_BASE_URL}/api/delete",
                json={"name": model_name}
            )
            return resp.status_code == 200
        except Exception:
            return False


async def is_ollama_running() -> bool:
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            return resp.status_code == 200
        except Exception:
            return False
