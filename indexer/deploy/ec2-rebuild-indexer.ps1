# Sync indexer source to EC2, rebuild image, restart without wiping Postgres.
param(
  [string]$Ec2Host = "100.26.3.7",
  [string]$User = "ubuntu",
  [string]$Key = "$env:USERPROFILE\.ssh\leverx-indexer-key.pem"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Tar = Join-Path $env:TEMP "leverx-indexer-$PID.tar.gz"

if (-not (Test-Path $Key)) { throw "missing SSH key $Key" }

Write-Host "Packing indexer source..."
tar -czf $Tar -C $Root --exclude=indexer/target --exclude=indexer/node_modules indexer contracts/deploy-testnet.env

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30")
$target = "${User}@${Ec2Host}"

Write-Host "Uploading to EC2..."
& scp @ssh $Tar "${target}:/tmp/leverx-indexer.tar.gz"
Remove-Item $Tar -Force
& scp @ssh (Join-Path $PSScriptRoot "ec2-rebuild-indexer-remote.sh") "${target}:/tmp/ec2-rebuild-indexer-remote.sh"
& scp @ssh (Join-Path $PSScriptRoot "ec2-apply-indexer-migrations.sh") "${target}:/tmp/ec2-apply-indexer-migrations.sh"

Write-Host "Rebuilding indexer on EC2 (postgres volume preserved)..."
& ssh @ssh $target "set -euo pipefail; sudo mkdir -p /opt/leverx/contracts; sudo tar -xzf /tmp/leverx-indexer.tar.gz -C /opt/leverx; sudo chown -R ubuntu:ubuntu /opt/leverx; if [ -f /opt/leverx/deploy-testnet.env ]; then mv /opt/leverx/deploy-testnet.env /opt/leverx/contracts/deploy-testnet.env; fi; cd /opt/leverx; chmod +x /tmp/ec2-rebuild-indexer-remote.sh; bash /tmp/ec2-rebuild-indexer-remote.sh"

Write-Host "Done."
