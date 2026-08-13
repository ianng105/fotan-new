#!/bin/bash
# ── docker-entrypoint.sh — start wuzapi + relay + cloudflared ───────────
set -e

echo "=== WuzAPI Docker Container ==="

# Load env
set -a
source /app/wuzapi.env 2>/dev/null || true
set +a

WUZAPI_PORT="${WUZAPI_PORT:-8080}"
RELAY_PORT="${RELAY_PORT:-3100}"

# ── 1. Start wuzapi ─────────────────────────────────────────────────────
echo "[entry] starting wuzapi on :${WUZAPI_PORT}..."
ADMIN_TOKEN="${WUZAPI_ADMIN_TOKEN:-my-admin-secret-token}"
/app/wuzapi -admintoken "$ADMIN_TOKEN" &
WUZAPI_PID=$!

# ── 2. Start relay ──────────────────────────────────────────────────────
echo "[entry] starting relay on :${RELAY_PORT}..."
export RELAY_FORWARD_URL="${RELAY_FORWARD_URL:-https://ai-caseylai-whatsapp-wuzapi.ai-caseylai-whatsapp-wuzapi.workers.dev}"
python3 -u /app/relay.py &
RELAY_PID=$!

# ── 3. Wait for wuzapi to be ready ──────────────────────────────────────
echo "[entry] waiting for wuzapi to be ready..."
for i in $(seq 1 30); do
    if curl -s "http://localhost:${WUZAPI_PORT}/health" >/dev/null 2>&1; then
        echo "[entry] wuzapi is ready"
        break
    fi
    sleep 1
done

# ── 4. Start cloudflared tunnel ─────────────────────────────────────────
echo "[entry] starting cloudflared tunnel → localhost:${WUZAPI_PORT}..."
cloudflared tunnel --url "http://localhost:${WUZAPI_PORT}" --no-autoupdate \
    --metrics localhost:49312 \
    2>&1 | tee /app/cloudflared.log &
CF_PID=$!

# ── 5. Print tunnel URL once detected ───────────────────────────────────
echo "[entry] waiting for tunnel URL..."
for i in $(seq 1 30); do
    URL=$(grep -oP 'https://[^\s]+\.trycloudflare\.com' /app/cloudflared.log 2>/dev/null | head -1)
    if [ -n "$URL" ]; then
        echo ""
        echo "=============================================="
        echo "  TUNNEL URL: $URL"
        echo "=============================================="
        echo ""
        echo "Set this as your Worker secret:"
        echo "  npx wrangler secret put WUZAPI_URL"
        echo "  npm run deploy"
        echo ""
        break
    fi
    sleep 1
done

# ── 6. Monitor all processes ────────────────────────────────────────────
cleanup() {
    echo "[entry] shutting down..."
    kill $CF_PID 2>/dev/null || true
    kill $RELAY_PID 2>/dev/null || true
    kill $WUZAPI_PID 2>/dev/null || true
    wait
    echo "[entry] done"
}

trap cleanup SIGTERM SIGINT

# Wait for any process to exit
wait -n $WUZAPI_PID $RELAY_PID $CF_PID 2>/dev/null || true
cleanup
