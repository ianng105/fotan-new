"""relay.py — Webhook relay for incoming WhatsApp messages.

WuzAPI POSTs incoming messages to this server, which forwards them to the
Cloudflare Worker at WUZAPI_URL (set via Wrangler secret).
"""

import hashlib
import hmac
import json
import os
import sys
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── config ──────────────────────────────────────────────────────────────
LISTEN_HOST = os.getenv("RELAY_HOST", "0.0.0.0")
LISTEN_PORT = int(os.getenv("RELAY_PORT", "3100"))

# Worker URL (for forwarding webhooks) — set via env or use default
WORKER_URL = os.getenv(
    "RELAY_FORWARD_URL",
    "https://ai-caseylai-whatsapp-wuzapi.ai-caseylai-whatsapp-wuzapi.workers.dev"
).rstrip("/")

# HMAC secret shared with wuzapi
HMAC_KEY = os.getenv("WUZAPI_GLOBAL_HMAC_KEY", "my_hmac_key_32_chars_minimum_12345")


def verify_hmac(body: bytes, signature: str) -> bool:
    """Verify the X-Hub-SHA256 signature from wuzapi."""
    if not signature:
        return False
    expected = hmac.new(HMAC_KEY.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def forward_to_worker(payload: dict) -> bool:
    """POST the incoming message to the Cloudflare Worker."""
    if not WORKER_URL:
        print("[relay] WUZAPI_URL not set — cannot forward message", file=sys.stderr)
        return False

    url = f"{WORKER_URL}/api/incoming-message"
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"[relay] forwarded to Worker → {resp.status}")
            return resp.status in (200, 201, 202)
    except urllib.error.HTTPError as e:
        print(f"[relay] Worker returned {e.code}: {e.read().decode(errors='ignore')[:300]}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[relay] failed to reach Worker: {e}", file=sys.stderr)
        return False


class RelayHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        signature = self.headers.get("X-Hub-SHA256", "")
        if not verify_hmac(body, signature):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{"error":"invalid signature"}')
            return

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error":"invalid json"}')
            return

        print(f"[relay] received webhook: {json.dumps(payload, indent=2, ensure_ascii=False)[:500]}")
        # Debug: dump raw body if it contains non-ASCII
        if any(b > 127 for b in body):
            print(f"[relay] raw body hex (first 200 bytes): {body[:200].hex()}", flush=True)

        ok = forward_to_worker(payload)

        self.send_response(200 if ok else 502)
        self.end_headers()
        self.wfile.write(
            b'{"ok":true}' if ok else b'{"error":"forward failed"}'
        )

    def do_GET(self):
        """Health check endpoint."""
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok","service":"relay"}\n')

    def log_message(self, format, *args):
        """Suppress default http.server logging."""
        pass


def main():
    server = HTTPServer((LISTEN_HOST, LISTEN_PORT), RelayHandler)
    print(f"[relay] listening on {LISTEN_HOST}:{LISTEN_PORT}")
    print(f"[relay] forwarding to Worker: {WORKER_URL or '(not set)'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[relay] shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
