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
cd /opt/leverx/keeper
if [[ -f docker-compose.ec2.yml ]]; then
  docker pull devarogundade/leverx-keeper:latest
  docker compose -f docker-compose.ec2.yml up -d
else
  echo "WARN: /opt/leverx/keeper/docker-compose.ec2.yml missing — run indexer/deploy/ec2-pull-keeper.sh from your machine" >&2
  exit 1
fi

for _ in $(seq 1 45); do
  if curl -sf http://127.0.0.1:3001/health >/dev/null; then
    echo "Keeper healthy"
    break
  fi
  sleep 2
done
curl -sf http://127.0.0.1:3001/health/status | python3 -m json.tool
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
