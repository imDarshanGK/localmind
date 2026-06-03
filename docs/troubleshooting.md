# Troubleshooting Guide

This page covers common setup errors and how to resolve them when running LocalMind locally.

## Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ and npm (for frontend development)
- Python 3.10+ (for backend development)

---

## 1. Docker / Docker Compose Issues

### Error: `docker: command not found`

**Cause:** Docker is not installed or not in your PATH.

**Solution:**
- Install Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/)
- After installation, restart your terminal and verify with `docker --version`

### Error: `docker-compose: command not found`

**Cause:** Docker Compose is not installed separately (older Docker versions).

**Solution:**
- Docker Compose is included in Docker Desktop (v2+). Use `docker compose` (without hyphen) instead.
- Or install it manually: [Install Docker Compose](https://docs.docker.com/compose/install/)

### Error: `port is already allocated` or `address already in use`

**Cause:** Another service is using port 3000 (frontend) or 8000 (backend).

**Solution:**
- Stop the conflicting service, or
- Change the port mapping in `docker-compose.yml`:
  ```yaml
  services:
    frontend:
      ports:
        - "3001:80"   # change 3000 to 3001
    backend:
      ports:
        - "8001:8000" # change 8000 to 8001
  ```

### Error: `Cannot connect to the Docker daemon`

**Cause:** Docker daemon is not running.

**Solution:**
- On macOS/Windows: Start Docker Desktop from your applications.
- On Linux: Run `sudo systemctl start docker` (or `sudo service docker start`).

---

## 2. Backend Issues

### Error: `ModuleNotFoundError: No module named 'backend'`

**Cause:** Running Python commands from the wrong directory.

**Solution:**
- Always run backend commands from the `backend/` directory:
  ```bash
  cd backend
  pip install -r requirements.txt
  ```

### Error: `sqlite3.OperationalError: unable to open database file`

**Cause:** The database directory does not exist or has wrong permissions.

**Solution:**
- Create the data directory:
  ```bash
  mkdir -p backend/data
  ```
- Ensure the directory is writable:
  ```bash
  chmod 755 backend/data
  ```

### Error: `ollama_service.py` connection refused

**Cause:** Ollama is not running or not accessible.

**Solution:**
- Ensure Ollama is installed and running: [Ollama Download](https://ollama.com/download)
- Start Ollama: `ollama serve`
- Pull a model: `ollama pull llama3.2` (or any model you want to use)
- Verify connection: `curl http://localhost:11434/api/tags`

---

## 3. Frontend Issues

### Error: `npm: command not found`

**Cause:** Node.js/npm is not installed.

**Solution:**
- Install Node.js 18+ from [nodejs.org](https://nodejs.org/)
- Verify with `node --version` and `npm --version`

### Error: `Module not found: Error: Can't resolve '...'`

**Cause:** Missing npm dependencies.

**Solution:**
- Run `npm install` from the `frontend/` directory:
  ```bash
  cd frontend
  npm install
  ```

### Error: Blank page / white screen after starting frontend

**Cause:** Backend API is not reachable or CORS issues.

**Solution:**
- Ensure the backend is running on port 8000.
- Check the browser console for network errors.
- If running frontend standalone, update the API URL in `frontend/src/utils/api.js` to point to your backend.

---

## 4. Environment Variables

### Error: Missing `.env` file

**Cause:** Required environment variables are not set.

**Solution:**
- Copy the example files:
  ```bash
  cp .env.example .env
  cp frontend/.env.example frontend/.env
  ```
- Edit the `.env` files with your configuration.

### Common `.env` variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OLLAMA_HOST` | Ollama server URL | `http://localhost:11434` |
| `DATABASE_URL` | Database connection string | `sqlite:///./data/localmind.db` |
| `SECRET_KEY` | Flask secret key | (generate one) |

---

## 5. Still Having Issues?

- Check the [GitHub Issues](https://github.com/imDarshanGK/localmind/issues) for similar problems.
- Open a new issue with:
  - Your operating system and versions (Docker, Node.js, Python)
  - The exact error message
  - Steps you have already tried
- Join the community discussions if available.
