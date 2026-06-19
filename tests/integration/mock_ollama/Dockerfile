FROM python:3.11-slim

WORKDIR /app

# Upgrade pip and install Flask only — tiny image
RUN pip install --upgrade pip && pip install --no-cache-dir flask==3.0.3

COPY tests/integration/mock_ollama/server.py .

# Expose the same port Ollama uses by default
EXPOSE 11434

HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:11434/api/tags')" || exit 1

CMD ["python", "server.py"]
