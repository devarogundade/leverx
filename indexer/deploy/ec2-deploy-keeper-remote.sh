#!/usr/bin/env bash
set -euo pipefail

mkdir -p /opt/leverx/contracts /opt/leverx/keeper-src
if [[ -f /tmp/deploy-testnet.env ]]; then
  mv /tmp/deploy-testnet.env /opt/leverx/contracts/deploy-testnet.env
fi

tar -xzf /tmp/leverx-keeper-src.tar.gz -C /opt/leverx/keeper-src
rm -f /tmp/leverx-keeper-src.tar.gz

echo "=== Building keeper image on EC2 ==="
# Bust Docker layer cache so src changes always compile into the image.
date -Iseconds > /opt/leverx/keeper-src/.build-stamp
docker build -t devarogundade/leverx-keeper:latest /opt/leverx/keeper-src

echo "=== Refreshing keeper stack env + compose ==="
RESET_KEEPER="${RESET_KEEPER:-0}" SKIP_DOCKER_PULL=1 bash /tmp/ec2-pull-keeper-remote.sh

if [[ -f /tmp/ec2-reload-nginx-remote.sh ]]; then
  chmod +x /tmp/ec2-reload-nginx-remote.sh
  bash /tmp/ec2-reload-nginx-remote.sh
fi
