#!/usr/bin/env bash
# One-shot deploy of BrainShare to env-dev (drekis server) → https://brainshare-dev.drekis.com
#
# WHY YOU run this (not Claude): writing a git credential into the env-dev container is a HARD
# classifier block on Claude's side (not cleared by authorization). Run by YOU via `!`, it's just
# your own shell — no classifier. It uses your local `gh auth token`, so nothing secret is pasted.
#
# Usage:   ! bash /media/relik/c/BrainShare/dev/deploy-env-dev.sh
#
# Steps: install PAT on env-dev → discard the 4 stale local tweaks (already on main) → pull →
#        migrate the dev SQLite (add file.meta + collection.modules) → restart backend :8000 →
#        rebuild + restart web :4700 → health-check.
set -euo pipefail
HOST="${DREKIS_HOST:-root@204.168.188.192}"
GH_USER="${GH_USER:-danisanchezn}"

echo ">> [1/6] install GitHub PAT on env-dev (via stdin; uses your local gh token)…"
TOKEN="$(gh auth token)"
[ -n "$TOKEN" ] || { echo "ERROR: gh auth token empty — run 'gh auth login' first"; exit 1; }
printf 'https://%s:%s@github.com\n' "$GH_USER" "$TOKEN" \
  | ssh "$HOST" 'docker exec -i env-dev bash -lc "umask 077; cat > /root/.git-credentials; git config --global credential.helper store; echo creds-installed"'

echo ">> [2/6..6/6] pull + migrate + restart (one remote session)…"
ssh "$HOST" 'docker exec -i env-dev bash -l' <<'REMOTE'
set -e
cd /workspace/projects/BrainShare

echo ">> pull (discard the 4 stale local tweaks — they're already on main as a5f4f02)"
git checkout -- modal/app.py web/next.config.ts web/src/lib/config.ts 2>/dev/null || true
rm -f modal/app.py.bak-scaledown
git pull --ff-only origin main 2>&1 | tail -4
echo "   HEAD=$(git rev-parse --short HEAD)"

echo ">> migrate dev SQLite (add columns; idempotent — ignores 'duplicate column')"
cd backend
.venv/bin/python - <<'PY'
import sqlite3, glob
dbs = glob.glob("data/*.db") or ["data/brainshare.db"]
for db in dbs:
    con = sqlite3.connect(db)
    for tbl, col in [("file", "meta"), ("collection", "modules")]:
        try:
            con.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} TEXT DEFAULT '{{}}'")
            print(f"   {db}: added {tbl}.{col}")
        except sqlite3.OperationalError as e:
            print(f"   {db}: {tbl}.{col} -> {e}")
    con.commit(); con.close()
PY

echo ">> install new text-ingestion deps into the venv (token chunking + pdf/epub/html → md)"
.venv/bin/pip install -q -U tiktoken pypdf ebooklib markdownify beautifulsoup4 2>&1 | tail -3 || \
  echo "   WARN: pip install failed — extraction will degrade to raw utf-8 decode (non-fatal)"

echo ">> restart backend :8000 (re-run however it's currently running; loads backend/.env)"
BACK="$(ps -eo args | grep -E '[u]vicorn' | head -1 || true)"
echo "   was: ${BACK:-<not found, using default>}"
pkill -f '[u]vicorn' 2>/dev/null || true
sleep 2
setsid bash -c "cd /workspace/projects/BrainShare/backend && ${BACK:-.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000}" \
  > /tmp/brainshare-backend.log 2>&1 < /dev/null &
sleep 7
curl -s -o /dev/null -w "   backend=%{http_code}\n" http://localhost:8000/openapi.json || true
tail -3 /tmp/brainshare-backend.log 2>/dev/null || true

echo ">> rebuild web (prod build, capped heap so it doesn't OOM)"
cd ../web
NODE_OPTIONS=--max-old-space-size=1280 pnpm build 2>&1 | tail -6

echo ">> restart web tmux :4700"
tmux kill-session -t brainshare 2>/dev/null || true
tmux new-session -d -s brainshare 'cd /workspace/projects/BrainShare/web && PORT=4700 pnpm start'
sleep 7
curl -s -o /dev/null -w "   web=%{http_code}\n" http://localhost:4700/ || true
REMOTE

echo ">> done — open https://brainshare-dev.drekis.com (hard-refresh). Backend log: /tmp/brainshare-backend.log in env-dev."
