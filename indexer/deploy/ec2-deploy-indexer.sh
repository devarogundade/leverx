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
scp -i "${KEY}" -o StrictHostKeyChecking=no \
  "${ROOT}/indexer/deploy/ec2-apply-indexer-migrations.sh" \
  "${USER}@${HOST}:/tmp/ec2-apply-indexer-migrations.sh"
scp -i "${KEY}" -o StrictHostKeyChecking=no \
  "${ROOT}/indexer/deploy/ec2-reload-nginx-remote.sh" \
  "${USER}@${HOST}:/tmp/ec2-reload-nginx-remote.sh"
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
if [[ -f /tmp/ec2-apply-indexer-migrations.sh ]]; then
  bash /tmp/ec2-apply-indexer-migrations.sh
fi
EXPECTED_REGISTRY="$(grep -E '^LEVERX_REGISTRY_ID=' contracts/deploy-testnet.env | tail -1 | cut -d= -f2- || true)"
if [[ -n "${EXPECTED_REGISTRY}" ]]; then
  echo "Polling /v1/protocol until fresh deploy is indexed..."
  for _ in $(seq 1 120); do
    if body="$(curl -sf http://127.0.0.1:3100/v1/protocol 2>/dev/null)"; then
      if echo "${body}" | grep -q "${EXPECTED_REGISTRY}"; then
        echo "${body}" | python3 -m json.tool
        echo "Indexer protocol_settings matches fresh deploy."
        break
      fi
    fi
    sleep 5
  done
fi
if [[ -f /tmp/ec2-reload-nginx-remote.sh ]]; then
  chmod +x /tmp/ec2-reload-nginx-remote.sh
  bash /tmp/ec2-reload-nginx-remote.sh
fi
REMOTE

echo "Done."
