"""
Mock Ollama Server for LocalMind Integration Tests
===================================================
Mimics Ollama's HTTP API so the backend can run end-to-end
without a real LLM or GPU.  Endpoints implemented:

  GET  /api/tags          -> list of available models
  POST /api/chat          -> non-streaming + streaming chat
  POST /api/pull          -> pretend-pull (immediate done)
  DELETE /api/delete      -> pretend-delete
"""

import json
import re
import time
from flask import Flask, request, Response, jsonify

app = Flask(__name__)

# --------------------------------------------------------------------------- #
# Canned model list — matches Ollama's real /api/tags shape
# --------------------------------------------------------------------------- #
MODELS = [
    {
        "name": "llama3:latest",
        "model": "llama3:latest",
        "modified_at": "2025-01-01T00:00:00Z",
        "size": 4_700_000_000,
        "digest": "abc123",
        "details": {"family": "llama", "parameter_size": "8B", "quantization_level": "Q4_0"},
    }
]


@app.get("/api/tags")
def list_models():
    return jsonify({"models": MODELS})


# --------------------------------------------------------------------------- #
# Smart canned reply: echo keywords from the user message so RAG tests pass
# --------------------------------------------------------------------------- #
KEYWORD_ANSWERS = {
    "capital": "The capital of France is Paris.",
    "france": "France's capital city is Paris.",
    "paris": "Yes, Paris is the capital of France.",
    "python": "Python is a high-level programming language known for readability.",
    "localmind": "LocalMind is a fully offline AI assistant.",
}

DEFAULT_REPLY = (
    "I am a mock Ollama server. I received your message and I am responding "
    "with a deterministic reply for integration testing purposes."
)


def _build_reply(messages: list) -> str:
    """Pick a reply based on keywords found in the last user message."""
    # Find the last user message
    user_content = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            user_content = msg.get("content", "").lower()
            break

    for keyword, answer in KEYWORD_ANSWERS.items():
        if keyword in user_content:
            return answer

    return DEFAULT_REPLY


# --------------------------------------------------------------------------- #
# POST /api/chat  — supports both stream=True and stream=False
# --------------------------------------------------------------------------- #
@app.post("/api/chat")
def chat():
    body = request.get_json(force=True, silent=True) or {}
    messages = body.get("messages", [])
    model = body.get("model", "llama3:latest")
    do_stream = body.get("stream", False)
    reply_text = _build_reply(messages)

    if do_stream:
        def generate():
            words = reply_text.split()
            for i, word in enumerate(words):
                chunk = {
                    "model": model,
                    "created_at": "2025-01-01T00:00:00Z",
                    "message": {"role": "assistant", "content": word + " "},
                    "done": False,
                }
                yield json.dumps(chunk) + "\n"
                time.sleep(0.01)  # tiny delay to simulate token streaming
            # Final done message
            done_chunk = {
                "model": model,
                "created_at": "2025-01-01T00:00:00Z",
                "message": {"role": "assistant", "content": ""},
                "done": True,
                "total_duration": 1_000_000_000,
                "eval_count": len(words),
            }
            yield json.dumps(done_chunk) + "\n"

        return Response(generate(), mimetype="application/x-ndjson")

    # Non-streaming
    return jsonify({
        "model": model,
        "created_at": "2025-01-01T00:00:00Z",
        "message": {"role": "assistant", "content": reply_text},
        "done": True,
        "total_duration": 500_000_000,
        "eval_count": len(reply_text.split()),
    })


# --------------------------------------------------------------------------- #
# POST /api/pull  — pretend to pull a model (instant success)
# --------------------------------------------------------------------------- #
@app.post("/api/pull")
def pull_model():
    body = request.get_json(force=True, silent=True) or {}
    name = body.get("name", "llama3:latest")
    do_stream = body.get("stream", True)

    if do_stream:
        def generate():
            for status in ["pulling manifest", "pulling layers", "verifying sha256", "success"]:
                yield json.dumps({"status": status}) + "\n"
                time.sleep(0.05)
        return Response(generate(), mimetype="application/x-ndjson")

    return jsonify({"status": "success"})


# --------------------------------------------------------------------------- #
# DELETE /api/delete  — pretend to delete a model
# --------------------------------------------------------------------------- #
@app.delete("/api/delete")
def delete_model():
    return jsonify({"status": "success"}), 200


# --------------------------------------------------------------------------- #
# Health / root
# --------------------------------------------------------------------------- #
@app.get("/")
def root():
    return jsonify({"message": "Mock Ollama is running"})


if __name__ == "__main__":
    # Bind to 0.0.0.0 so Docker port mapping works
    app.run(host="0.0.0.0", port=11434, debug=False)
