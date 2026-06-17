#!/usr/bin/env bash
set -euo pipefail
PRIMARY_URL="${1:-https://fullnode.testnet.sui.io:443}"
FALLBACK_URL="${2:-}"
ENV_FILE="/opt/leverx/keeper/.env"

set_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    echo "${key}=${value}" >> "${ENV_FILE}"
  fi
}

set_env SUI_RPC_URL "${PRIMARY_URL}"
if [[ -n "${FALLBACK_URL}" ]]; then
  set_env SUI_RPC_FALLBACK_URL "${FALLBACK_URL}"
fi

cd /opt/leverx/keeper
docker compose -f docker-compose.ec2.yml up -d --force-recreate keeper
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/health >/dev/null; then
    echo "Keeper healthy"
    break
  fi
  sleep 2
done
docker inspect leverx-keeper --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^SUI_RPC'
