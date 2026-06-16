#!/usr/bin/env bash
# Sync local indexer source to EC2, rebuild Docker image, and resync from publish checkpoint.
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
TAR="/tmp/leverx-indexer-$$.tar.gz"

if [[ ! -f "${DEPLOY_ENV}" ]]; then
  echo "missing ${DEPLOY_ENV}" >&2
  exit 1
fi

chmod 600 "${KEY}" 2>/dev/null || true

echo "Packing indexer + deploy-testnet.env..."
tar -czf "${TAR}" -C "${ROOT}" \
  --exclude="indexer/target" \
  --exclude="indexer/node_modules" \
  indexer contracts/deploy-testnet.env

echo "Uploading to ${USER}@${HOST}..."
scp -i "${KEY}" -o StrictHostKeyChecking=no "${TAR}" "${USER}@${HOST}:/tmp/leverx-indexer.tar.gz"
rm -f "${TAR}"

echo "Extracting and rebuilding on EC2..."
ssh -i "${KEY}" -o StrictHostKeyChecking=no "${USER}@${HOST}" bash -s <<'REMOTE'
set -euo pipefail
sudo rm -rf /opt/leverx
sudo mkdir -p /opt/leverx
sudo tar -xzf /tmp/leverx-indexer.tar.gz -C /opt/leverx
sudo chown -R ubuntu:ubuntu /opt/leverx
mkdir -p /opt/leverx/contracts
mv /opt/leverx/deploy-testnet.env /opt/leverx/contracts/deploy-testnet.env 2>/dev/null || true
cd /opt/leverx
bash indexer/deploy/reset-and-resync.sh
REMOTE

echo "Done."
