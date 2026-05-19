<div align="center">

<img src="https://img.shields.io/badge/LocalMind-v1.0.0-7C3AED?style=for-the-badge&logoColor=white" />

# 🧠 LocalMind
### Offline AI Assistant — Chat with Your Documents. Privately.

**No cloud. No API key. No data leaks. Just you and your AI.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![SSoC 2026](https://img.shields.io/badge/SSoC-2026-blueviolet?style=flat-square)](https://ssoc.dev)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)
[![Stars](https://img.shields.io/github/stars/yourusername/localmind?style=flat-square&color=gold)](https://github.com/yourusername/localmind/stargazers)

<br/>

> Upload your PDF, CSV, or text files and chat with them in plain English.
> Everything runs on your laptop. Your data never leaves your device.

<br/>

[🚀 Quick Start](#-quick-start) • [✨ Features](#-features) • [🛠 Tech Stack](#-tech-stack) • [🤝 Contributing](#-contributing) • [📸 Demo](#-demo)

---

</div>

## 📸 Demo

```
User: "What is the main conclusion of my research paper?"

LocalMind: Based on your uploaded document, the main conclusion is that...
           [answers from YOUR file, running 100% locally]
```

> Demo GIF coming soon — contributors welcome to record one! See issue #12

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🏠 **Fully Offline** | Runs entirely on your machine using Ollama |
| 📄 **Document Chat (RAG)** | Upload PDF, TXT, CSV, DOCX — chat with them |
| 🤖 **Multi-Model** | Llama 3, Mistral, Phi-3, Gemma — switch anytime |
| 🌐 **Multi-Language** | Hindi, Tamil, Telugu, Kannada + 10 more |
| 💬 **Chat History** | All conversations saved locally in SQLite |
| 🔌 **Plugin System** | Extend with custom tools — calculator, web search |
| 🐳 **Docker Ready** | One command to run everything |
| 🎨 **Clean UI** | Beautiful React chat interface included |

---

## 🛠 Tech Stack

```
┌─────────────────────────────────────────────┐
│                  LocalMind                  │
├──────────────┬──────────────────────────────┤
│   Frontend   │  React 18 + Tailwind CSS     │
│   Backend    │  Python 3.11 + FastAPI       │
│   AI Engine  │  Ollama + LangChain          │
│   Embeddings │  sentence-transformers       │
│   Vector DB  │  ChromaDB (local)            │
│   Storage    │  SQLite (chat history)       │
│   Deploy     │  Docker Compose              │
└──────────────┴──────────────────────────────┘
```

---

## 🚀 Quick Start

### Option 1 — Docker (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/localmind.git
cd localmind

# 2. Pull an AI model (one-time, ~4GB)
ollama pull llama3

# 3. Start everything
docker compose up

# 4. Open in browser
open http://localhost:3000
```

### Option 2 — Manual Setup

```bash
# Clone
git clone https://github.com/yourusername/localmind.git
cd localmind

# Backend
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env
uvicorn app:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

**Prerequisites**: [Python 3.11+](https://python.org) | [Node.js 18+](https://nodejs.org) | [Ollama](https://ollama.ai) | [Docker](https://docker.com) (optional)

---

## 📁 Project Structure

```
localmind/
├── backend/
│   ├── app.py               # FastAPI entry point
│   ├── routes/
│   │   ├── chat.py          # Chat endpoints
│   │   ├── upload.py        # File upload endpoints
│   │   └── models.py        # Model management endpoints
│   ├── services/
│   │   ├── rag_service.py   # LangChain RAG pipeline
│   │   ├── ollama_service.py# Ollama integration
│   │   └── db_service.py    # SQLite chat history
│   ├── models/
│   │   └── schemas.py       # Pydantic models
│   ├── plugins/             # Plugin system
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Pages
│   │   └── hooks/           # Custom hooks
│   ├── package.json
│   └── tailwind.config.js
├── docs/                    # Documentation
├── .github/
│   ├── ISSUE_TEMPLATE/      # Bug report, feature request
│   └── workflows/           # CI/CD (pytest, lint)
├── docker-compose.yml
├── .env.example
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── ROADMAP.md
└── README.md
```

---

## 🗺 Roadmap

- [x] Basic chat with Ollama models
- [x] PDF/TXT document upload + RAG
- [x] React chat UI
- [x] Docker setup
- [ ] Voice input (Whisper) — [help wanted](https://github.com/yourusername/localmind/issues)
- [ ] Mobile app (React Native)
- [ ] Multi-user support
- [ ] Browser extension
- [ ] Fine-tuning support

See full [ROADMAP.md](ROADMAP.md)

---

## 🤝 Contributing

We love contributions! LocalMind is built **by the community, for the community.**

```bash
# Fork the repo, then:
git checkout -b feature/your-feature-name
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
# Open a Pull Request 🎉
```

**Good first issues** are labeled [`good-first-issue`](https://github.com/yourusername/localmind/issues?q=label%3Agood-first-issue) — perfect for beginners!

Types of contributions welcome:
- 🐛 Bug fixes
- ✨ New features
- 🌐 Language translations
- 📝 Documentation
- 🎨 UI/UX improvements
- 🧪 Tests

Read [CONTRIBUTING.md](CONTRIBUTING.md) for full guide.

---

## 🌟 Contributors

Thanks to everyone who has contributed! ❤️

<!-- Add contributors grid here using https://contrib.rocks -->

---

## 📄 License

MIT © 2026 — Free to use, modify, and distribute.

Made with ❤️ for [Social Summer of Code 2026](https://ssoc.dev)

<div align="center">

⭐ **Star this repo if you find it useful!** ⭐

</div>
