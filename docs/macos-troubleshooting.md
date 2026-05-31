# macOS Install Troubleshooting

This guide covers common issues users encounter when installing and running **LocalMind v2.0** on macOS (Intel and Apple Silicon).

---

## Table of Contents

- [Prerequisites Checklist](#prerequisites-checklist)
- [Ollama Issues](#ollama-issues)
- [Python / Backend Issues](#python--backend-issues)
- [Node.js / Frontend Issues](#nodejs--frontend-issues)
- [Docker Issues](#docker-issues)
- [Port Conflicts](#port-conflicts)
- [ChromaDB / RAG Issues](#chromadb--rag-issues)
- [Apple Silicon (M1/M2/M3) Specific](#apple-silicon-m1m2m3-specific)
- [Verifying Your Setup](#verifying-your-setup)

---

## Prerequisites Checklist

Before starting, confirm you have the required versions installed:

```bash
python3 --version      # needs 3.11+
node --version         # needs 18+
ollama --version       # needs to be running
docker --version       # only if using Docker setup
```

---

## Ollama Issues

### Ollama command not found

If `ollama` is not recognized after installation:

```bash
# Add Ollama to your PATH
export PATH="$PATH:/usr/local/bin"

# Make it permanent by adding to your shell config
echo 'export PATH="$PATH:/usr/local/bin"' >> ~/.zshrc
source ~/.zshrc
```

### Ollama server not running

LocalMind requires the Ollama server to be running in the background:

```bash
# Start the Ollama server
ollama serve

# Verify it's reachable (in a separate terminal)
curl http://localhost:11434
```

If the port is already in use, another Ollama instance may already be running — check with `lsof -i :11434`.

### Model not found / pull errors

```bash
# Pull the default model (approx. 4 GB — ensure you have space)
ollama pull llama3

# List available local models
ollama list
```

If the pull stalls or fails, check your internet connection or try:

```bash
ollama pull llama3 --insecure
```

### Ollama crashes on Apple Silicon

Some models require more RAM than is available. Try a smaller model:

```bash
ollama pull phi3        # ~2 GB, lighter alternative
ollama pull gemma:2b    # even lighter
```

---

## Python / Backend Issues

### `python3` resolves to wrong version

macOS ships with Python 2 or an older Python 3. Use `python3.11` explicitly, or manage versions with `pyenv`:

```bash
# Install pyenv (if not installed)
brew install pyenv

# Install and set Python 3.11
pyenv install 3.11.9
pyenv local 3.11.9

python3 --version   # should now show 3.11.x
```

### Virtual environment activation fails

```bash
cd backend
python3 -m venv venv
source venv/bin/activate    # note: use 'source', not just './venv/bin/activate'
```

If you see `permission denied`, fix with:

```bash
chmod +x venv/bin/activate
source venv/bin/activate
```

### `pip install` errors (C extensions / build failures)

Some packages require Xcode Command Line Tools:

```bash
xcode-select --install
```

If you see errors related to `sentence-transformers` or `chromadb`:

```bash
# Ensure you have the latest pip and wheel
pip install --upgrade pip wheel setuptools

# Then retry
pip install -r requirements.txt
```

### `uvicorn` not found after installing requirements

Make sure your virtual environment is activated before installing and running:

```bash
source venv/bin/activate
which uvicorn    # should point inside your venv
uvicorn app:app --reload --port 8000
```

### `.env` file missing

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```
OLLAMA_HOST=http://localhost:11434
DEFAULT_MODEL=llama3
```

---

## Node.js / Frontend Issues

### `npm install` fails

Ensure Node.js 18+ is installed. Use `nvm` to manage versions:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc

# Install and use Node 18
nvm install 18
nvm use 18
node --version    # should show v18.x.x
```

### `npm run dev` port conflict

Vite defaults to port 3000. If it's taken:

```bash
# Run on a different port
npx vite --port 3001
```

Or update `vite.config.js`:

```js
export default {
  server: {
    port: 3001,
  },
}
```

### Frontend can't reach backend (`CORS` or `Network Error`)

Ensure the backend is running on port 8000, then check that your `.env` in the frontend directory points to the right URL:

```bash
# frontend/.env (create if missing)
VITE_API_BASE_URL=http://localhost:8000/api
```

Restart the Vite dev server after any `.env` change.

---

## Docker Issues

### Docker Desktop not running

Docker must be running before using `docker compose`. Open **Docker Desktop** from your Applications folder or run:

```bash
open -a Docker
```

Wait until the whale icon in your menu bar stops animating, then:

```bash
docker compose up
```

### Permission denied on Docker socket

```bash
sudo chmod 666 /var/run/docker.sock
```

### Volume mount issues on Apple Silicon

If ChromaDB or SQLite data doesn't persist between restarts, check that Docker Desktop has access to the project directory under **Settings → Resources → File Sharing**.

### Port already allocated

```bash
# Find and stop what's using port 8000 or 3000
lsof -i :8000
kill -9 <PID>
```

---

## Port Conflicts

| Service  | Default Port | Check command         |
|----------|-------------|----------------------|
| Backend  | 8000        | `lsof -i :8000`      |
| Frontend | 3000        | `lsof -i :3000`      |
| Ollama   | 11434       | `lsof -i :11434`     |

Kill any process blocking a required port with `kill -9 <PID>`.

---

## ChromaDB / RAG Issues

### `chromadb` install fails

```bash
pip install --upgrade pip
pip install chromadb --no-binary :all:
```

If it still fails, try installing without the `hnswlib` binary:

```bash
HNSWLIB_NO_NATIVE=1 pip install chromadb
```

### Embeddings downloading on first run

On first upload, `sentence-transformers` will download the embedding model (~90 MB). This is expected — it only happens once and is cached locally.

### Vector DB errors after updating dependencies

If you see errors like `Collection not found` or `dimension mismatch`, clear the ChromaDB data directory and re-upload your documents:

```bash
rm -rf backend/chroma_db/
```

---

## Apple Silicon (M1/M2/M3) Specific

### Rosetta conflicts

Avoid mixing x86 and ARM binaries. Use native ARM versions of Python, Node, and Homebrew:

```bash
# Verify Homebrew is native ARM
file $(which brew)    # should show arm64, not x86_64
```

If you installed Homebrew under Rosetta, reinstall the native ARM version from [brew.sh](https://brew.sh).

### `torch` / `transformers` slow on first load

The first model load may take 30–60 seconds on Apple Silicon while Metal Performance Shaders (MPS) initialise. Subsequent loads are faster.

### `hnswlib` build errors

```bash
brew install cmake
HNSWLIB_NO_NATIVE=1 pip install hnswlib
pip install chromadb
```

---

## Verifying Your Setup

Run these checks to confirm everything is wired up correctly:

```bash
# 1. Ollama is serving
curl http://localhost:11434              # expect: "Ollama is running"

# 2. Backend is up
curl http://localhost:8000/api/models   # expect: JSON list of models

# 3. Frontend is up
open http://localhost:3000              # browser should open LocalMind UI

# 4. Run the test suite
cd backend
source venv/bin/activate
pytest tests/ -v                        # all 30+ tests should pass
```

---

## Still stuck?

Open an issue at [github.com/imDarshanGK/localmind/issues](https://github.com/imDarshanGK/localmind/issues) and include:

- Your macOS version (`sw_vers`)
- Python version (`python3 --version`)
- Node version (`node --version`)
- The full error message and stack trace
- Which setup method you used (Docker or Manual)
