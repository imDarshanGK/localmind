# Integration-test backend image
# ================================
# Same as backend/Dockerfile but:
#   1. Upgrades pip to latest before installing to avoid hash-check bugs (pip 24 → 26)
#   2. Uses requirements_fixed.txt (removes unstructured + psutil that cause hash errors)
#   3. Skips pytest/test deps (not needed inside the container itself)

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl build-essential && rm -rf /var/lib/apt/lists/*

# Upgrade pip FIRST — pip 24.0 has known hash-verification bugs with some packages
RUN pip install --upgrade pip

COPY backend/requirements_fixed.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir psutil

COPY backend/ .

RUN mkdir -p data/uploads data/chromadb data/exports

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
