#!/bin/bash
set -e

echo "[Monolith] Starting services..."

# 1. Start Imager in background
# We redirect logs to ensure we see errors
echo "[Monolith] Launching Nitro Imager (Internal Port 3030)..."
cd /app/imager
node dist/index.js &
IMAGER_PID=$!

# Wait a few seconds for Imager to potentially crash or start
sleep 10

if ! kill -0 $IMAGER_PID > /dev/null 2>&1; then
    echo "[Monolith] CRITICAL: Imager process died immediately."
    exit 1
fi

echo "[Monolith] Imager running (PID $IMAGER_PID)."

# 2. Start Web in foreground
echo "[Monolith] Launching Next.js Web (Port 3000)..."
cd /app/web
exec npm start
