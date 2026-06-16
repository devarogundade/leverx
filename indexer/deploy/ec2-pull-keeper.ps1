# Pull latest keeper on EC2 (Redis + Postgres + keeper compose stack).
param(
  [string]$Ec2Host = "100.26.3.7",
  [string]$User = "ubuntu",
  [string]$Key = "$env:USERPROFILE\.ssh\leverx-indexer-key.pem"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ComposeSrc = Join-Path $Root "keeper\docker-compose.ec2.yml"
$RemoteScript = Join-Path $PSScriptRoot "ec2-pull-keeper-remote.sh"
$LocalEnv = Join-Path $Root "keeper\.env"

if (-not (Test-Path $ComposeSrc)) { throw "missing $ComposeSrc" }
if (-not (Test-Path $Key)) { throw "missing SSH key $Key" }

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30")
$target = "${User}@${Ec2Host}"

Write-Host "Uploading compose + remote script..."
& scp @ssh $ComposeSrc "${target}:/tmp/docker-compose.ec2.yml"
& scp @ssh $RemoteScript "${target}:/tmp/ec2-pull-keeper-remote.sh"

if (Test-Path $LocalEnv) {
  Write-Host "Uploading local keeper/.env for secret merge..."
  & scp @ssh $LocalEnv "${target}:/tmp/keeper-env.local"
}

Write-Host "Running deploy on EC2..."
& ssh @ssh $target "chmod +x /tmp/ec2-pull-keeper-remote.sh && bash /tmp/ec2-pull-keeper-remote.sh"
Write-Host "Done."
