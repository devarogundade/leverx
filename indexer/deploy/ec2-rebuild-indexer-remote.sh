#!/usr/bin/env bash
# Rebuild and restart indexer containers without wiping Postgres.
set -euo pipefail
ROOT="${LEVERX_ROOT:-/opt/leverx}"
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

echo "Building indexer image..."
"${COMPOSE[@]}" -f "$COMPOSE_FILE" build --no-cache

echo "Restarting indexer stack (keeping postgres volume)..."
"${COMPOSE[@]}" -f "$COMPOSE_FILE" up -d --force-recreate

if [[ -f /tmp/ec2-apply-indexer-migrations.sh ]]; then
  echo "Applying schema/data repairs..."
  bash /tmp/ec2-apply-indexer-migrations.sh
fi

echo "Waiting for health..."
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3100/health >/dev/null; then
    echo "Indexer healthy."
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" ps
    exit 0
  fi
  sleep 5
done

echo "Health check timed out." >&2
exit 1
