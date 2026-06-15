#!/usr/bin/env bash
set -euo pipefail

# Constants
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:8000/health"
BACKEND_CONTAINER="localmind-backend"
FRONTEND_CONTAINER="localmind-frontend"
MAX_ATTEMPTS=30
SLEEP_INTERVAL=2

# Get current script directory to locate docker-compose.yml correctly
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=== Starting Docker Compose Stack ==="
docker compose up -d --build

# Function to clean up containers on exit
cleanup() {
    echo "=== Shutting down Docker Compose Stack ==="
    docker compose down -v
}

# Register the cleanup function to run on script exit (success or failure)
trap cleanup EXIT

echo "=== Waiting for Docker containers to report healthy ==="
for ((i=1; i<=MAX_ATTEMPTS; i++)); do
    echo "Checking status (Attempt $i/$MAX_ATTEMPTS)..."

    # Get backend health status
    backend_status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$BACKEND_CONTAINER" 2>/dev/null || echo "unknown")
    # Get frontend health status
    frontend_status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$FRONTEND_CONTAINER" 2>/dev/null || echo "unknown")

    echo "Backend status: $backend_status, Frontend status: $frontend_status"

    if [ "$backend_status" = "healthy" ] && [ "$frontend_status" = "healthy" ]; then
        echo "Docker reports both containers are healthy."
        break
    fi

    if [ "$backend_status" = "unhealthy" ] || [ "$frontend_status" = "unhealthy" ]; then
        echo "ERROR: One of the services became unhealthy."
        echo "=== Backend logs ==="
        docker compose logs backend --no-log-prefix | tail -n 50
        echo "=== Frontend logs ==="
        docker compose logs frontend --no-log-prefix | tail -n 50
        exit 1
    fi

    if [ "$i" -eq "$MAX_ATTEMPTS" ]; then
        echo "ERROR: Timeout waiting for services to become healthy."
        echo "=== Backend logs ==="
        docker compose logs backend --no-log-prefix | tail -n 50
        echo "=== Frontend logs ==="
        docker compose logs frontend --no-log-prefix | tail -n 50
        exit 1
    fi

    sleep "$SLEEP_INTERVAL"
done

echo "=== Verifying endpoints from the host ==="

# 1. Verify Backend health endpoint content
echo "Verifying backend health endpoint..."
backend_response=$(curl -fsS "$BACKEND_URL")
echo "Backend response: $backend_response"

if [[ "$backend_response" != *"healthy"* ]]; then
    echo "ERROR: Backend health endpoint did not return expected content."
    exit 1
fi

# 2. Verify Frontend returns HTTP 200
echo "Verifying frontend endpoint..."
frontend_response=$(curl -fsS "$FRONTEND_URL" | head -n 5)
echo "Frontend responsive."

echo "=== All smoke tests passed successfully! ==="
exit 0
