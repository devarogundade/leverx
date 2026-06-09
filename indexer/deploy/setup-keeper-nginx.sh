#!/bin/bash
# Wire keeper.suileverx.xyz → localhost:3001 (TLS via certbot).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOMAIN="keeper.suileverx.xyz"
EMAIL="${CERTBOT_EMAIL:-admin@suileverx.xyz}"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

mkdir -p /var/www/certbot

cp "$DEPLOY_DIR/nginx/keeper.suileverx.xyz.http.conf" \
  /etc/nginx/sites-available/keeper.suileverx.xyz.conf
ln -sf /etc/nginx/sites-available/keeper.suileverx.xyz.conf \
  /etc/nginx/sites-enabled/keeper.suileverx.xyz.conf

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

cp "$DEPLOY_DIR/nginx/keeper.suileverx.xyz.https.conf" \
  /etc/nginx/sites-available/keeper.suileverx.xyz.conf
nginx -t
systemctl reload nginx

systemctl enable certbot.timer
systemctl start certbot.timer

echo "Done: https://$DOMAIN/health"
curl -sf "https://$DOMAIN/health" || echo "health check pending — keeper may still be starting"
