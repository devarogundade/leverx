#!/usr/bin/env bash
set -euo pipefail

mkdir -p /opt/leverx/keeper-src
tar -xzf /tmp/leverx-keeper-src.tar.gz -C /opt/leverx/keeper-src
rm -f /tmp/leverx-keeper-src.tar.gz

echo "=== Building keeper image on EC2 ==="
docker build -t devarogundade/leverx-keeper:latest /opt/leverx/keeper-src

echo "=== Refreshing keeper stack env + compose ==="
bash /tmp/ec2-pull-keeper-remote.sh
