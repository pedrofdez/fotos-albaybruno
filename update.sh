#!/usr/bin/env bash
# FOTOS ALBA & BRUNO — update script
# Run on the server after pulling new code to sync and restart
# Usage: sudo bash update.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/opt/fotos-albaybruno"
APP_USER="fotos-albaybruno"

echo "==> Syncing code to $APP_DIR"
rsync -a --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '*.db' \
  --exclude '*.db-wal' \
  --exclude '*.db-shm' \
  --exclude '.env' \
  --exclude 'local.env' \
  "$SRC_DIR/" "$APP_DIR/"

echo "==> Installing dependencies"
cd "$APP_DIR"
npm ci --omit=dev

echo "==> Fixing permissions"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Restarting service"
systemctl restart fotos-albaybruno

echo ""
echo "Done. Status:"
systemctl status fotos-albaybruno --no-pager
