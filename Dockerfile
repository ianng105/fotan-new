# ── WuzAPI + relay + cloudflared in one container ──────────────────────
# Uses the official asternic/wuzapi Docker image as base, then adds
# relay.py (webhook forwarder) and cloudflared (tunnel).
#
# Build:  docker compose build
# Run:    docker compose up -d
# Logs:   docker compose logs -f

FROM asternic/wuzapi:latest

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Hong_Kong

# ── Install Python + cloudflared ────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    python3 \
    python3-pip \
    && curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null \
    && echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared/ bookworm main" \
    | tee /etc/apt/sources.list.d/cloudflared.list \
    && apt-get update && apt-get install -y cloudflared \
    && rm -rf /var/lib/apt/lists/*

# ── Install Python dependencies ─────────────────────────────────────────
RUN pip3 install --no-cache-dir --break-system-packages \
    requests

# ── Copy app files ──────────────────────────────────────────────────────
COPY relay.py /app/relay.py
COPY wuzapi.env /app/wuzapi.env

WORKDIR /app

# ── Start script ────────────────────────────────────────────────────────
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080 3100

ENTRYPOINT ["/docker-entrypoint.sh"]
