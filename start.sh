#!/bin/bash
set -e

echo "=========================================="
echo "  Server Hub v6 - Starting Services"
echo "=========================================="

export PATH="/opt/venv/bin:$PATH"
export TERM=xterm-256color
export COLORTERM=truecolor
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "[1/4] Checking Python..."
python3 --version 2>&1 || echo "  WARNING: Python not found"

echo "[2/4] Checking PHP..."
php --version 2>&1 | head -1 || echo "  WARNING: PHP not found"

echo "[3/4] Checking Node.js..."
node --version 2>&1 || echo "  WARNING: Node.js not found"

echo "[4/4] Checking Docker..."
if docker info >/dev/null 2>&1; then
    echo "  Docker is available - user isolation ENABLED"
    # Build user container image if needed
    if ! docker image inspect server-hub-user:latest >/dev/null 2>&1; then
        echo "  Building user container image..."
        docker build -t server-hub-user:latest -f Dockerfile.user . 2>&1 || echo "  WARNING: User container build failed"
    fi
    export DOCKER_AVAILABLE=true
else
    echo "  Docker not available - running without container isolation"
    export DOCKER_AVAILABLE=false
fi

if [ -n "$CLOUDFLARE_DOMAIN" ]; then
    echo "[5/5] Cloudflare configured for $CLOUDFLARE_DOMAIN"
    export CLOUDFLARE_ENABLED=true
else
    echo "[5/5] Cloudflare not configured (set CLOUDFLARE_DOMAIN to enable)"
fi

echo ""
echo "=========================================="
echo "  Starting Server Hub Backend on port ${PORT:-3001}"
echo "=========================================="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/backend"

exec node --enable-source-maps dist/index.js
