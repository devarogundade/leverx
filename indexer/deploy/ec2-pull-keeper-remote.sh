#!/usr/bin/env bash
# Runs on EC2 — invoked by indexer/deploy/ec2-pull-keeper.sh
set -euo pipefail
cd /opt/leverx
mkdir -p keeper
mv /tmp/docker-compose.ec2.yml /opt/leverx/keeper/docker-compose.ec2.yml

DEPLOY_ENV="/opt/leverx/contracts/deploy-testnet.env"
if [[ ! -f "${DEPLOY_ENV}" ]]; then
  echo "ERROR: missing ${DEPLOY_ENV}" >&2
  exit 1
fi

env_val() {
  local key="$1"
  docker inspect leverx-keeper --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | grep "^${key}=" \
    | head -1 \
    | cut -d= -f2- \
    || true
}

file_val() {
  local key="$1"
  local file="$2"
  [[ -f "${file}" ]] || return 0
  grep "^${key}=" "${file}" 2>/dev/null | head -1 | cut -d= -f2- || true
}

pick_env() {
  local key="$1"
  local from_container from_file from_local
  from_container="$(env_val "${key}")"
  from_file="$(file_val "${key}" /opt/leverx/keeper/.env)"
  from_local="$(file_val "${key}" /tmp/keeper-env.local)"
  if [[ -n "${from_file}" ]]; then
    printf '%s' "${from_file}"
  elif [[ -n "${from_container}" ]]; then
    printf '%s' "${from_container}"
  elif [[ -n "${from_local}" ]]; then
    printf '%s' "${from_local}"
  fi
}

KEEPER_PRIVATE_KEY="$(pick_env KEEPER_PRIVATE_KEY)"
if [[ -z "${KEEPER_PRIVATE_KEY}" ]]; then
  echo "ERROR: KEEPER_PRIVATE_KEY not found on EC2 (old container or /opt/leverx/keeper/.env)" >&2
  exit 1
fi

ENV_FILE="/opt/leverx/keeper/.env"
{
  echo "KEEPER_PRIVATE_KEY=${KEEPER_PRIVATE_KEY}"
  for key in KEEPER_API_KEY ENOKI_SECRET_KEY ENOKI_NETWORK \
    TELEGRAM_ENABLED TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_POLLING; do
    value="$(pick_env "${key}")"
    [[ -n "${value}" ]] && echo "${key}=${value}"
  done
  echo "SUI_RPC_URL=https://fullnode.testnet.sui.io:443"
  echo "PREDICT_SERVER_URL=https://predict-server.testnet.mystenlabs.com"
  grep -E '^(LEVERX_PACKAGE_ID|LEVERX_REGISTRY_ID|LEVERX_VAULT_ID|LEVERX_FEE_COLLECTOR_ID|PREDICT_PACKAGE_ID|PREDICT_ID|QUOTE_TYPE)=' \
    "${DEPLOY_ENV}"
} > "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
rm -f /tmp/keeper-env.local

docker stop leverx-keeper 2>/dev/null || true
docker rm leverx-keeper 2>/dev/null || true

echo "=== Pulling latest keeper image ==="
docker pull devarogundade/leverx-keeper:latest

echo "=== Starting keeper stack (redis + postgres + keeper) ==="
cd /opt/leverx/keeper
docker compose -f docker-compose.ec2.yml up -d

echo "=== Waiting for keeper health ==="
for _ in $(seq 1 45); do
  if curl -sf http://127.0.0.1:3001/health >/dev/null; then
    echo "Keeper healthy"
    break
  fi
  sleep 2
done

docker ps --filter name=leverx-keeper --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker images devarogundade/leverx-keeper:latest --format 'image={{.Repository}}:{{.Tag}} id={{.ID}} created={{.CreatedSince}}'

if curl -sf http://127.0.0.1:3001/health/status >/dev/null; then
  curl -sf http://127.0.0.1:3001/health/status | python3 -m json.tool | head -25
else
  echo "WARN: keeper /health/status not ready — recent logs:" >&2
  docker logs leverx-keeper --tail 30 >&2 || true
  exit 1
fi

if ! grep -q '^ENOKI_SECRET_KEY=' "${ENV_FILE}"; then
  echo "NOTE: ENOKI_SECRET_KEY not set in ${ENV_FILE} — Google gas sponsorship via /gas/sponsor will be unavailable."
fi
