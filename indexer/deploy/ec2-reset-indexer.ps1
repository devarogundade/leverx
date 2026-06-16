# Reset EC2 indexer Postgres and resync from FIRST_CHECKPOINT in deploy-testnet.env.
param(
  [string]$Ec2Host = "100.26.3.7",
  [string]$User = "ubuntu",
  [string]$Key = "$env:USERPROFILE\.ssh\leverx-indexer-key.pem"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$DeployEnv = Join-Path $Root "contracts\deploy-testnet.env"
$RemoteScript = Join-Path $PSScriptRoot "ec2-reset-indexer-remote.sh"

if (-not (Test-Path $DeployEnv)) { throw "missing $DeployEnv" }
if (-not (Test-Path $Key)) { throw "missing SSH key $Key" }

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30")
$target = "${User}@${Ec2Host}"

Write-Host "Syncing deploy-testnet.env..."
& scp @ssh $DeployEnv "${target}:/tmp/deploy-testnet.env"
& scp @ssh $RemoteScript "${target}:/tmp/ec2-reset-indexer-remote.sh"
$migrations = Join-Path $PSScriptRoot "ec2-apply-indexer-migrations.sh"
& scp @ssh $migrations "${target}:/tmp/ec2-apply-indexer-migrations.sh"
& scp @ssh (Join-Path $PSScriptRoot "ec2-reload-nginx-remote.sh") "${target}:/tmp/ec2-reload-nginx-remote.sh"

Write-Host "Resetting indexer on EC2 (wipe DB, rebuild, sync from publish checkpoint)..."
& ssh @ssh $target "chmod +x /tmp/ec2-reset-indexer-remote.sh && bash /tmp/ec2-reset-indexer-remote.sh"
Write-Host "Done."
