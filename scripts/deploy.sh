#!/usr/bin/env bash
# Deploy the jewelry inventory system to the Hetzner VPS
# behind https://cosmondshop.duckdns.org.
#
# Prerequisites:
#   - SSH key at ~/.ssh/deploy_cosmondshop that is authorized on the server
#   - Production .env exists on the server at /opt/jewelry/.env
#
# Usage:
#   ./scripts/deploy.sh              # full deploy (rsync + build + reload)
#   ./scripts/deploy.sh --fast       # skip pnpm install (use when deps unchanged)
#   ./scripts/deploy.sh --restart    # just pm2 restart (no rebuild)
#
set -euo pipefail

HOST="root@178.104.42.34"
SSH_KEY="$HOME/.ssh/deploy_cosmondshop"
SSH_OPTS="-o StrictHostKeyChecking=no -i $SSH_KEY"
REMOTE_DIR="/opt/jewelry"
MODE="${1:-full}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "✗ SSH key not found: $SSH_KEY" >&2
  exit 1
fi

echo "▶ Deploying to $HOST ($MODE mode)"

# ---------- 1. rsync source ----------
if [[ "$MODE" != "--restart" ]]; then
  echo "▶ rsync…"
  rsync -az \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='dist' \
    --exclude='.turbo' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='*.log' \
    --exclude='coverage' \
    --exclude='*.tsbuildinfo' \
    --exclude='packages/db/docs/mdb-analysis' \
    --exclude='mdb-migration-errors-*.json' \
    -e "ssh $SSH_OPTS" \
    ./ "$HOST:$REMOTE_DIR/"
fi

# ---------- 2. install + build + reload ----------
if [[ "$MODE" == "--restart" ]]; then
  ssh $SSH_OPTS "$HOST" "cd $REMOTE_DIR && pm2 reload all"
else
  INSTALL_STEP=""
  if [[ "$MODE" != "--fast" ]]; then
    INSTALL_STEP="pnpm install --prefer-offline 2>&1 | tail -3 && pnpm db:generate 2>&1 | tail -2 &&"
  fi
  ssh $SSH_OPTS "$HOST" bash -s << REMOTE
set -euo pipefail
cd $REMOTE_DIR
export PATH="/usr/local/lib/node_modules/pnpm/bin:\$PATH"

$INSTALL_STEP \
  pnpm --filter @jewelry/db build 2>&1 | tail -3 && \
  pnpm --filter @jewelry/api build 2>&1 | tail -3 && \
  pnpm --filter @jewelry/web build 2>&1 | tail -5

pm2 reload all
sleep 3
pm2 status | grep -E "jewelry|id"
REMOTE
fi

# ---------- 3. smoke test ----------
echo "▶ smoke test…"
echo -n "  api /health:  "
curl -fsS https://cosmondshop.duckdns.org/health || echo "✗ FAIL"
echo ""
for path in "/" "/login" "/dashboard/imports" "/dashboard/pricing" "/dashboard/labels" "/dashboard/pos"; do
  code=$(curl -fsS -o /dev/null -w "%{http_code}" "https://cosmondshop.duckdns.org$path" || true)
  printf "  %s → %s\n" "$path" "$code"
done

echo "✓ Done"
