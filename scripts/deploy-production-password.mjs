import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const ssh2Root = process.env.SSH2_NODE_ROOT || path.join(os.tmpdir(), "family-star-coin-ssh2");
const require = createRequire(pathToFileURL(path.join(ssh2Root, "package.json")).href);
const { Client } = require("ssh2");

const host = "47.99.236.88";
const username = "root";
const domain = "study.lwnavx.com";
const appName = "family-star-coin-v2";
const appRoot = "/var/www/family-star-coin-v2";
const port = "3003";
const archive = path.join(os.tmpdir(), `family-star-coin-production-${Date.now()}.tar.gz`);
const remoteArchive = "/tmp/family-star-coin-production.tar.gz";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const useCmd = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
    const child = spawn(useCmd ? (process.env.ComSpec ?? "cmd.exe") : command, useCmd ? ["/d", "/s", "/c", command, ...args] : args, { cwd: root, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { value += chunk; });
    process.stdin.on("end", () => resolve(value));
    process.stdin.on("error", reject);
  });
}

function connect(password) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    client.on("ready", () => resolve(client)).on("error", reject).connect({ host, port: 22, username, password, readyTimeout: 30_000 });
  });
}

function upload(client) {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) return reject(error);
      sftp.fastPut(archive, remoteArchive, (uploadError) => { sftp.end(); uploadError ? reject(uploadError) : resolve(); });
    });
  });
}

function execute(client, script) {
  return new Promise((resolve, reject) => {
    client.exec("bash -s", (error, stream) => {
      if (error) return reject(error);
      stream.on("close", (code) => code === 0 ? resolve() : reject(new Error(`remote deploy exited with ${code}`)))
        .on("data", (data) => process.stdout.write(data));
      stream.stderr.on("data", (data) => process.stderr.write(data));
      stream.end(script);
    });
  });
}

const payload = JSON.parse(await readStdin());
if (!payload.password) throw new Error("Missing SSH password.");

console.log("正在执行正式发布前检查…");
await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "typecheck"]);
await run(process.platform === "win32" ? "npm.cmd" : "npm", ["test"]);
await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);
await fs.rm(archive, { force: true });
await run("tar", [
  "--exclude=.git", "--exclude=node_modules", "--exclude=.next", "--exclude=output", "--exclude=.playwright-cli", "--exclude=.playwright-mcp",
  "--exclude=.env", "--exclude=backups", "--exclude=admin-*.png", "--exclude=prisma/*.db", "--exclude=prisma/*.db-journal", "--exclude=*.log",
  "-czf", archive, "-C", root, "."
]);

