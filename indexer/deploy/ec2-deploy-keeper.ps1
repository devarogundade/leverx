# Sync keeper source to EC2, rebuild image, and restart the stack.
param(
  [string]$Ec2Host = "100.26.3.7",
  [string]$User = "ubuntu",
  [string]$Key = "$env:USERPROFILE\.ssh\leverx-indexer-key.pem"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Keeper = Join-Path $Root "keeper"
$Tar = Join-Path $env:TEMP "leverx-keeper-$PID.tar.gz"

if (-not (Test-Path $Keeper)) { throw "missing $Keeper" }
if (-not (Test-Path $Key)) { throw "missing SSH key $Key" }

Write-Host "Packing keeper source..."
tar -czf $Tar -C $Keeper --exclude=node_modules --exclude=dist .

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30")
$target = "${User}@${Ec2Host}"

Write-Host "Uploading to EC2..."
& scp @ssh $Tar "${target}:/tmp/leverx-keeper-src.tar.gz"
Remove-Item $Tar -Force

$Remote = Join-Path $PSScriptRoot "ec2-deploy-keeper-remote.sh"
& scp @ssh $Remote "${target}:/tmp/ec2-deploy-keeper-remote.sh"
& scp @ssh (Join-Path $PSScriptRoot "ec2-pull-keeper-remote.sh") "${target}:/tmp/ec2-pull-keeper-remote.sh"
& scp @ssh (Join-Path $PSScriptRoot "ec2-apply-indexer-migrations.sh") "${target}:/tmp/ec2-apply-indexer-migrations.sh"
& scp @ssh (Join-Path $Root "keeper\docker-compose.ec2.yml") "${target}:/tmp/docker-compose.ec2.yml"
& scp @ssh (Join-Path $Root "contracts\deploy-testnet.env") "${target}:/tmp/deploy-testnet.env"

$LocalEnv = Join-Path $Root "keeper\.env"
if (Test-Path $LocalEnv) {
  Write-Host "Uploading local keeper/.env for secret merge..."
  & scp @ssh $LocalEnv "${target}:/tmp/keeper-env.local"
}

& scp @ssh (Join-Path $PSScriptRoot "ec2-reload-nginx-remote.sh") "${target}:/tmp/ec2-reload-nginx-remote.sh"

Write-Host "Building and restarting keeper on EC2..."
& ssh @ssh $target "chmod +x /tmp/ec2-deploy-keeper-remote.sh && bash /tmp/ec2-deploy-keeper-remote.sh"
Write-Host "Done."
