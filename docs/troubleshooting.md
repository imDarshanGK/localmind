# Troubleshooting Guide — Common Setup Errors

## Quick Diagnostic

```bash
# Verify all components are running
python -c "import localmind; print('✓ Python OK')"
ollama list 2>/dev/null && echo "✓ Ollama running" || echo "✗ Ollama not running"
curl -s http://localhost:11434/api/tags > /dev/null && echo "✓ Ollama API OK" || echo "✗ Ollama API unreachable"
```

---

## Setup Issues

### "Ollama not found" / "Connection refused"

**Cause:** Ollama is not installed or not running.

**Fix:**
```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve

# Windows
# Download from https://ollama.ai/download
```

### "Model not found: llama3"

**Cause:** The model hasn't been pulled yet.

**Fix:**
```bash
ollama pull llama3.2       # Recommended (3B params, fast)
ollama pull mistral         # Alternative
ollama pull gemma3:1b       # Lightweight option
```

### Python ImportError: "No module named 'localmind'"

**Cause:** Virtual environment not activated or dependencies not installed.

**Fix:**
```bash
python -m venv venv
source venv/bin/activate    # Linux/macOS
# or: venv\Scripts\activate # Windows
pip install -r requirements.txt
```

### "CUDA out of memory"

**Cause:** GPU doesn't have enough VRAM for the selected model.

**Fix:**
- Use a smaller model: `ollama pull llama3.2:1b`
- Force CPU-only: set `OLLAMA_NUM_GPU=0`
- Reduce context window in settings

### "Port 8000 already in use"

**Cause:** Another process is using the backend port.

**Fix:**
```bash
# Find and kill the process
lsof -ti:8000 | xargs kill -9     # macOS/Linux
netstat -ano | findstr :8000       # Windows (note PID, then kill)
# Or change port:
export LOCALMIND_PORT=8001
```

### "CORS error" in browser

**Cause:** Frontend and backend running on different origins without proper CORS config.

**Fix:**
- Ensure `VITE_API_URL=http://localhost:8000` in frontend `.env`
- Backend CORS is configured in `backend/main.py` — verify `allow_origins` includes your frontend URL

### "Document upload fails" / "File too large"

**Cause:** File exceeds the configured size limit.

**Fix:**
- Max file size is 50MB by default
- Split large PDFs or use text extraction first
- Check disk space: `df -h`

### "Indexing stuck" / "Embedding failed"

**Cause:** The embedding model may not be loaded or documents may be corrupted.

**Fix:**
```bash
# Pull the embedding model
ollama pull nomic-embed-text

# Clear and rebuild index
rm -rf ~/.localmind/indexes/
# Restart the app
```

### "Blank page" after npm run dev

**Cause:** Frontend build cache or missing environment variables.

**Fix:**
```bash
cd frontend
rm -rf node_modules/.vite
npm run dev
```

### "API key required" error

**Cause:** LocalMind v2.0+ runs fully offline — if you see this, you may have enabled cloud features.

**Fix:**
- Set `LOCALMIND_MODE=offline` in your `.env`
- Remove any `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` from `.env`

---

## Still Stuck?

1. Check logs: `tail -f backend/logs/localmind.log`
2. Run diagnostic: `python scripts/diagnostic.py`
3. Join [Discord](https://discord.gg/gvTUuMXk) for community help
4. Open a [GitHub Issue](https://github.com/imDarshanGK/localmind/issues/new)
