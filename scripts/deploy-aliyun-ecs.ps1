param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "root",

  [Parameter(Mandatory = $true)]
  [string]$Domain,

  [Parameter(Mandatory = $true)]
  [string]$LetsEncryptEmail,

  [string]$KeyPath = "",

  [ValidateRange(1024, 65535)]
  [int]$Port = 3001,

  [string]$RemoteDir = "/var/www/grit-learning-habits"
)

$ErrorActionPreference = "Stop"

if ($HostName -notmatch '^[A-Za-z0-9.-]+$') {
  throw "HostName contains unsupported characters."
}

if ($User -notmatch '^[A-Za-z0-9._-]+$') {
  throw "User contains unsupported characters."
}

if ($Domain -notmatch '^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') {
  throw "Domain must be a complete hostname, for example study.example.com."
}

if ($LetsEncryptEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
  throw "LetsEncryptEmail is not a valid email address."
}

if ($RemoteDir -notmatch '^/var/www/grit-learning-habits(?:-[A-Za-z0-9._-]+)?$') {
  throw "RemoteDir must stay under /var/www and use the grit-learning-habits name."
}

if ($KeyPath -and -not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
  throw "SSH key not found: $KeyPath"
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $env:TEMP "grit-learning-habits-$stamp.tar.gz"
$remoteArchive = "/tmp/grit-learning-habits-$stamp.tar.gz"
$target = "$User@$HostName"

$sshOptions = @("-o", "StrictHostKeyChecking=accept-new")
if ($KeyPath) {
  $sshOptions += @("-i", $KeyPath)
}

function Run([string]$Command, [string[]]$Arguments) {
  Write-Host ">" $Command $Arguments
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Push-Location $root
try {
  Run "npm.cmd" @("run", "typecheck")
  Run "npm.cmd" @("run", "build")

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
    $archive,
    "-C",
    $root,
    "."
  )

  Run "scp" @($sshOptions + @($archive, "${target}:${remoteArchive}"))

  $remoteScript = @'
set -euo pipefail

APP_ROOT="__REMOTE_DIR__"
APP_PORT="__PORT__"
APP_DOMAIN="__DOMAIN__"
LE_EMAIL="__EMAIL__"
ARCHIVE="__ARCHIVE__"
STAMP="__STAMP__"
RELEASE="$APP_ROOT/releases/$STAMP"
SHARED="$APP_ROOT/shared"
CURRENT="$APP_ROOT/current"
BACKUP="$APP_ROOT/backups/releases/$STAMP"

case "$APP_ROOT" in
  /var/www/grit-learning-habits|/var/www/grit-learning-habits-*) ;;
  *)
    echo "Unexpected APP_ROOT: $APP_ROOT" >&2
    exit 1
    ;;
esac

mkdir -p "$RELEASE" "$SHARED/prisma" "$SHARED/public/uploads" "$BACKUP"
tar -xzf "$ARCHIVE" -C "$RELEASE"

if [ ! -f "$SHARED/.env" ]; then
  if [ -f "$APP_ROOT/.env" ]; then
    cp -a "$APP_ROOT/.env" "$SHARED/.env"
  else
    cp "$RELEASE/.env.example" "$SHARED/.env"
  fi
fi

if [ ! -f "$SHARED/prisma/dev.db" ]; then
  if [ -f "$APP_ROOT/prisma/dev.db" ]; then
    cp -a "$APP_ROOT/prisma/dev.db" "$SHARED/prisma/dev.db"
  else
    touch "$SHARED/prisma/dev.db"
  fi
fi

if [ -d "$APP_ROOT/public/uploads" ] && [ -z "$(find "$SHARED/public/uploads" -mindepth 1 -print -quit)" ]; then
  cp -a "$APP_ROOT/public/uploads/." "$SHARED/public/uploads/"
fi

