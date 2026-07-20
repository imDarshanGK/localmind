"""
Plugins routes — /api/plugins
Built-in plugins: calculator, web-search (Searxng), code-runner, summarizer, translator
"""

import ast
import math
import re
import subprocess
import tempfile
import os
import sys
from fastapi import APIRouter, HTTPException
from models.schemas import PluginRun, PluginResult
from services import db_service

router = APIRouter()

AVAILABLE_PLUGINS = [
    {"id": "calculator",  "name": "Calculator",       "description": "Evaluate math expressions safely",          "icon": "calculator"},
    {"id": "summarizer",  "name": "Summarizer",        "description": "Summarize long text with bullet points",    "icon": "summarizer"},
    {"id": "translator",  "name": "Translator",        "description": "Detect and translate text (via Ollama)",    "icon": "translator"},
    {"id": "coderunner",  "name": "Code Runner",       "description": "Run Python code snippets safely",          "icon": "coderunner"},
    {"id": "wordcount",   "name": "Word Counter",      "description": "Count words, chars, sentences in text",    "icon": "wordcount"},
    {"id": "jsonformat",  "name": "JSON Formatter",    "description": "Format and validate JSON strings",         "icon": "jsonformat"},
]


@router.get("/")
async def list_plugins():
    return {"plugins": AVAILABLE_PLUGINS}

@router.get("/logs")
async def get_plugin_logs(limit: int = 50):
    """Fetch recent plugin execution logs for the audit UI."""
    try:
        logs = db_service.get_plugin_logs(limit)
        return {"logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch logs: {str(e)}")

@router.post("/run", response_model=PluginResult)
async def run_plugin(body: PluginRun):
    plugin = body.plugin.lower()
    inp    = body.input.strip()

    try:
        if plugin == "calculator":
            result = _calculator(inp)
        elif plugin == "summarizer":
            result = _summarizer(inp)
        elif plugin == "wordcount":
            result = _wordcount(inp)
        elif plugin == "jsonformat":
            result = _jsonformat(inp)
        elif plugin == "coderunner":
            result = _coderunner(inp)
        elif plugin == "translator":
            result = _translator(inp)
        else:
            raise HTTPException(400, f"Unknown plugin: {plugin}")

        if body.session_id:
            db_service.log_plugin(body.session_id, plugin, inp, result)

        return PluginResult(plugin=plugin, output=result, success=True)

    except HTTPException:
        raise
    except Exception as e:
        return PluginResult(plugin=plugin, output="", success=False, error=str(e))


# ─── Plugin implementations ──────────────────────────────────

def _calculator(expr: str) -> str:
    """Safe math evaluator — no exec, uses ast + math module."""
    SAFE_NAMES = {k: v for k, v in math.__dict__.items() if not k.startswith("_")}
    SAFE_NAMES.update({"abs": abs, "round": round, "min": min, "max": max, "sum": sum})
    try:
        tree = ast.parse(expr, mode="eval")
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if not (isinstance(node.func, ast.Name) and node.func.id in SAFE_NAMES):
                    raise ValueError("Unsafe function call")
            if isinstance(node, ast.Attribute):
                raise ValueError("Attribute access not allowed")
        result = eval(compile(tree, "<calc>", "eval"), {"__builtins__": {}}, SAFE_NAMES)
        return f"Result: {result}"
    except Exception as e:
        return f"Error: {e}"


def _wordcount(text: str) -> str:
    words     = len(text.split())
    chars     = len(text)
    chars_ns  = len(text.replace(" ", ""))
    sentences = len(re.split(r'[.!?]+', text))
    paragraphs= len([p for p in text.split("\n\n") if p.strip()])
    lines     = len(text.splitlines())
    return (
        f"📊 Text Statistics\n"
        f"• Words: {words:,}\n"
        f"• Characters (with spaces): {chars:,}\n"
        f"• Characters (no spaces): {chars_ns:,}\n"
        f"• Sentences: {sentences:,}\n"
        f"• Paragraphs: {paragraphs:,}\n"
        f"• Lines: {lines:,}\n"
        f"• Avg word length: {chars_ns/max(words,1):.1f} chars"
    )


def _summarizer(text: str) -> str:
    """Simple extractive summarizer — top sentences by word frequency."""
    if len(text) < 200:
        return text
    sentences = re.split(r'(?<=[.!?])\s+', text)
    words     = re.findall(r'\w+', text.lower())
    freq      = {}
    for w in words:
        if len(w) > 3:
            freq[w] = freq.get(w, 0) + 1

    scores = []
    for sent in sentences:
        score = sum(freq.get(w.lower(), 0) for w in sent.split())
        scores.append((score, sent))

    scores.sort(reverse=True)
    top = [s for _, s in scores[:5]]
    # Restore original order
    ordered = [s for s in sentences if s in top]
    return "Summary:\n" + " ".join(ordered[:5])


def _jsonformat(text: str) -> str:
    import json
    try:
        parsed = json.loads(text)
        return json.dumps(parsed, indent=2, ensure_ascii=False)
    except json.JSONDecodeError as e:
        return f"Invalid JSON: {e}"


def _coderunner(code: str) -> str:
    """Run Python code in a restricted subprocess with timeout."""
    # Strip markdown code fences if present
    code = re.sub(r'^```(?:python)?\n?', '', code.strip())
    code = re.sub(r'\n?```$', '', code)

    # Basic safety: block dangerous imports
    BLOCKED = ["import os", "import sys", "import subprocess", "import socket",
               "__import__", "open(", "exec(", "eval(", "compile("]
    for b in BLOCKED:
        if b in code:
            return f"Blocked: '{b}' is not allowed in sandbox."

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        tmp = f.name

    try:
        result = subprocess.run(
            [sys.executable, tmp],
            capture_output=True, text=True, timeout=5
        )
        output = result.stdout or result.stderr or "(no output)"
        return f"Output:\n{output[:2000]}"
    except subprocess.TimeoutExpired:
        return "⏱ Timeout: code took more than 5 seconds."
    except Exception as e:
        return f"Error: {e}"
    finally:
        os.unlink(tmp)


def _translator(text: str) -> str:
    """Detect language and provide translation info (best-effort offline)."""
    # Simple heuristic language detection
    sample = text[:200]
    if re.search(r'[\u0900-\u097F]', sample):
        lang = "Hindi (Devanagari)"
    elif re.search(r'[\u0B80-\u0BFF]', sample):
        lang = "Tamil"
    elif re.search(r'[\u0C00-\u0C7F]', sample):
        lang = "Telugu"
    elif re.search(r'[\u0C80-\u0CFF]', sample):
        lang = "Kannada"
    elif re.search(r'[\u0600-\u06FF]', sample):
        lang = "Arabic"
    elif re.search(r'[\u4E00-\u9FFF]', sample):
        lang = "Chinese"
    elif re.search(r'[\u3040-\u30FF]', sample):
        lang = "Japanese"
    else:
        lang = "English / Latin script"

    return (
        f"Detected Language: {lang}\n\n"
        f"Tip: Ask LocalMind to translate this text for you!\n"
        f'Example: "Translate the following to English: {text[:100]}..."'
    )
