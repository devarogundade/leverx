#!/bin/bash
# Wipe indexer Postgres and resync from FIRST_CHECKPOINT (publish tx).
# Run on EC2 from repo root: bash indexer/deploy/reset-and-resync.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "Stopping stack and deleting postgres volume..."
docker compose -f indexer/docker-compose.ec2.yml down -v

echo "Building indexer (no cache)..."
docker compose -f indexer/docker-compose.ec2.yml build --no-cache

echo "Starting fresh sync..."
docker compose -f indexer/docker-compose.ec2.yml up -d

echo "Waiting for health..."
for i in $(seq 1 120); do
  if curl -sf http://127.0.0.1:3100/health >/dev/null; then
    echo "Indexer healthy."
    docker compose -f indexer/docker-compose.ec2.yml ps
    exit 0
  fi
  sleep 5
done

echo "Health check timed out — check logs: docker compose -f indexer/docker-compose.ec2.yml logs --tail=50"
exit 1
