#!/bin/bash
# Self-healing launcher for BrainShare inside env-dev.
# Usage: serve.sh web   |   serve.sh backend
# Relaunches the process if it dies, and (web) re-registers the gateway route
# on every (re)start so a SIGTERM/crash never leaves a stale 404.
set -u
ROOT=/workspace/projects/BrainShare

run_web() {
  cd "$ROOT/web" || exit 1
  while true; do
    PORT=4700 pnpm start &
    pid=$!
    # wait until it answers, then (re)register the route
    for _ in $(seq 1 60); do
      curl -sf -m 2 http://127.0.0.1:4700/ >/dev/null 2>&1 && break
      sleep 1
    done
    out=$(api deploy up --name brainshare --port 4700 2>&1) \
      && echo "[serve] web up on :4700, route registered" \
      || { echo "$out" | grep -q "already exists" \
             && echo "[serve] route already registered" \
             || echo "[serve] WARN: deploy register failed: $out"; }
    wait $pid
    echo "[serve] web exited (code $?), restarting in 2s"
    sleep 2
  done
}

run_backend() {
  cd "$ROOT/backend" || exit 1
  while true; do
    .venv/bin/uvicorn app.main:app --port 8000
    echo "[serve] backend exited (code $?), restarting in 2s"
    sleep 2
  done
}

case "${1:-}" in
  web)     run_web ;;
  backend) run_backend ;;
  *) echo "usage: serve.sh web|backend"; exit 2 ;;
esac
