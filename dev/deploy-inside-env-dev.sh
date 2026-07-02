#!/usr/bin/env bash
# Deploy BrainShare IN PLACE — run this from a terminal that is ALREADY INSIDE the env-dev container
# (e.g. the integrated terminal in dev.drekis.com). No ssh/docker exec — you're already there.
#
# ── First, set the git credential ONCE (the PAT is a git credential, NOT an app .env value) ──
#   git config --global credential.helper store
#   printf 'https://danisanchezn:YOUR_PAT_HERE@github.com\n' > ~/.git-credentials && chmod 600 ~/.git-credentials
# (or pass the PAT as the first arg to this script and it does that for you)
#
# Then:  bash dev/deploy-inside-env-dev.sh            (credential already set)
#    or: bash dev/deploy-inside-env-dev.sh <PAT>      (sets the credential, then deploys)
set -e

if [ -n "${1:-}" ]; then
  git config --global credential.helper store
  printf 'https://danisanchezn:%s@github.com\n' "$1" > ~/.git-credentials
  chmod 600 ~/.git-credentials
  echo ">> git credential set"
fi

cd /workspace/projects/BrainShare

echo ">> pull (discard the 4 stale local tweaks — already on main as a5f4f02)"
git checkout -- modal/app.py web/next.config.ts web/src/lib/config.ts 2>/dev/null || true
rm -f modal/app.py.bak-scaledown
git pull --ff-only origin main 2>&1 | tail -4
echo "   HEAD=$(git rev-parse --short HEAD)"

echo ">> migrate dev SQLite (add file.meta + collection.modules; idempotent)"
cd backend
.venv/bin/python - <<'PY'
import sqlite3, glob
for db in (glob.glob("data/*.db") or ["data/brainshare.db"]):
    con = sqlite3.connect(db)
    for tbl, col in [("file", "meta"), ("collection", "modules")]:
        try:
            con.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} TEXT DEFAULT '{{}}'")
            print(f"   {db}: added {tbl}.{col}")
        except sqlite3.OperationalError as e:
            print(f"   {db}: {tbl}.{col} -> {e}")
    con.commit(); con.close()
PY

echo ">> restart backend :8000 (re-run it however it currently runs; loads backend/.env)"
BACK="$(ps -eo args | grep -E '[u]vicorn' | head -1 || true)"
echo "   was: ${BACK:-<not found, using default>}"
pkill -f '[u]vicorn' 2>/dev/null || true
sleep 2
setsid bash -c "cd /workspace/projects/BrainShare/backend && ${BACK:-.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000}" \
  > /tmp/brainshare-backend.log 2>&1 < /dev/null &
sleep 7
curl -s -o /dev/null -w "   backend=%{http_code}\n" http://localhost:8000/openapi.json || true
tail -3 /tmp/brainshare-backend.log 2>/dev/null || true

echo ">> rebuild web (capped heap so it doesn't OOM) + restart tmux :4700"
cd ../web
NODE_OPTIONS=--max-old-space-size=1280 pnpm build 2>&1 | tail -6
tmux kill-session -t brainshare 2>/dev/null || true
tmux new-session -d -s brainshare 'cd /workspace/projects/BrainShare/web && PORT=4700 pnpm start'
sleep 7
curl -s -o /dev/null -w "   web=%{http_code}\n" http://localhost:4700/ || true

echo ">> done — open https://brainshare-dev.drekis.com (hard-refresh)."
