"""launcher.py — Start wuzapi + relay + cloudflared together.

Usage:
    python launcher.py                # start services
    python launcher.py --auto-deploy  # also deploy Worker when tunnel URL changes
"""

import hashlib
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WUZAPI_DIR = ROOT / "wuzapi"

# ── detect platform ─────────────────────────────────────────────────────
IS_WINDOWS = sys.platform == "win32"
EXE_SUFFIX = ".exe" if IS_WINDOWS else ""

WUZAPI_BIN = ROOT / f"wuzapi{EXE_SUFFIX}"
# Try project root first, then fall back to PATH (e.g. winget-installed cloudflared)
CLOUDFLARED_BIN = ROOT / f"cloudflared{EXE_SUFFIX}"
if not CLOUDFLARED_BIN.exists():
    _found = shutil.which("cloudflared") or shutil.which("cloudflared.exe")
    if _found:
        CLOUDFLARED_BIN = Path(_found)


def load_env(path: Path = ROOT / "wuzapi.env"):
    """Load wuzapi.env into os.environ."""
    if not path.exists():
        print(f"[launcher] WARNING: {path} not found — using defaults")
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, val = line.partition("=")
                os.environ[key.strip()] = val.strip()
    print(f"[launcher] loaded {path}")


def find_cloudflared_url(log_path: Path, timeout: float = 30.0) -> str | None:
    """Watch cloudflared log for the trycloudflare.com tunnel URL."""
    deadline = time.time() + timeout
    # wait for log file to appear
    while time.time() < deadline:
        if log_path.exists():
            break
        time.sleep(0.5)
    else:
        print("[launcher] cloudflared log never appeared", file=sys.stderr)
        return None

    last_pos = 0
    while time.time() < deadline:
        try:
            with open(log_path) as f:
                f.seek(last_pos)
                for line in f:
                    for prefix in (
                        "https://",
                        "trycloudflare.com",
                    ):
                        if prefix in line:
                            # extract full URL
                            import re
                            m = re.search(r"https://[^\s]+\.trycloudflare\.com", line)
                            if m:
                                return m.group(0)
                last_pos = f.tell()
        except FileNotFoundError:
            pass
        time.sleep(0.5)

    return None


def get_stored_tunnel_url(path: Path = WUZAPI_DIR / ".tunnel_url") -> str | None:
    if path.exists():
        return path.read_text().strip()
    return None


def store_tunnel_url(url: str, path: Path = WUZAPI_DIR / ".tunnel_url"):
    path.write_text(url + "\n")


def deploy_worker_if_needed(new_url: str):
    """Set Wrangler secret and deploy the Worker."""
    stored = get_stored_tunnel_url()
    if stored == new_url:
        print(f"[launcher] tunnel URL unchanged, skipping deploy")
        return

    print(f"[launcher] tunnel URL changed → deploying Worker...")
    print(f"  old: {stored}")
    print(f"  new: {new_url}")

    # Set secret
    subprocess.run(
        ["npx", "wrangler", "secret", "put", "WUZAPI_URL"],
        input=new_url + "\n",
        text=True,
        cwd=WUZAPI_DIR,
        check=False,
    )

    # Deploy
    subprocess.run(
        ["npm", "run", "deploy"],
        cwd=WUZAPI_DIR,
        check=False,
    )

    store_tunnel_url(new_url)
    print("[launcher] deploy complete")


def start_process(name: str, args: list[str], **kwargs) -> subprocess.Popen:
    print(f"[launcher] starting {name}: {' '.join(args)}")
    return subprocess.Popen(args, **kwargs)


def main():
    auto_deploy = "--auto-deploy" in sys.argv

    # Load env
    load_env()

    processes: list[subprocess.Popen] = []

    def shutdown(sig=None, frame=None):
        print("\n[launcher] shutting down...")
        for p in processes:
            try:
                p.terminate()
            except Exception:
                pass
        # wait up to 5 seconds
        for p in processes:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        print("[launcher] done")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # ── 1. Start wuzapi ─────────────────────────────────────────────────
    if not WUZAPI_BIN.exists():
        print(f"[launcher] ERROR: {WUZAPI_BIN} not found!", file=sys.stderr)
        print("  Download from: https://github.com/asternic/wuzapi/releases", file=sys.stderr)
        sys.exit(1)

    wuzapi_env = os.environ.copy()
    admintoken = os.getenv("WUZAPI_ADMIN_TOKEN", "my-admin-secret-token")
    wuzapi_args = [
        str(WUZAPI_BIN),
        "-admintoken", admintoken,
    ]
    processes.append(start_process("wuzapi", wuzapi_args, env=wuzapi_env))

    # ── 2. Start relay ──────────────────────────────────────────────────
    relay_py = ROOT / "relay.py"
    relay_args = [sys.executable, str(relay_py)]
    processes.append(start_process("relay", relay_args, env=os.environ.copy()))

    # Give wuzapi + relay a moment to bind
    time.sleep(1.5)

    # ── 3. Start cloudflared ────────────────────────────────────────────
    cloudflared_log = ROOT / "cloudflared.log"

    wuzapi_port = os.getenv("WUZAPI_PORT", "8080")
    cloudflared_args = [
        str(CLOUDFLARED_BIN),
        "tunnel",
        "--url", f"http://localhost:{wuzapi_port}",
        "--no-autoupdate",
    ]

    if CLOUDFLARED_BIN.exists():
        # cloudflared writes to stderr by default; capture to find URL
        cf_log_fp = open(cloudflared_log, "a")
        processes.append(start_process(
            "cloudflared",
            cloudflared_args,
            stderr=cf_log_fp,
            stdout=cf_log_fp,
        ))
    else:
        print(f"[launcher] WARNING: {CLOUDFLARED_BIN} not found — tunnel not started")
        print("  Download from: https://github.com/cloudflare/cloudflared/releases")
        print("  Or: winget install cloudflare.cloudflared")

    # ── 4. Monitor for tunnel URL (optional auto-deploy) ─────────────────
    if auto_deploy and CLOUDFLARED_BIN.exists():
        print("[launcher] waiting for cloudflared tunnel URL...")
        url = find_cloudflared_url(cloudflared_log)
        if url:
            print(f"[launcher] tunnel: {url}")
            deploy_worker_if_needed(url)
        else:
            print("[launcher] WARNING: could not detect tunnel URL in time")
    elif CLOUDFLARED_BIN.exists():
        print("[launcher] waiting for cloudflared tunnel...")
        url = find_cloudflared_url(cloudflared_log)
        if url:
            print(f"[launcher] tunnel: {url}")
            print(f"[launcher] To use this URL, run:")
            print(f"  npx wrangler secret put WUZAPI_URL")
            print(f"  npm run deploy")

    # ── 5. Keep running ─────────────────────────────────────────────────
    print("[launcher] all services started — Ctrl+C to stop")
    while True:
        for p in processes:
            if p.poll() is not None:
                print(f"[launcher] {p.args[0]} exited with code {p.returncode}")
                shutdown()
        time.sleep(2)


if __name__ == "__main__":
    main()
