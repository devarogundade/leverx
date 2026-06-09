# Launch (or reuse) an EC2 instance and deploy the LeverX indexer stack.
# Requires: AWS CLI configured, OpenSSH client.
#
# Usage:
#   .\indexer\deploy\deploy-ec2.ps1
#   .\indexer\deploy\deploy-ec2.ps1 -InstanceId i-0123456789abcdef0

param(
    [string]$InstanceName = "leverx-indexer",
    [string]$InstanceType = "t3.large",
    [string]$KeyName = "leverx-indexer-key",
    [string]$Region = "us-east-1",
    [string]$VpcId = "vpc-0b70101a4bdd023bf",
    [string]$SubnetId = "subnet-050d437f38d8f4a54",
    [string]$AmiId = "ami-0fbcf351e82d18381",
    [string]$InstanceId = "",
    [switch]$ForceNew,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$KeyPath = Join-Path $env:USERPROFILE ".ssh\$KeyName.pem"
$SgName = "leverx-indexer-sg"

function Format-PemKey([string]$Raw) {
    $text = $Raw -replace '\\n', "`n"
    if ($text -match "`n") { return $text.TrimEnd() + "`n" }
    $body = $text -replace '-----BEGIN RSA PRIVATE KEY-----', '' -replace '-----END RSA PRIVATE KEY-----', '' -replace '\s', ''
    $lines = @('-----BEGIN RSA PRIVATE KEY-----')
    for ($i = 0; $i -lt $body.Length; $i += 64) {
        $lines += $body.Substring($i, [Math]::Min(64, $body.Length - $i))
    }
    $lines += '-----END RSA PRIVATE KEY-----'
    return ($lines -join "`n") + "`n"
}

function Ensure-KeyPair {
    if ((Test-Path $KeyPath) -and -not $ForceNew) { return }
    if ($ForceNew) {
        if (Test-Path $KeyPath) {
            icacls $KeyPath /grant:r "$($env:USERNAME):(F)" 2>$null | Out-Null
            Remove-Item -Force $KeyPath
        }
        aws ec2 delete-key-pair --key-name $KeyName 2>$null | Out-Null
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $KeyPath) | Out-Null
    $resp = aws ec2 create-key-pair --key-name $KeyName --query KeyMaterial --output text
    if (-not $resp) { throw "Failed to create key pair $KeyName" }
    Set-Content -Path $KeyPath -Value (Format-PemKey $resp) -NoNewline -Encoding ascii
    icacls $KeyPath /inheritance:r | Out-Null
    icacls $KeyPath /grant:r "$($env:USERNAME):(R)" | Out-Null
    Write-Host "Created key pair: $KeyPath"
}

function Remove-ExistingInstances {
    $ids = aws ec2 describe-instances `
        --filters "Name=tag:Name,Values=$InstanceName" `
        --query "Reservations[].Instances[?State.Name!='terminated'].InstanceId" `
        --output text
    if (-not $ids -or $ids -eq "None") { return }
    foreach ($id in ($ids -split '\s+')) {
        if (-not $id) { continue }
        Write-Host "Terminating $id..."
        aws ec2 terminate-instances --instance-ids $id | Out-Null
        aws ec2 wait instance-terminated --instance-ids $id
    }
}

function Ensure-SecurityGroup {
    $existing = aws ec2 describe-security-groups --filters "Name=group-name,Values=$SgName" "Name=vpc-id,Values=$VpcId" --query "SecurityGroups[0].GroupId" --output text
    if ($existing -and $existing -ne "None") {
        foreach ($port in @(80, 443)) {
            aws ec2 authorize-security-group-ingress --group-id $existing --protocol tcp --port $port --cidr 0.0.0.0/0 2>$null | Out-Null
        }
        return $existing
    }

    $sg = aws ec2 create-security-group --group-name $SgName --description "LeverX indexer API + SSH" --vpc-id $VpcId --query GroupId --output text
    foreach ($port in @(22, 80, 443, 3100, 9184)) {
        aws ec2 authorize-security-group-ingress --group-id $sg --protocol tcp --port $port --cidr 0.0.0.0/0 | Out-Null
    }
    Write-Host "Created security group: $sg"
    return $sg
}

function Get-Or-Launch-Instance([string]$SecurityGroupId) {
    if ($InstanceId) {
        $state = aws ec2 describe-instances --instance-ids $InstanceId --query "Reservations[0].Instances[0].State.Name" --output text
        if ($state -ne "running") { throw "Instance $InstanceId is $state" }
        return $InstanceId
    }

    $existing = aws ec2 describe-instances `
        --filters "Name=tag:Name,Values=$InstanceName" "Name=instance-state-name,Values=running,pending,stopped" `
        --query "Reservations[0].Instances[0].InstanceId" --output text
    if ($existing -and $existing -ne "None") {
        Write-Host "Reusing instance $existing"
        if ((aws ec2 describe-instances --instance-ids $existing --query "Reservations[0].Instances[0].State.Name" --output text) -eq "stopped") {
            aws ec2 start-instances --instance-ids $existing | Out-Null
            aws ec2 wait instance-running --instance-ids $existing
        }
        return $existing
    }

    $userDataPath = Join-Path $PSScriptRoot "ec2-user-data.sh"
    $userData = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content $userDataPath -Raw)))

    $newId = aws ec2 run-instances `
        --image-id $AmiId `
        --instance-type $InstanceType `
        --key-name $KeyName `
        --subnet-id $SubnetId `
        --security-group-ids $SecurityGroupId `
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$InstanceName}]" `
        --user-data $userData `
        --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=80,VolumeType=gp3,DeleteOnTermination=true}" `
        --query "Instances[0].InstanceId" --output text

    Write-Host "Launched instance $newId"
    aws ec2 wait instance-running --instance-ids $newId
    return $newId
}

function Wait-Ssh([string]$HostIp) {
    Write-Host "Waiting for SSH on $HostIp..."
    for ($i = 0; $i -lt 90; $i++) {
        $ping = Test-Connection -ComputerName $HostIp -Count 1 -Quiet
        if ($ping) {
            $sshTest = ssh -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=5 ubuntu@$HostIp "echo ok" 2>$null
            if ($LASTEXITCODE -eq 0) { return }
        }
        Start-Sleep -Seconds 10
    }
    throw "SSH not ready on $HostIp"
}

function Sync-Repo([string]$HostIp) {
    Write-Host "Syncing repo to /opt/leverx..."
    $tar = Join-Path $env:TEMP "leverx-indexer.tar.gz"
    if (Test-Path $tar) { Remove-Item $tar -Force }
    tar -czf $tar -C $RepoRoot --exclude="indexer/target" --exclude="indexer/node_modules" indexer contracts/deploy-testnet.env
    scp -i $KeyPath -o StrictHostKeyChecking=no $tar ubuntu@${HostIp}:/tmp/leverx-indexer.tar.gz
    ssh -i $KeyPath -o StrictHostKeyChecking=no ubuntu@$HostIp @"
set -e
sudo rm -rf /opt/leverx
sudo mkdir -p /opt/leverx
sudo tar -xzf /tmp/leverx-indexer.tar.gz -C /opt/leverx
sudo chown -R ubuntu:ubuntu /opt/leverx
mkdir -p /opt/leverx/contracts
mv /opt/leverx/deploy-testnet.env /opt/leverx/contracts/deploy-testnet.env 2>/dev/null || true
cd /opt/leverx
sudo docker compose -f indexer/docker-compose.ec2.yml up -d --build
sudo docker compose -f indexer/docker-compose.ec2.yml ps
"@
}

if ($ForceNew) { Remove-ExistingInstances }
Ensure-KeyPair
$sgId = Ensure-SecurityGroup
if ($ForceNew) { $InstanceId = "" }
$id = Get-Or-Launch-Instance $sgId
$publicIp = aws ec2 describe-instances --instance-ids $id --query "Reservations[0].Instances[0].PublicIpAddress" --output text
Wait-Ssh $publicIp
if (-not $SkipDeploy) { Sync-Repo $publicIp }

Write-Host ""
Write-Host "LeverX indexer deployed."
Write-Host "  Instance: $id"
Write-Host "  Public IP: $publicIp"
Write-Host "  API:       http://${publicIp}:3100/health"
Write-Host "  WebSocket: ws://${publicIp}:3100/v1/ws"
Write-Host ""
Write-Host "Set in app .env:"
Write-Host "  VITE_LEVERX_INDEXER_URL=http://${publicIp}:3100"
Write-Host "  VITE_LEVERX_INDEXER_WS_URL=ws://${publicIp}:3100/v1/ws"
