#!/usr/bin/env python3
"""GitHub webhook receiver for the NameCard Manager deploy.

Receives GitHub `push` events (and `ping`), verifies the X-Hub-Signature-256
HMAC with the shared secret, and runs deploy.sh in the background.

Runs as a systemd --user service on nozyjp-server, bound to 127.0.0.1 so that
it is reachable only through the Cloudflare Tunnel ingress.

Endpoints:
  GET  /health -> 200 {"status":"ok"}
  POST /hook   -> GitHub webhook (ping / push on the deploy branch)

Standard library only.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import pathlib
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE_DIR = pathlib.Path(os.environ.get("STATE_DIR") or pathlib.Path.home() / "namecard-deploy")
SECRET_FILE = pathlib.Path(os.environ.get("WEBHOOK_SECRET_FILE") or STATE_DIR / "webhook.secret")
DEPLOY_SCRIPT = pathlib.Path(os.environ.get("DEPLOY_SCRIPT") or STATE_DIR / "deploy.sh")
HOST = os.environ.get("WEBHOOK_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEBHOOK_PORT", "8791"))
HOOK_PATH = os.environ.get("WEBHOOK_PATH", "/hook")
BRANCH_REF = os.environ.get("DEPLOY_REF", "refs/heads/main")
MAX_BODY = 2 * 1024 * 1024
LOG_FILE = STATE_DIR / "webhook.log"

_deploy_lock = threading.Lock()
_secret: bytes = b""


def log(message: str) -> None:
    import datetime

    line = f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {message}\n"
    sys.stderr.write(line)
    sys.stderr.flush()
    try:
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(line)
    except OSError:
        pass


def read_secret() -> bytes:
    if not SECRET_FILE.exists():
        log(f"fatal: secret file not found: {SECRET_FILE}")
        raise SystemExit(1)
    value = SECRET_FILE.read_text(encoding="utf-8").strip().encode()
    if len(value) < 16:
        log("fatal: webhook secret is too short")
        raise SystemExit(1)
    return value


def verify(signature_header: str | None, body: bytes) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(_secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.strip())


def run_deploy(sha: str) -> None:
    with _deploy_lock:
        log(f"deploy start: {sha[:8]}")
        try:
            result = subprocess.run(  # noqa: S603 - fixed local script path
                ["/bin/bash", str(DEPLOY_SCRIPT), sha],
                cwd=str(STATE_DIR),
                check=False,
                timeout=3600,
                capture_output=True,
                text=True,
            )
        except subprocess.TimeoutExpired:
            log("deploy timeout after 3600s")
            return
        except OSError as exc:
            log(f"deploy could not start: {exc}")
            return
        log(f"deploy finished: exit={result.returncode} sha={sha[:8]}")
        if result.returncode != 0 and result.stderr:
            log("deploy stderr tail: " + result.stderr[-800:])


class Handler(BaseHTTPRequestHandler):
    server_version = "namecard-deploy-hook"
    protocol_version = "HTTP/1.1"

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        if self.path.split("?")[0] == "/health":
            self._send(200, {"status": "ok"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        if self.path.split("?")[0] != HOOK_PATH:
            self._send(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send(400, {"error": "bad content-length"})
            return
        if length <= 0 or length > MAX_BODY:
            self._send(413, {"error": "bad body size"})
            return

        body = self.rfile.read(length)
        if not verify(self.headers.get("X-Hub-Signature-256"), body):
            log(f"rejected: bad signature from {self.client_address[0]}")
            self._send(403, {"error": "invalid signature"})
            return

        event = self.headers.get("X-GitHub-Event", "")
        try:
            payload = json.loads(body or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "invalid json"})
            return

        if event == "ping":
            log("ping received")
            self._send(200, {"status": "pong"})
            return

        if event != "push":
            self._send(202, {"status": "ignored", "event": event})
            return

        if payload.get("deleted"):
            self._send(202, {"status": "ignored", "reason": "branch deleted"})
            return
        if payload.get("ref") != BRANCH_REF:
            self._send(202, {"status": "ignored", "reason": f"ref {payload.get('ref')}"})
            return

        sha = payload.get("after") or ""
        if len(sha) != 40:
            self._send(400, {"error": "bad sha"})
            return

        if _deploy_lock.locked():
            # 実行中のデプロイが終わったら、最新の sha で追いかける必要はない:
            # 次の push で再度届く。ここでは記録だけ残す。
            log(f"deploy already running; queued signal ignored: {sha[:8]}")
            self._send(202, {"status": "busy", "sha": sha})
            return

        threading.Thread(target=run_deploy, args=(sha,), daemon=True).start()
        log(f"accepted push: {sha[:8]} by {payload.get('pusher', {}).get('name', '?')}")
        self._send(202, {"status": "queued", "sha": sha})

    def log_message(self, fmt: str, *args: object) -> None:  # keep journald quiet
        return


def main() -> None:
    global _secret
    _secret = read_secret()
    if not DEPLOY_SCRIPT.exists():
        log(f"fatal: deploy script not found: {DEPLOY_SCRIPT}")
        raise SystemExit(1)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log(f"listening on http://{HOST}:{PORT}{HOOK_PATH} (branch {BRANCH_REF})")
    server.serve_forever()


if __name__ == "__main__":
    main()
