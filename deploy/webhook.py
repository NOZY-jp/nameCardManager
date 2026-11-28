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
import ipaddress
import json
import os
import pathlib
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE_DIR = pathlib.Path(os.environ.get("STATE_DIR") or pathlib.Path.home() / "namecard-deploy")
SECRET_FILE = pathlib.Path(os.environ.get("WEBHOOK_SECRET_FILE") or STATE_DIR / "webhook.secret")
DEPLOY_SCRIPT = pathlib.Path(os.environ.get("DEPLOY_SCRIPT") or STATE_DIR / "deploy.sh")
HOST = os.environ.get("WEBHOOK_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEBHOOK_PORT", "8791"))
HOOK_PATH = os.environ.get("WEBHOOK_PATH", "/hook")
BRANCH_REF = os.environ.get("DEPLOY_REF", "refs/heads/main")
REPO_SLUG = os.environ.get("REPO_SLUG", "NOZY-jp/nameCardManager")
# GitHub の webhook 送信元 IP レンジ（https://api.github.com/meta の hooks）。
# Secret を GitHub 側に登録していない場合、このレンジからの送信だけを受理する。
GITHUB_META_URL = "https://api.github.com/meta"
IP_CACHE = STATE_DIR / "github-hooks-ips.json"
IP_CACHE_TTL = 3600
_ip_cache: tuple[float, list] = (0.0, [])
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


def github_hook_networks() -> list:
    """GitHub の webhook 送信元レンジ。取得に失敗したら空（=無署名は拒否）。"""
    global _ip_cache
    now = time.time()
    cached_at, networks = _ip_cache
    if networks and now - cached_at < IP_CACHE_TTL:
        return networks

    payload = None
    try:
        request = urllib.request.Request(
            GITHUB_META_URL, headers={"Accept": "application/vnd.github+json"}
        )
        with urllib.request.urlopen(request, timeout=8) as response:  # noqa: S310
            payload = json.load(response)
    except Exception as exc:  # noqa: BLE001 - fall back to the on-disk cache
        log(f"github meta fetch failed: {exc}")
        try:
            payload = json.loads(IP_CACHE.read_text(encoding="utf-8"))
        except Exception:
            return []

    networks = []
    for cidr in payload.get("hooks") or []:
        try:
            networks.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError:
            continue
    if networks:
        _ip_cache = (now, networks)
        try:
            IP_CACHE.write_text(json.dumps(payload), encoding="utf-8")
        except OSError:
            pass
    return networks


def from_github(client_ip: str) -> bool:
    try:
        address = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    return any(address in network for network in github_hook_networks())



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
        client_ip = self.headers.get("CF-Connecting-IP") or self.client_address[0]
        signature = self.headers.get("X-Hub-Signature-256")
        if signature:
            # 通常経路: GitHub 側に Secret を登録してあれば HMAC で判定
            authorized = verify(signature, body)
            mode = "hmac"
        else:
            # Secret 未登録の経路: GitHub の webhook 送信元 IP だけを受理
            authorized = from_github(client_ip)
            mode = "github-ip"
        if not authorized:
            log(f"rejected ({mode}) from {client_ip}")
            self._send(403, {"error": "not authorized"})
            return

        event = self.headers.get("X-GitHub-Event", "")
        try:
            payload = json.loads(body or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "invalid json"})
            return

        repo = (payload.get("repository") or {}).get("full_name")
        if repo and repo != REPO_SLUG:
            log(f"rejected: unexpected repository {repo}")
            self._send(403, {"error": "unexpected repository"})
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
        log(f"accepted push ({mode}): {sha[:8]} by {payload.get('pusher', {}).get('name', '?')}")
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