const sessionSecret = randomBytes(32).toString("hex");
const bootstrapSecret = randomBytes(24).toString("hex");
const script = `
set -euo pipefail
APP_ROOT='${appRoot}'
APP_NAME='${appName}'
APP_PORT='${port}'
APP_DOMAIN='${domain}'
ARCHIVE='${remoteArchive}'
STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE="$APP_ROOT/releases/$STAMP"
SHARED="$APP_ROOT/shared"
CURRENT="$APP_ROOT/current"
BACKUP_ROOT="/var/backups/family-star-coin/$STAMP"

case "$APP_ROOT" in /var/www/family-star-coin-v2) ;; *) exit 1 ;; esac
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "服务器缺少 Node.js/npm。" >&2
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || { echo "服务器 Node.js 需要 20 或更高版本。" >&2; exit 1; }
if ! command -v sqlite3 >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3;
  elif command -v dnf >/dev/null 2>&1; then dnf install -y sqlite;
  elif command -v yum >/dev/null 2>&1; then yum install -y sqlite;
  else echo "无法安装 sqlite3。" >&2; exit 1; fi
fi

mkdir -p "$RELEASE" "$SHARED/prisma" "$SHARED/backups" "$APP_ROOT/releases" "$BACKUP_ROOT"
tar -xzf "$ARCHIVE" -C "$RELEASE"
NEW_DATABASE=0
if [ ! -f "$SHARED/.env" ]; then
  cat > "$SHARED/.env" <<'ENV'
DATABASE_URL="file:./family-star-coin.db"
BOOTSTRAP_SECRET="${bootstrapSecret}"
SESSION_SECRET="${sessionSecret}"
DEMO_SEED="0"
BACKUP_DIR="${appRoot}/shared/backups"
ENV
fi
if [ ! -f "$SHARED/prisma/family-star-coin.db" ]; then
  touch "$SHARED/prisma/family-star-coin.db"
  NEW_DATABASE=1
fi
ln -s "$SHARED/.env" "$RELEASE/.env"
rm -f "$RELEASE/prisma/family-star-coin.db"
ln -s "$SHARED/prisma/family-star-coin.db" "$RELEASE/prisma/family-star-coin.db"

cd "$RELEASE"
npm ci
npm run db:init
npm run typecheck
npm run build
npm prune --omit=dev
npm audit --omit=dev
ln -sfn "$RELEASE" "$CURRENT"
cd "$CURRENT"
if ! command -v pm2 >/dev/null 2>&1; then npm install -g pm2; fi
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
APP_NAME="$APP_NAME" PORT="$APP_PORT" DATABASE_URL="file:./family-star-coin.db" pm2 start ecosystem.config.cjs --update-env
pm2 save

LOCAL_CODE=""
for i in $(seq 1 30); do
  LOCAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$APP_PORT/" || true)
  case "$LOCAL_CODE" in 200|301|302|307|308) break ;; esac
  sleep 1
done
case "$LOCAL_CODE" in 200|301|302|307|308) ;; *) pm2 logs "$APP_NAME" --lines 100 --nostream; exit 1 ;; esac

cp -a /etc/nginx "$BACKUP_ROOT/nginx"
pm2 jlist > "$BACKUP_ROOT/pm2-jlist.json"
if [ -f /root/.pm2/dump.pm2 ]; then cp -a /root/.pm2/dump.pm2 "$BACKUP_ROOT/pm2-dump.pm2"; fi
for OLD_APP in /var/www/grit-learning-habits /var/www/family-star-coin /var/www/study.lwnavx.com; do
  if [ -d "$OLD_APP" ] && [ "$OLD_APP" != "$APP_ROOT" ]; then
    tar --exclude=node_modules --exclude=.next -czf "$BACKUP_ROOT/$(basename "$OLD_APP").tar.gz" -C "$(dirname "$OLD_APP")" "$(basename "$OLD_APP")"
  fi
done

DOMAIN_CONFIG=$(grep -RIl "server_name[[:space:]].*$APP_DOMAIN" /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null | grep -Ev '\.bak|\.before-v2-' | head -1 || true)
[ -n "$DOMAIN_CONFIG" ] || { echo "未找到 $APP_DOMAIN 的 Nginx 配置，未执行切换。" >&2; exit 1; }
REAL_DOMAIN_CONFIG=$(readlink -f "$DOMAIN_CONFIG")
cp -a "$REAL_DOMAIN_CONFIG" "$BACKUP_ROOT/domain-nginx.conf"
printf '%s\n' "$REAL_DOMAIN_CONFIG" > "$BACKUP_ROOT/domain-nginx-path.txt"
cp -a "$REAL_DOMAIN_CONFIG" "$REAL_DOMAIN_CONFIG.before-v2-$STAMP"
sed -E "s#proxy_pass[[:space:]]+http://(127\\.0\\.0\\.1|localhost):[0-9]+#proxy_pass http://127.0.0.1:$APP_PORT#g" "$REAL_DOMAIN_CONFIG.before-v2-$STAMP" > "$REAL_DOMAIN_CONFIG"
if ! grep -q "proxy_pass http://127.0.0.1:$APP_PORT" "$REAL_DOMAIN_CONFIG"; then
  cp -a "$REAL_DOMAIN_CONFIG.before-v2-$STAMP" "$REAL_DOMAIN_CONFIG"
  echo "现有 Nginx 上游格式无法安全替换，已保持旧站。" >&2
  exit 1
fi
if ! nginx -t; then
  cp -a "$REAL_DOMAIN_CONFIG.before-v2-$STAMP" "$REAL_DOMAIN_CONFIG"
  nginx -t
  exit 1
fi
systemctl reload nginx

PUBLIC_CODE=""
for i in $(seq 1 30); do
  PUBLIC_CODE=$(curl -s -o /dev/null -w "%{http_code}" --location "https://$APP_DOMAIN/" || true)
  [ "$PUBLIC_CODE" = "200" ] && break
  sleep 2
done
if [ "$PUBLIC_CODE" != "200" ]; then
  cp -a "$REAL_DOMAIN_CONFIG.before-v2-$STAMP" "$REAL_DOMAIN_CONFIG"
  nginx -t && systemctl reload nginx
  echo "公网验证失败（HTTP $PUBLIC_CODE），已恢复旧站。" >&2
  exit 1
fi

cat > /usr/local/sbin/family-star-coin-backup.sh <<'BACKUP'
#!/usr/bin/env bash
set -euo pipefail
DB="/var/www/family-star-coin-v2/shared/prisma/family-star-coin.db"
DEST="/var/www/family-star-coin-v2/shared/backups"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST"
sqlite3 "$DB" ".backup '$DEST/family-star-coin-$STAMP.db'"
gzip "$DEST/family-star-coin-$STAMP.db"
find "$DEST" -type f -name 'family-star-coin-*.db.gz' -mtime +14 -delete
BACKUP
chmod 0750 /usr/local/sbin/family-star-coin-backup.sh
cat > /etc/cron.d/family-star-coin-backup <<'CRON'
15 3 * * * root /usr/local/sbin/family-star-coin-backup.sh >/var/log/family-star-coin-backup.log 2>&1
CRON
chmod 0644 /etc/cron.d/family-star-coin-backup
/usr/local/sbin/family-star-coin-backup.sh

INITIALIZED=$(sqlite3 "$SHARED/prisma/family-star-coin.db" 'SELECT COUNT(*) FROM FamilySetting;' 2>/dev/null || echo 0)
CURRENT_BOOTSTRAP=$(awk -F'"' '/^BOOTSTRAP_SECRET=/{print $2}' "$SHARED/.env")
echo "PRODUCTION_URL=https://$APP_DOMAIN/"
echo "SETUP_URL=https://$APP_DOMAIN/setup"
echo "BOOTSTRAP_SECRET=$CURRENT_BOOTSTRAP"
echo "INITIALIZED=$INITIALIZED"
echo "NEW_DATABASE=$NEW_DATABASE"
echo "SERVER_BACKUP=$BACKUP_ROOT"
`;

console.log(`正在连接 ${username}@${host}…`);
const client = await connect(payload.password);
try {
  console.log("正在上传正式版本；通过健康检查后才会切换域名…");
  await upload(client);
  await execute(client, script);
} finally {
  client.end();
  await fs.rm(archive, { force: true });
}
