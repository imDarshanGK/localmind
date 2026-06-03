# Contributing to LocalMind

First off, thank you for considering contributing to LocalMind! We welcome contributions from everyone, whether you're fixing a bug, adding a feature, improving documentation, or helping with testing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setting Up the Development Environment](#setting-up-the-development-environment)
  - [Running the Project Locally](#running-the-project-locally)
- [Development Workflow](#development-workflow)
  - [Branching Strategy](#branching-strategy)
  - [Commit Messages](#commit-messages)
  - [Pull Requests](#pull-requests)
- [Coding Standards](#coding-standards)
  - [Backend (Python)](#backend-python)
  - [Frontend (JavaScript/React)](#frontend-javascriptreact)
- [Testing](#testing)
- [Documentation](#documentation)
- [Issue Tracker](#issue-tracker)
- [Getting Help](#getting-help)

## Code of Conduct

This project and everyone participating in it is governed by the [LocalMind Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Git** – for version control
- **Docker** and **Docker Compose** – for running the project locally (recommended)
- **Node.js** (v18 or later) and **npm** – if running the frontend outside Docker
- **Python** (3.10 or later) and **pip** – if running the backend outside Docker
- **Ollama** – for local LLM inference (optional but recommended for full functionality)

### Setting Up the Development Environment

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/your-username/localmind.git
   cd localmind
   ```

3. **Add the upstream remote** to keep your fork in sync:

   ```bash
   git remote add upstream https://github.com/imDarshanGK/localmind.git
   ```

4. **Create a new branch** for your work:

   ```bash
   git checkout -b feature/your-feature-name
   ```

### Running the Project Locally

#### Using Docker (Recommended)

The easiest way to run the entire stack is with Docker Compose:

```bash
# Copy environment file
cp .env.example .env

# Start all services
docker-compose up --build
```

This will start:
- Backend API at `http://localhost:8000`
- Frontend at `http://localhost:5173`

#### Without Docker

**Backend:**

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

## Development Workflow

### Branching Strategy

We follow a simple branching model:

- `main` – stable, production-ready code
- `develop` – integration branch for features
- `feature/*` – for new features
- `fix/*` – for bug fixes
- `docs/*` – for documentation changes

Always branch off from `main` (or `develop` if it exists) and create a pull request back to the same branch.

### Commit Messages

We encourage clear, descriptive commit messages. Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(chat): add markdown rendering to messages`
- `fix(api): handle empty session list gracefully`
- `docs(readme): update installation instructions`

### Pull Requests

1. **Keep PRs small and focused** – one feature or fix per PR.
2. **Write a clear description** explaining what the PR does and why.
3. **Reference related issues** using `Closes #123` or `Fixes #123`.
4. **Ensure all checks pass** – CI will run tests and linting.
5. **Request a review** from at least one maintainer.

## Coding Standards

### Backend (Python)

- Follow [PEP 8](https://peps.python.org/pep-0008/) style guide.
- Use type hints for function signatures.
- Write docstrings for public functions and classes.
- Keep functions small and focused (single responsibility).
- Use meaningful variable and function names.

### Frontend (JavaScript/React)

- Use functional components with hooks (no class components).
- Follow the existing project structure and naming conventions.
- Use Tailwind CSS for styling (avoid inline styles).
- Keep components small and reusable.
- Use meaningful component and prop names.

## Testing

We value tests to ensure reliability and prevent regressions.

- **Backend tests** are located in `backend/tests/` and use pytest.
- **Frontend tests** (if any) should be placed alongside components.

To run backend tests:

```bash
cd backend
pytest
```

When adding new functionality, please include corresponding tests. If fixing a bug, consider adding a test that reproduces the issue.

## Documentation

Good documentation helps everyone understand and use the project.

- Update `README.md` if you change installation steps or add major features.
- Update `ROADMAP.md` if you add or remove planned features.
- Document new API endpoints in the backend code (docstrings).
- If you add a new environment variable, update `.env.example`.

## Issue Tracker

We use GitHub Issues to track bugs, feature requests, and tasks.

- **Bug reports** – use the bug report template and include steps to reproduce.
- **Feature requests** – use the feature request template and describe the use case.
- **Questions** – feel free to open an issue with the `question` label.

If you're new to the project, look for issues labeled `good first issue` or `help wanted`.

## Getting Help

If you get stuck or have questions:

- Check the existing [issues](https://github.com/imDarshanGK/localmind/issues) and [discussions](https://github.com/imDarshanGK/localmind/discussions).
- Ask in the issue or PR you're working on.
- Reach out to maintainers via GitHub.

We're here to help and appreciate your contribution!

---

Thank you for contributing to LocalMind! 🚀
