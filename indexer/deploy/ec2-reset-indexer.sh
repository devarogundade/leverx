#!/usr/bin/env bash
# Sync deploy-testnet.env and reset indexer Postgres on EC2 from WSL/local.
set -euo pipefail

HOST="${EC2_HOST:-100.26.3.7}"
USER="${EC2_USER:-ubuntu}"
KEY="${EC2_KEY:-$HOME/.ssh/leverx-indexer-key.pem}"

if [[ -f /mnt/c/Users/devar/.ssh/leverx-indexer-key.pem ]]; then
  mkdir -p "${HOME}/.ssh"
  KEY="${HOME}/.ssh/leverx-indexer-key.pem"
  cp /mnt/c/Users/devar/.ssh/leverx-indexer-key.pem "${KEY}"
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_ENV="${ROOT}/contracts/deploy-testnet.env"

if [[ ! -f "${DEPLOY_ENV}" ]]; then
  echo "missing ${DEPLOY_ENV}" >&2
  exit 1
fi

chmod 600 "${KEY}" 2>/dev/null || true
echo "Syncing deploy-testnet.env to ${USER}@${HOST}..."
scp -i "${KEY}" -o StrictHostKeyChecking=no "${DEPLOY_ENV}" "${USER}@${HOST}:/tmp/deploy-testnet.env"

echo "Resetting indexer (down -v, rebuild, checkpoint from deploy-testnet.env)..."
ssh -i "${KEY}" -o StrictHostKeyChecking=no "${USER}@${HOST}" bash -s <<'REMOTE'
set -euo pipefail
sudo mv /tmp/deploy-testnet.env /opt/leverx/contracts/deploy-testnet.env
cd /opt/leverx

CHECKPOINT="$(grep -E '^FIRST_CHECKPOINT=' contracts/deploy-testnet.env | tail -1 | cut -d= -f2-)"
EXPECTED_REGISTRY="$(grep -E '^LEVERX_REGISTRY_ID=' contracts/deploy-testnet.env | tail -1 | cut -d= -f2-)"

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose -f indexer/docker-compose.ec2.yml)
elif docker-compose version >/dev/null 2>&1; then
  DC=(docker-compose -f indexer/docker-compose.ec2.yml)
else
  echo "docker compose not found" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  DC=(sudo "${DC[@]}")
fi

echo "Stopping stack and removing Postgres volume..."
"${DC[@]}" down -v

echo "Building and starting indexer from checkpoint ${CHECKPOINT}..."
FIRST_CHECKPOINT="${CHECKPOINT}" "${DC[@]}" up -d --build

echo "Waiting for API health..."
for _ in $(seq 1 120); do
  if curl -sf http://127.0.0.1:3100/health >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
curl -sf http://127.0.0.1:3100/health
echo

if [[ -z "${EXPECTED_REGISTRY}" ]]; then
  echo "LEVERX_REGISTRY_ID not set - skipping protocol poll."
  exit 0
fi

echo "Polling /v1/protocol until fresh deploy is indexed..."
for _ in $(seq 1 120); do
  if body="$(curl -sf http://127.0.0.1:3100/v1/protocol 2>/dev/null)"; then
    if echo "${body}" | grep -q "${EXPECTED_REGISTRY}"; then
      echo "${body}" | python3 -m json.tool
      echo "Indexer protocol_settings matches fresh deploy."
      exit 0
    fi
  fi
  sleep 5
done

echo "Timed out waiting for protocol_settings." >&2
"${DC[@]}" logs --tail=80 indexer
exit 1
REMOTE

echo "Done."
