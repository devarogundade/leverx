#!/usr/bin/env bash
set -euo pipefail

HOST="${EC2_HOST:-100.26.3.7}"
USER="${EC2_USER:-ubuntu}"
KEY="${HOME}/.ssh/leverx-indexer-key.pem"

if [[ -f /mnt/c/Users/devar/.ssh/leverx-indexer-key.pem ]]; then
  mkdir -p "${HOME}/.ssh"
  cp /mnt/c/Users/devar/.ssh/leverx-indexer-key.pem "${KEY}"
fi
chmod 600 "${KEY}" 2>/dev/null || true

ssh -i "${KEY}" -o StrictHostKeyChecking=no "${USER}@${HOST}" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/leverx

echo "=== Pulling latest keeper image ==="
docker pull devarogundade/leverx-keeper:latest

KEEPER_KEY="$(docker inspect leverx-keeper --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^KEEPER_PRIVATE_KEY=' || true)"
if [[ -z "${KEEPER_KEY}" ]]; then
  echo "ERROR: leverx-keeper not found or missing KEEPER_PRIVATE_KEY" >&2
  exit 1
fi

ENV_FILE="$(mktemp)"
{
  echo "${KEEPER_KEY}"
  echo "INDEXER_URL=http://host.docker.internal:3100"
  grep -E '^(LEVERX_PACKAGE_ID|LEVERX_REGISTRY_ID|LEVERX_VAULT_ID|LEVERX_FEE_COLLECTOR_ID|PREDICT_PACKAGE_ID|PREDICT_ID|QUOTE_TYPE)=' \
    /opt/leverx/contracts/deploy-testnet.env
} > "${ENV_FILE}"

docker stop leverx-keeper 2>/dev/null || true
docker rm leverx-keeper 2>/dev/null || true
docker run -d \
  --name leverx-keeper \
  --restart unless-stopped \
  -p 3001:3001 \
  --add-host=host.docker.internal:host-gateway \
  --env-file "${ENV_FILE}" \
  devarogundade/leverx-keeper:latest
rm -f "${ENV_FILE}"

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/health >/dev/null; then
    echo "Keeper healthy"
    break
  fi
  sleep 2
done

docker images devarogundade/leverx-keeper:latest --format 'image={{.Repository}}:{{.Tag}} id={{.ID}} created={{.CreatedSince}}'
curl -sf http://127.0.0.1:3001/health/status | python3 -m json.tool | head -20
REMOTE
