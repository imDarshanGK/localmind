#!/usr/bin/env bash
set -Eeuo pipefail

# Configuration variables with sensible defaults
BACKEND_URL="${BACKEND_URL:-http://localhost:8000/health}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000/}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-90}"
POLL_INTERVAL="${POLL_INTERVAL:-3}"
KEEP_CONTAINERS="${KEEP_CONTAINERS:-false}"

print_diagnostics() {
    echo ""
    echo "================ DIAGNOSTICS ================"
    echo "[docker compose ps]"
    docker compose ps || true
    echo ""
    echo "[docker compose logs]"
    docker compose logs || true
    echo "============================================="
}

cleanup() {
    local exit_code=$?
    if [ "$exit_code" -ne 0 ]; then
        print_diagnostics
    fi

    if [ "$KEEP_CONTAINERS" = "true" ]; then
        echo "KEEP_CONTAINERS=true: Skipping cleanup."
    else
        echo "Cleaning up containers..."
        docker compose down -v || true
    fi
    exit "$exit_code"
}

trap cleanup EXIT

wait_for_endpoint() {
    local name="$1"
    local url="$2"
    local attempt=1
    local max_attempts=$((TIMEOUT_SECONDS / POLL_INTERVAL))

    echo "Waiting for ${name}..."

    while [ "$attempt" -le "$max_attempts" ]; do
        echo "Attempt ${attempt}..."
        
        local temp_file
        temp_file=$(mktemp)
        local http_code
        
        # curl: 
        # -s: silent
        # -L: follow redirects
        # -o: output body to temp file
        # -w: output HTTP status code
        http_code=$(curl -s -L -o "$temp_file" -w "%{http_code}" "$url" || echo "000")
        
        if [ "$http_code" = "200" ]; then
            local body_length
            body_length=$(wc -c < "$temp_file" | tr -d ' ')
            
            if [ "$body_length" -gt 0 ]; then
                echo "${name} is healthy."
                rm -f "$temp_file"
                return 0
            else
                echo "ERROR: ${name} response body is empty."
                rm -f "$temp_file"
                exit 1
            fi
        elif [ "$http_code" = "500" ]; then
            echo "ERROR: ${name} returned HTTP 500."
            rm -f "$temp_file"
            exit 1
        fi
        
        rm -f "$temp_file"
        sleep "$POLL_INTERVAL"
        attempt=$((attempt + 1))
    done

    echo "ERROR: ${name} failed to become healthy after ${TIMEOUT_SECONDS} seconds."
    exit 1
}

verify_backend() {
    wait_for_endpoint "Backend" "$BACKEND_URL"
}

verify_frontend() {
    wait_for_endpoint "Frontend" "$FRONTEND_URL"
}

main() {
    verify_backend
    verify_frontend
    echo "All smoke tests passed successfully."
}

main
