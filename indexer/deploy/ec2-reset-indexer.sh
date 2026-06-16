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
scp -i "${KEY}" -o StrictHostKeyChecking=no "$(dirname "$0")/ec2-reset-indexer-remote.sh" "${USER}@${HOST}:/tmp/ec2-reset-indexer-remote.sh"
scp -i "${KEY}" -o StrictHostKeyChecking=no "$(dirname "$0")/ec2-apply-indexer-migrations.sh" "${USER}@${HOST}:/tmp/ec2-apply-indexer-migrations.sh"

echo "Resetting indexer (down -v, rebuild, checkpoint from deploy-testnet.env)..."
ssh -i "${KEY}" -o StrictHostKeyChecking=no "${USER}@${HOST}" "chmod +x /tmp/ec2-reset-indexer-remote.sh && bash /tmp/ec2-reset-indexer-remote.sh"

echo "Done."