ln -s "$SHARED/.env" "$RELEASE/.env"
rm -f "$RELEASE/prisma/dev.db"
ln -s "$SHARED/prisma/dev.db" "$RELEASE/prisma/dev.db"
rm -rf "$RELEASE/public/uploads"
ln -s "$SHARED/public/uploads" "$RELEASE/public/uploads"

cd "$RELEASE"
npm ci
npm run prisma:generate
npm run db:init
npm run typecheck
npm run build

PREVIOUS=""
if [ -L "$CURRENT" ]; then
  PREVIOUS="$(readlink -f "$CURRENT")"
fi

if command -v pm2 >/dev/null 2>&1 && pm2 describe grit-learning-habits >/dev/null 2>&1; then
  pm2 stop grit-learning-habits
fi

cp -a "$SHARED/prisma/dev.db" "$BACKUP/dev.db"
if [ -d "$SHARED/public/uploads" ]; then
  tar -czf "$BACKUP/uploads.tar.gz" -C "$SHARED/public" uploads
fi

ln -sfn "$RELEASE" "$CURRENT"
cd "$CURRENT"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

PORT="$APP_PORT" HOSTNAME=127.0.0.1 DATABASE_URL=file:./dev.db \
  pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

healthy=""
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:$APP_PORT/" || true)"
  if [ "$code" = "200" ]; then
    healthy="yes"
    break
  fi
  sleep 1
done

if [ "$healthy" != "yes" ]; then
  echo "New release failed its local health check." >&2
  if [ -n "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$CURRENT"
    cd "$CURRENT"
    PORT="$APP_PORT" HOSTNAME=127.0.0.1 DATABASE_URL=file:./dev.db \
      pm2 startOrRestart ecosystem.config.cjs --update-env
  fi
  exit 1
fi

NGINX_SOURCE="$RELEASE/deploy/nginx-grit.conf.template"
NGINX_TARGET="/etc/nginx/conf.d/grit-learning-habits.conf"
sed -e "s/__DOMAIN__/$APP_DOMAIN/g" -e "s/__PORT__/$APP_PORT/g" "$NGINX_SOURCE" > /tmp/grit-learning-habits.conf
sudo install -m 0644 /tmp/grit-learning-habits.conf "$NGINX_TARGET"
sudo nginx -t
sudo systemctl reload nginx

sudo install -m 0755 "$RELEASE/scripts/backup-aliyun-data.sh" /usr/local/bin/grit-learning-habits-backup
printf '17 3 * * * root /usr/local/bin/grit-learning-habits-backup %s 14\n' "$APP_ROOT" | \
  sudo tee /etc/cron.d/grit-learning-habits-backup >/dev/null

if command -v certbot >/dev/null 2>&1; then
  sudo certbot --nginx --non-interactive --agree-tos --redirect --email "$LE_EMAIL" -d "$APP_DOMAIN"
else
  echo "certbot is not installed. Install python3-certbot-nginx, then rerun the certbot command." >&2
  exit 1
fi

curl --fail --silent --show-error --location --connect-timeout 5 "https://$APP_DOMAIN/" >/dev/null

echo "Deployment finished: https://$APP_DOMAIN/"
'@

  $remoteScript = $remoteScript.Replace("__REMOTE_DIR__", $RemoteDir)
  $remoteScript = $remoteScript.Replace("__PORT__", [string]$Port)
  $remoteScript = $remoteScript.Replace("__DOMAIN__", $Domain)
  $remoteScript = $remoteScript.Replace("__EMAIL__", $LetsEncryptEmail)
  $remoteScript = $remoteScript.Replace("__ARCHIVE__", $remoteArchive)
  $remoteScript = $remoteScript.Replace("__STAMP__", $stamp)

  $remoteScript | & ssh @sshOptions $target "bash -s"
  if ($LASTEXITCODE -ne 0) {
    throw "Remote deployment failed with exit code $LASTEXITCODE"
  }

  Write-Host "Deployment finished: https://$Domain/"
  Write-Host "Admin: https://$Domain/admin"
}
finally {
  Pop-Location
  if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
  }
}
