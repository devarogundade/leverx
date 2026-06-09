#!/bin/bash
# Wipe indexer Postgres and resync from FIRST_CHECKPOINT (publish tx).
# Run on EC2 from repo root: bash indexer/deploy/reset-and-resync.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif docker-compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose not found" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  COMPOSE=(sudo "${COMPOSE[@]}")
fi

COMPOSE_FILE=indexer/docker-compose.ec2.yml

echo "Stopping stack and deleting postgres volume..."
"${COMPOSE[@]}" -f "$COMPOSE_FILE" down -v

echo "Building indexer (no cache)..."
"${COMPOSE[@]}" -f "$COMPOSE_FILE" build --no-cache

echo "Starting fresh sync from FIRST_CHECKPOINT..."
"${COMPOSE[@]}" -f "$COMPOSE_FILE" up -d

echo "Waiting for health..."
for i in $(seq 1 120); do
  if curl -sf http://127.0.0.1:3100/health >/dev/null; then
    echo "Indexer healthy."
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" ps
    exit 0
  fi
  sleep 5
done

echo "Health check timed out — check logs: ${COMPOSE[*]} -f $COMPOSE_FILE logs --tail=50"
exit 1
