#!/bin/bash
# Install nginx + certbot and wire indexer.suileverx.xyz → localhost:3100 (REST + WS).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOMAIN="indexer.suileverx.xyz"
EMAIL="${CERTBOT_EMAIL:-admin@suileverx.xyz}"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

mkdir -p /var/www/certbot
rm -f /etc/nginx/sites-enabled/default

cp "$DEPLOY_DIR/nginx/indexer.suileverx.xyz.http.conf" \
  /etc/nginx/sites-available/indexer.suileverx.xyz.conf
ln -sf /etc/nginx/sites-available/indexer.suileverx.xyz.conf \
  /etc/nginx/sites-enabled/indexer.suileverx.xyz.conf

nginx -t
systemctl enable nginx
systemctl restart nginx

if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
  certbot certonly --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive
fi

cp "$DEPLOY_DIR/nginx/indexer.suileverx.xyz.https.conf" \
  /etc/nginx/sites-available/indexer.suileverx.xyz.conf
nginx -t
systemctl reload nginx

# Auto-renew (certbot.timer is installed with the package)
systemctl enable certbot.timer
systemctl start certbot.timer

echo "Done: https://$DOMAIN/health"
curl -sf "https://$DOMAIN/health" || echo "health check pending — indexer may still be starting"
