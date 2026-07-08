param(
  [string]$SshTarget = "root@47.99.236.88",
  [string]$RemoteDir = "/var/www/grit-learning-habits",
  [string]$Port = "3001"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Archive = Join-Path $env:TEMP "grit-learning-habits.tar.gz"
$RemoteScriptFile = Join-Path $env:TEMP "grit-learning-habits-deploy-remote.sh"
$RemoteArchive = "/tmp/grit-learning-habits.tar.gz"
$RemoteScriptPath = "/tmp/grit-learning-habits-deploy-remote.sh"

function Run($Command, $Arguments) {
  Write-Host ">" $Command $Arguments
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Set-Location $ProjectRoot

Run "npm" @("run", "typecheck")
Run "npm" @("run", "build")

if (Test-Path $Archive) {
  Remove-Item -LiteralPath $Archive -Force
}

Run "tar" @(
  "--exclude=.git",
  "--exclude=node_modules",
  "--exclude=.next",
  "--exclude=pages-dist",
  "--exclude=public/uploads",
  "--exclude=prisma/dev.db",
  "--exclude=prisma/dev.db-journal",
  "--exclude=.env",
  "--exclude=*.tar.gz",
  "--exclude=*.zip",
  "-czf",
  $Archive,
  "-C",
  $ProjectRoot,
  "."
)

Run "scp" @($Archive, "${SshTarget}:${RemoteArchive}")

$RemoteScript = @"
set -e
APP_DIR='$RemoteDir'
ARCHIVE='$RemoteArchive'
APP_PORT='$Port'
STAMP=`$(date +%Y%m%d%H%M%S)
BACKUP_DIR="/var/www/grit-learning-habits-deploy-backups/`$STAMP"

if [ "`$APP_DIR" != "/var/www/grit-learning-habits" ]; then
  echo "Unexpected APP_DIR: `$APP_DIR" >&2
  exit 1
fi

mkdir -p "`$APP_DIR" "`$BACKUP_DIR"

if [ -f "`$APP_DIR/.env" ]; then
  cp -a "`$APP_DIR/.env" "`$BACKUP_DIR/.env"
fi

if [ -f "`$APP_DIR/prisma/dev.db" ]; then
  mkdir -p "`$BACKUP_DIR/prisma"
  cp -a "`$APP_DIR/prisma/dev.db" "`$BACKUP_DIR/prisma/dev.db"
fi

if [ -d "`$APP_DIR/public/uploads" ]; then
  mkdir -p "`$BACKUP_DIR/public"
  cp -a "`$APP_DIR/public/uploads" "`$BACKUP_DIR/public/uploads"
fi

find "`$APP_DIR" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
tar -xzf "`$ARCHIVE" -C "`$APP_DIR"

if [ -f "`$BACKUP_DIR/.env" ]; then
  cp -a "`$BACKUP_DIR/.env" "`$APP_DIR/.env"
elif [ -f "`$APP_DIR/.env.example" ]; then
  cp "`$APP_DIR/.env.example" "`$APP_DIR/.env"
fi

if [ -f "`$BACKUP_DIR/prisma/dev.db" ]; then
  mkdir -p "`$APP_DIR/prisma"
  cp -a "`$BACKUP_DIR/prisma/dev.db" "`$APP_DIR/prisma/dev.db"
fi

if [ -d "`$BACKUP_DIR/public/uploads" ]; then
  mkdir -p "`$APP_DIR/public"
  cp -a "`$BACKUP_DIR/public/uploads" "`$APP_DIR/public/uploads"
fi

cd "`$APP_DIR"
npm ci
npm run db:init
npm run build
if ! command -v pm2 >/dev/null 2>&1; then npm install -g pm2; fi
PORT="`$APP_PORT" HOSTNAME=0.0.0.0 pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

check_url() {
  label="`$1"
  url="`$2"
  expected="`$3"
  code=""
  for i in `$(seq 1 20); do
    code=`$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "`$url" || true)
    if [ "`$code" = "`$expected" ]; then
      echo "`$label `$code"
      return 0
    fi
    sleep 1
  done
  echo "`$label `$code expected `$expected" >&2
  return 1
}

check_url "local node" "http://127.0.0.1:`$APP_PORT/" "200"
check_url "ip homepage" "http://47.99.236.88:`$APP_PORT/" "200"
"@

$RemoteScript = $RemoteScript -replace "`r`n", "`n" -replace "`r", "`n"
[System.IO.File]::WriteAllText($RemoteScriptFile, $RemoteScript, [System.Text.Encoding]::ASCII)

Run "scp" @($RemoteScriptFile, "${SshTarget}:${RemoteScriptPath}")
Run "ssh" @($SshTarget, "bash $RemoteScriptPath")

Write-Host ""
Write-Host "Deploy finished."
Write-Host "Online URL: http://47.99.236.88:${Port}/"
Write-Host "Admin URL:  http://47.99.236.88:${Port}/admin"
