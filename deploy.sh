#!/usr/bin/env bash
# FOTOS ALBA & BRUNO — one-command VPS deploy script
# Usage: sudo bash deploy.sh yourdomain.com
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/opt/fotos-albaybruno"
APP_USER="fotos-albaybruno"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash deploy.sh yourdomain.com"
  exit 1
fi

echo "==> Updating system packages"
apt-get update -qq
apt-get install -y -qq curl gnupg2

# ── 1. Node.js 22 LTS ──────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'console.log(+process.versions.node.split(".")[0])')" -lt 22 ]]; then
  echo "==> Installing Node.js 22 LTS"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node $(node -v) — npm $(npm -v)"

# ── 2. Caddy ───────────────────────────────────────────────
if ! command -v caddy &>/dev/null; then
  echo "==> Installing Caddy"
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y caddy
fi
echo "Caddy $(caddy version)"

# ── 3. App user ────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  echo "==> Creating system user: $APP_USER"
  useradd --system --no-create-home --shell /bin/false "$APP_USER"
fi

# ── 4. Copy app ────────────────────────────────────────────
echo "==> Copying app to $APP_DIR"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '*.db' \
  --exclude '*.db-wal' \
  --exclude '*.db-shm' \
  --exclude '.env' \
  --exclude 'local.env' \
  "$(dirname "$0")/" "$APP_DIR/"

# ── 5. Install deps ─────────────────────────────────────────
echo "==> Installing npm dependencies"
cd "$APP_DIR"
npm ci --omit=dev

# ── 6. Fix permissions ──────────────────────────────────────
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 7. Caddy config ─────────────────────────────────────────
echo "==> Writing Caddyfile"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:3000
}
EOF
systemctl reload caddy || systemctl restart caddy

# ── 8. systemd service ──────────────────────────────────────
echo "==> Installing systemd service"
cp "$APP_DIR/fotos-albaybruno.service" /etc/systemd/system/fotos-albaybruno.service
systemctl daemon-reload
systemctl enable fotos-albaybruno

echo ""
echo "============================================================"
echo "  FOTOS ALBA & BRUNO deployed to $APP_DIR"
echo "  Domain: https://$DOMAIN"
echo ""
echo "  Edit /etc/systemd/system/fotos-albaybruno.service to set:"
echo "    GOOGLE_CLIENT_ID    GOOGLE_CLIENT_SECRET"
echo "    SESSION_SECRET      AWS_ACCESS_KEY_ID"
echo "    AWS_SECRET_ACCESS_KEY  AWS_REGION  S3_BUCKET_NAME"
echo "    BASE_URL=https://$DOMAIN"
echo ""
echo "  Then start the service:"
echo "    sudo systemctl daemon-reload"
echo "    sudo systemctl start fotos-albaybruno"
echo "    sudo systemctl status fotos-albaybruno"
echo ""
echo "  Logs: sudo journalctl -u fotos-albaybruno -f"
echo "============================================================"
