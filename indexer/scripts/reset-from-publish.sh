#!/usr/bin/env bash
# Wipe indexer Postgres, rebuild, and start from the fresh publish checkpoint.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/indexer/docker-compose.ec2.yml}"
DEPLOY_ENV="${ROOT}/contracts/deploy-testnet.env"

read_deploy_var() {
  local key="$1"
  local fallback="${2:-}"
  if [[ -f "${DEPLOY_ENV}" ]]; then
    local value
    value="$(grep -E "^${key}=" "${DEPLOY_ENV}" | tail -1 | cut -d= -f2- || true)"
    if [[ -n "${value}" ]]; then
      echo "${value}"
      return
    fi
  fi
  echo "${fallback}"
}

CHECKPOINT="${FIRST_CHECKPOINT:-$(read_deploy_var FIRST_CHECKPOINT 348266507)}"

cd "${ROOT}"
if command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose -f "${COMPOSE_FILE}")
elif docker compose version >/dev/null 2>&1; then
  DC=(docker compose -f "${COMPOSE_FILE}")
else
  echo "docker compose not found" >&2
  exit 1
fi

EXPECTED_REGISTRY="${LEVERX_REGISTRY_ID:-}"
if [[ -z "${EXPECTED_REGISTRY}" && -f "${DEPLOY_ENV}" ]]; then
  EXPECTED_REGISTRY="$(grep -E '^LEVERX_REGISTRY_ID=' "${DEPLOY_ENV}" | cut -d= -f2- || true)"
fi

echo "Stopping stack and removing Postgres volume..."
"${DC[@]}" down -v

echo "Building and starting indexer from checkpoint ${CHECKPOINT}..."
FIRST_CHECKPOINT="${CHECKPOINT}" "${DC[@]}" up -d --build

echo "Waiting for API health..."
for _ in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:3100/health" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

if [[ -z "${EXPECTED_REGISTRY}" ]]; then
  echo "LEVERX_REGISTRY_ID not set — skipping protocol poll (run deploy_and_share first)."
  curl -sf "http://127.0.0.1:3100/health" && echo
  exit 0
fi

echo "Polling /v1/protocol until fresh deploy is indexed..."
for _ in $(seq 1 120); do
  if body="$(curl -sf "http://127.0.0.1:3100/v1/protocol" 2>/dev/null)"; then
    if echo "${body}" | grep -q "${EXPECTED_REGISTRY}"; then
      echo "${body}" | python3 -m json.tool
      echo "Indexer protocol_settings matches fresh deploy."
      exit 0
    fi
  fi
  sleep 5
done

echo "Timed out waiting for protocol_settings. Check indexer logs:" >&2
"${DC[@]}" logs --tail=80 indexer
exit 1
