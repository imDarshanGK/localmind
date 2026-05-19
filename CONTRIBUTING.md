# Contributing to LocalMind 🧠

Thank you for wanting to contribute! LocalMind is built by and for the community.
Every contribution — big or small — matters. 💜

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Setting Up Locally](#setting-up-locally)
- [Making a Pull Request](#making-a-pull-request)
- [Issue Guidelines](#issue-guidelines)
- [Coding Standards](#coding-standards)

---

## Code of Conduct

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be kind. Be respectful.

---

## How to Contribute

### Beginners — start here!
Look for issues labeled [`good-first-issue`](https://github.com/yourusername/localmind/issues?q=label%3Agood-first-issue).
These are small, well-defined tasks perfect for your first PR.

Types of contributions:
| Type | Examples |
|------|---------|
| 🐛 Bug Fix | Fix a broken endpoint, UI glitch |
| ✨ Feature | Add new model support, new file type |
| 🌐 Translation | Translate UI to Hindi, Tamil, Telugu |
| 📝 Docs | Improve README, add tutorials |
| 🧪 Tests | Write pytest tests, add test cases |
| 🎨 UI/UX | Improve the React frontend |

---

## Setting Up Locally

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/localmind.git
cd localmind

# 2. Create a virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 3. Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..

# 4. Install frontend dependencies
cd frontend
npm install
cd ..

# 5. Copy environment variables
cp .env.example .env

# 6. Pull an AI model
ollama pull llama3

# 7. Start backend
cd backend && uvicorn app:app --reload --port 8000

# 8. Start frontend (new terminal)
cd frontend && npm run dev
```

---

## Making a Pull Request

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes** — keep them focused on one thing.

3. **Write tests** for your changes (if applicable).

4. **Commit** with a clear message:
   ```bash
   git commit -m "feat: add Gemma model support"
   git commit -m "fix: handle empty PDF upload"
   git commit -m "docs: improve quick start guide"
   ```
   We follow [Conventional Commits](https://www.conventionalcommits.org/).

5. **Push and open a PR**:
   ```bash
   git push origin feature/your-feature-name
   ```
   Open a PR on GitHub. Fill in the PR template.

6. **Wait for review** — we aim to review within 48 hours!

---

## Issue Guidelines

When opening a bug report:
- Describe what you expected vs what happened
- Include steps to reproduce
- Include your OS, Python version, and Ollama version

When requesting a feature:
- Explain the use case
- Why does it belong in LocalMind?

---

## Coding Standards

**Python (backend)**
- Follow PEP 8
- Use type hints
- Write docstrings for functions
- Run `black .` before committing

**JavaScript/React (frontend)**
- Use functional components + hooks
- Keep components small and focused
- Follow the existing file structure

**Tests**
```bash
# Run backend tests
cd backend && pytest

# Run with coverage
pytest --cov=. --cov-report=term
```

---

## Need Help?

Open a [Discussion](https://github.com/yourusername/localmind/discussions) or comment on the issue.
We're here to help! 🙌

---

Made with ❤️ for Social Summer of Code 2026
