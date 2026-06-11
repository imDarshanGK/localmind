<div align="center">

<img src="https://img.shields.io/badge/LocalMind-v2.0.0-7C3AED?style=for-the-badge&logoColor=white" />

# LocalMind v2.0
### Offline AI Assistant - Chat with Your Documents. Privately.

**No cloud. No API key. No data leaks. Runs 100% on your machine.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-black?style=flat-square)](https://ollama.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![SSoC 2026](https://img.shields.io/badge/SSoC-2026-blueviolet?style=flat-square)](https://ssoc.dev)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/gvTUuMXk)

<br/>

[Quick Start](#quick-start) · [Features](#features) · [Tech Stack](#tech-stack) · [Troubleshooting](#macos-install-troubleshooting) · [Contributing](#contributing) · [Screenshots](#screenshots)

---

</div>

## What's New in v2.0

| Feature | Description |
|---------|-------------|
| Streaming Responses | See AI reply token-by-token in real time |
| Plugin System | Calculator, Word Counter, JSON Formatter, Code Runner, Summarizer |
| 8 Languages | English, Hindi, Tamil, Telugu, Kannada, French, German, Spanish |
| Export Chats | Download conversations as Markdown, JSON, or TXT |
| Session Manager | Full CRUD - create, rename, search, delete chat sessions |
| Settings Panel | Temperature, RAG chunks, model, theme, language |
| Docker v2 | Health checks, persistent volumes, nginx reverse proxy |
| 30+ Tests | Full pytest suite with mocked Ollama |

---

## All Features

| Feature | Status |
|---------|--------|
| Fully Offline (Ollama) | Included |
| PDF / TXT / CSV / DOCX / MD / HTML upload | Included |
| RAG — Chat with Documents | Included |
| Streaming Responses (SSE) | Included |
| Multi-Model (Llama3, Mistral, Phi3, Gemma, DeepSeek) | Included |
| 8 UI Languages | Included |
| Chat History (SQLite) | Included |
| Session Manager (CRUD) | Included |
| Session Search | Included |
| Plugin System (6 plugins) | Included |
| Export (MD / JSON / TXT) | Included |
| Settings Panel | Included |
| Docker Compose | Included |
| 30+ Tests | Included |
| Zero telemetry | Included |

---

## 🛠 Tech Stack

```text
┌────────────────────────────────────────────────┐
│               LocalMind v2.0                   │
├──────────────┬─────────────────────────────────┤
│  Frontend    │  React 18 + Tailwind + Vite     │
│  Backend     │  Python 3.11 + FastAPI          │
│  AI Engine   │  Ollama (local LLM)             │
│  RAG         │  LangChain + ChromaDB           │
│  Embeddings  │  sentence-transformers (local)  │
│  Database    │  SQLite (100% local)            │
│  Streaming   │  Server-Sent Events (SSE)       │
│  Deploy      │  Docker Compose + nginx         │
│  Testing     │  pytest + TestClient            │
└──────────────┴─────────────────────────────────┘
```

---

## Quick Start

### Option 1 - Docker (Recommended, 3 commands)

```bash
# 1. Pull a model (one-time, ~4GB)
ollama pull llama3

# 2. Clone and start
git clone https://github.com/yourusername/localmind.git
cd localmind && docker compose up

# 3. Open browser
open http://localhost:3000
```

### Option 2 - Manual Setup

```bash
git clone https://github.com/yourusername/localmind.git
cd localmind

# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env
uvicorn app:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install && npm run dev
# Open http://localhost:3000
```

**Prerequisites:** [Python 3.11+](https://python.org) | [Node 18+](https://nodejs.org) | [Ollama](https://ollama.ai) | [Docker](https://docker.com)

### Render Deploy

If you deploy on Render, set the frontend build to use `VITE_API_BASE_URL` and configure the backend with `CORS_ORIGINS`.

```bash
# backend service envs
OLLAMA_HOST=http://<your-ollama-host>:11434
DEFAULT_MODEL=llama3
CORS_ORIGINS=https://<your-frontend>.onrender.com

# frontend static site envs
VITE_API_BASE_URL=https://<your-backend>.onrender.com/api
```

The included `render.yaml` defines a backend web service and a frontend static site for the same repo.

## macOS Install Troubleshooting

### `node` or `npm` not found
**Symptom:** `zsh: command not found: node` or `The engine "node" is incompatible with this module`

```bash
brew install nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "$(brew --prefix nvm)/nvm.sh" ] && . "$(brew --prefix nvm)/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 18 && nvm use 18
```
> Open a new terminal window after running this so the PATH update takes effect.

---

### `pip install` fails building wheels
**Symptom:** `xcrun: error: invalid active developer path` or `clang: error: command not found`

```bash
xcode-select --install   # one-time, installs Apple Command Line Tools

cd backend
python3 -m venv venv && source venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```
> If the popup says tools are already installed, run `xcode-select -p` to confirm the path, then retry pip.

---

### Apple Silicon architecture mismatch
**Symptom:** `bad CPU type in executable` or `mach-o file, but is an incompatible architecture`

```bash
cd backend
rm -rf venv
arch -arm64 python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cd ../frontend
arch -arm64 npm install
```
> If your Python or Node was installed under Intel Homebrew, open a Rosetta shell first (`arch -x86_64 zsh`) and rerun the same commands there.

---

### Port 3000 or 8000 already in use
**Symptom:** `EADDRINUSE: address already in use`

```bash
lsof -ti :3000 | xargs kill
lsof -ti :8000 | xargs kill
```
> Then re-run `npm run dev` and `uvicorn app:app --reload --port 8000`.

---

### Ollama not reachable
**Symptom:** `Failed to connect to Ollama` or `Connection refused — localhost:11434`

```bash
ollama serve
ollama pull llama3
curl http://localhost:11434/api/tags   # should return a JSON list of models
```
> If `ollama` is not found, download the app from [ollama.com](https://ollama.com) and reopen Terminal.

---

### Python version too old
**Symptom:** `python --version` shows 3.10 or earlier

```bash
brew install python@3.11

cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
> Run `python --version` inside the activated venv — it should show `3.11.x`.

---

## Verifying Your macOS Setup

```bash
node --version      # v18.x or v20.x
npm --version       # 8 or higher
python3 --version   # Python 3.11.x or higher
ollama list         # shows llama3 or another pulled model
```

If all four pass and `npm run dev` starts without errors, your setup is complete.

---

## Project Structure

```text
localmind/
├── backend/
│   ├── app.py                    # FastAPI entry point
│   ├── routes/
│   │   ├── chat.py               # /api/chat — streaming + standard
│   │   ├── sessions.py           # /api/sessions — full CRUD
│   │   ├── upload.py             # /api/upload — file indexing
│   │   ├── models.py             # /api/models — Ollama management
│   │   ├── plugins.py            # /api/plugins — 6 built-in plugins
│   │   ├── export.py             # /api/export — MD, JSON, TXT
│   │   └── settings.py           # /api/settings — app config
│   ├── services/
│   │   ├── rag_service.py        # LangChain + ChromaDB RAG
│   │   ├── ollama_service.py     # Ollama + streaming
│   │   └── db_service.py        # SQLite — all CRUD
│   ├── models/
│   │   └── schemas.py           # Pydantic v2 schemas
│   ├── tests/
│   │   └── test_api.py          # 30+ tests
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Root — state, routing
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx    # Messages + streaming + export
│   │   │   ├── Sidebar.jsx       # Sessions + model + language
│   │   │   ├── StatusBar.jsx     # Header toolbar
│   │   │   ├── UploadPanel.jsx   # Drag-drop file upload
│   │   │   ├── PluginsPanel.jsx  # Plugin runner UI
│   │   │   └── SettingsPanel.jsx # Settings form
│   │   └── utils/
│   │       └── api.js            # All backend API calls
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── CONTRIBUTING.md
└── ROADMAP.md
```

---

## Plugins

| Plugin | Description |
|--------|-------------|
| Calculator | Safe math evaluator (supports `sqrt`, `log`, `sin`, etc.) |
| Summarizer | Extractive summary of long text |
| Word Counter | Words, chars, sentences, paragraphs |
| {} JSON Formatter | Validate and pretty-print JSON |
| Code Runner | Run Python snippets in a sandbox |
| Translator | Language detection + translation via LocalMind |

---

## Running Tests

```bash
cd backend
pip install pytest pytest-asyncio
pytest tests/ -v
# 30+ tests covering: sessions, chat, plugins, upload, export, settings
```

---

## 🤝 Contributing

1. Fork → Clone → Create branch (`git checkout -b feature/your-feature`)
2. Make changes → Write tests → Commit (`git commit -m "feat: ..."`)
3. Push → Open Pull Request

Issues labeled [`good-first-issue`](https://github.com/yourusername/localmind/issues?q=label%3Agood-first-issue) are perfect for beginners!

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## License

MIT © 2026
<div align="center">

If LocalMind helped you, please star the repo. ⭐✨🚀

---

## 🌟 Community Showcase

Built something cool with LocalMind? We'd love to see it! Open a Pull Request to add your project, tutorial, or integration to this list.

### 🛠️ Projects & Integrations
* **[Your Project Name]** - A brief 1-2 sentence description of what your integration does. (By [@yourusername](https://github.com/yourusername))
* *Contributions welcome! Add your tool here.*

### 📚 Community Articles & Tutorials
* *Have you written a blog post or recorded a video setup guide? Share it with the community here!*

---

</div>
