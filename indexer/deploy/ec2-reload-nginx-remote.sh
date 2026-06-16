#!/usr/bin/env bash
# Reload nginx configs for indexer (REST + WS) and keeper on EC2.
set -euo pipefail
DEPLOY_DIR="/opt/leverx/indexer/deploy"
if [[ ! -d "${DEPLOY_DIR}/nginx" ]]; then
  echo "missing ${DEPLOY_DIR}/nginx — run ec2-deploy-indexer.sh first" >&2
  exit 1
fi

for domain in indexer.suileverx.xyz keeper.suileverx.xyz; do
  conf="${DEPLOY_DIR}/nginx/${domain}.https.conf"
  if [[ -f "${conf}" ]]; then
    sudo cp "${conf}" "/etc/nginx/sites-available/${domain}.conf"
    sudo ln -sf "/etc/nginx/sites-available/${domain}.conf" \
      "/etc/nginx/sites-enabled/${domain}.conf"
    echo "Updated ${domain}"
  fi
done

sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
echo "Nginx reloaded."

curl -sf http://127.0.0.1:3100/health && echo " indexer OK"
curl -sf http://127.0.0.1:3001/health && echo " keeper OK"
