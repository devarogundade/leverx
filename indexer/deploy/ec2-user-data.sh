#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y docker.io docker-compose-v2 git curl
systemctl enable docker
systemctl start docker

usermod -aG docker ubuntu || true

mkdir -p /opt/leverx
chown ubuntu:ubuntu /opt/leverx

cat >/etc/systemd/system/leverx-indexer.service <<'UNIT'
[Unit]
Description=LeverX indexer stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=ubuntu
WorkingDirectory=/opt/leverx
ExecStart=/usr/bin/docker compose -f indexer/docker-compose.ec2.yml up -d --build
ExecStop=/usr/bin/docker compose -f indexer/docker-compose.ec2.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable leverx-indexer.service
