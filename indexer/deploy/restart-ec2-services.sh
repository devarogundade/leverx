#!/usr/bin/env bash
# Rebuild indexer + restart keeper on EC2 (keeps Postgres volume).
set -euo pipefail

cd /opt/leverx

echo "=== Rebuilding indexer ==="
docker compose -f indexer/docker-compose.ec2.yml up -d --build

echo "=== Waiting for indexer health ==="
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3100/health >/dev/null; then
    echo "Indexer healthy"
    break
  fi
  sleep 5
done
curl -sf http://127.0.0.1:3100/health
echo
curl -sf http://127.0.0.1:3100/v1/protocol | python3 -m json.tool | head -15

echo "=== Restarting keeper ==="
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
curl -sf http://127.0.0.1:3001/health/status | python3 -m json.tool
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
