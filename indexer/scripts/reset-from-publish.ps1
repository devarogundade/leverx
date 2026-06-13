# Wipe indexer Postgres, rebuild, and start from contracts/deploy-testnet.env checkpoint.
# Usage: .\indexer\scripts\reset-from-publish.ps1

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ComposeFile = Join-Path $Root "indexer\docker-compose.ec2.yml"
$DeployEnv = Join-Path $Root "contracts\deploy-testnet.env"

function Read-DeployVar([string]$Key, [string]$Fallback = "") {
    if (Test-Path $DeployEnv) {
        $line = Select-String -Path $DeployEnv -Pattern "^$Key=" | Select-Object -Last 1
        if ($line) { return $line.Line.Split("=", 2)[1] }
    }
    return $Fallback
}

$Checkpoint = if ($env:FIRST_CHECKPOINT) { $env:FIRST_CHECKPOINT } else { Read-DeployVar "FIRST_CHECKPOINT" "347610477" }
$ExpectedRegistry = if ($env:LEVERX_REGISTRY_ID) { $env:LEVERX_REGISTRY_ID } else { Read-DeployVar "LEVERX_REGISTRY_ID" }

Push-Location $Root
try {
    Write-Host "Stopping stack and removing Postgres volume..."
    docker compose -f $ComposeFile down -v

    Write-Host "Building and starting indexer from checkpoint $Checkpoint..."
    $env:FIRST_CHECKPOINT = $Checkpoint
    docker compose -f $ComposeFile up -d --build

    Write-Host "Waiting for API health..."
    $healthy = $false
    for ($i = 0; $i -lt 120; $i++) {
        try {
            Invoke-WebRequest -Uri "http://127.0.0.1:3100/health" -UseBasicParsing -TimeoutSec 3 | Out-Null
            $healthy = $true
            break
        } catch {
            Start-Sleep -Seconds 5
        }
    }
    if (-not $healthy) { throw "Indexer health check timed out" }

    if (-not $ExpectedRegistry) {
        Write-Host "LEVERX_REGISTRY_ID not set — skipping protocol poll."
        exit 0
    }

    Write-Host "Polling /v1/protocol until fresh deploy is indexed..."
    for ($i = 0; $i -lt 120; $i++) {
        try {
            $body = (Invoke-WebRequest -Uri "http://127.0.0.1:3100/v1/protocol" -UseBasicParsing -TimeoutSec 5).Content
            if ($body -match $ExpectedRegistry) {
                Write-Host $body
                Write-Host "Indexer protocol_settings matches fresh deploy."
                exit 0
            }
        } catch {}
        Start-Sleep -Seconds 5
    }

    throw "Timed out waiting for protocol_settings. Check: docker compose -f indexer/docker-compose.ec2.yml logs --tail=80 indexer"
} finally {
    Pop-Location
}
