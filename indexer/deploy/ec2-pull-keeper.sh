#!/usr/bin/env bash
# Pull latest keeper image on EC2 and run with Redis + Postgres (docker-compose.ec2.yml).
set -euo pipefail

HOST="${EC2_HOST:-100.26.3.7}"
USER="${EC2_USER:-ubuntu}"
KEY="${EC2_KEY:-$HOME/.ssh/leverx-indexer-key.pem}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_SRC="${ROOT}/keeper/docker-compose.ec2.yml"

if [[ -f /mnt/c/Users/devar/.ssh/leverx-indexer-key.pem ]]; then
  mkdir -p "${HOME}/.ssh"
  KEY="${HOME}/.ssh/leverx-indexer-key.pem"
  cp /mnt/c/Users/devar/.ssh/leverx-indexer-key.pem "${KEY}"
fi
chmod 600 "${KEY}" 2>/dev/null || true

if [[ ! -f "${COMPOSE_SRC}" ]]; then
  echo "missing ${COMPOSE_SRC}" >&2
  exit 1
fi

echo "Uploading keeper/docker-compose.ec2.yml..."
scp -i "${KEY}" -o StrictHostKeyChecking=no "${COMPOSE_SRC}" "${USER}@${HOST}:/tmp/docker-compose.ec2.yml"
scp -i "${KEY}" -o StrictHostKeyChecking=no "$(dirname "$0")/ec2-pull-keeper-remote.sh" "${USER}@${HOST}:/tmp/ec2-pull-keeper-remote.sh"

LOCAL_ENV="${ROOT}/keeper/.env"
if [[ -f "${LOCAL_ENV}" ]]; then
  echo "Uploading local keeper/.env for secret merge (ENOKI, Telegram, …)..."
  scp -i "${KEY}" -o StrictHostKeyChecking=no "${LOCAL_ENV}" "${USER}@${HOST}:/tmp/keeper-env.local"
fi

ssh -i "${KEY}" -o StrictHostKeyChecking=no "${USER}@${HOST}" "chmod +x /tmp/ec2-pull-keeper-remote.sh && bash /tmp/ec2-pull-keeper-remote.sh"

echo "Done."
