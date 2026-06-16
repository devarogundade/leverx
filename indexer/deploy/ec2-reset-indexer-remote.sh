#!/usr/bin/env bash
# Runs on EC2 — invoked by indexer/deploy/ec2-reset-indexer.sh
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
