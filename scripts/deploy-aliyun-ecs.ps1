param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [Parameter(Mandatory = $true)]
  [string]$User,

  [string]$KeyPath = "",

  [string]$RemoteDir = "/www/grit-learning-habits"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$archive = Join-Path $env:TEMP "grit-learning-habits.tar"
$remoteArchive = "/tmp/grit-learning-habits.tar"
$target = "$User@$HostName"

Push-Location $root
try {
  git archive --format=tar --output=$archive HEAD

  $sshOptions = @()
  if ($KeyPath) {
    $sshOptions += @("-i", $KeyPath)
  }
  $sshOptions += @("-o", "StrictHostKeyChecking=accept-new")

  scp @sshOptions $archive "${target}:${remoteArchive}"

  $remoteScript = @"
set -e
sudo mkdir -p "$RemoteDir"
sudo chown -R `$USER:`$USER "$RemoteDir"
tar -xf "$remoteArchive" -C "$RemoteDir"
cd "$RemoteDir"
if [ ! -f .env ]; then cp .env.example .env; fi
npm ci
npm run db:init
npm run build
if ! command -v pm2 >/dev/null 2>&1; then npm install -g pm2; fi
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
"@

  $remoteScript | ssh @sshOptions $target "bash -s"
  Write-Host "Deployed: http://${HostName}:3000/"
  Write-Host "Admin:    http://${HostName}:3000/admin"
}
finally {
  Pop-Location
}
