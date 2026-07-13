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
const domain = "grit-preview.47.99.236.88.sslip.io";
const appName = "family-star-coin-preview";
const appRoot = "/var/www/family-star-coin-preview";
const port = "3002";
const demoPin = "2468";
const archive = path.join(os.tmpdir(), `family-star-coin-preview-${Date.now()}.tar.gz`);
const remoteArchive = "/tmp/family-star-coin-preview.tar.gz";

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

console.log("正在执行本地类型、测试和生产构建检查…");
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
const bootstrapSecret = randomBytes(32).toString("hex");
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

case "$APP_ROOT" in /var/www/family-star-coin-preview) ;; *) exit 1 ;; esac
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "服务器缺少 Node.js/npm，请先安装 Node.js 20 或更高版本。" >&2
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || { echo "服务器 Node.js 版本过低，需要 20 或更高版本。" >&2; exit 1; }
if ! command -v nginx >/dev/null 2>&1 || ! command -v certbot >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx certbot python3-certbot-nginx
  elif command -v yum >/dev/null 2>&1; then
    yum install -y nginx certbot python3-certbot-nginx
  else
    echo "无法自动安装 Nginx/Certbot，请先在服务器安装。" >&2
    exit 1
  fi
fi
mkdir -p "$RELEASE" "$SHARED/prisma" "$APP_ROOT/releases"
mkdir -p "$SHARED/backups"
tar -xzf "$ARCHIVE" -C "$RELEASE"
if [ ! -f "$SHARED/.env" ]; then
cat > "$SHARED/.env" <<'ENV'
DATABASE_URL="file:./family-star-coin.db"
BOOTSTRAP_SECRET="${bootstrapSecret}"
SESSION_SECRET="${sessionSecret}"
DEMO_SEED="1"
DEMO_PARENT_PIN="${demoPin}"
BACKUP_DIR="${appRoot}/shared/backups"
ENV
fi
touch "$SHARED/prisma/family-star-coin.db"
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
APP_NAME="$APP_NAME" PORT="$APP_PORT" DATABASE_URL="file:./family-star-coin.db" pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$APP_PORT/" || true)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "${'${code:-}'}" = "200" ] || { pm2 logs "$APP_NAME" --lines 100 --nostream; exit 1; }
cat > "/etc/nginx/conf.d/$APP_NAME.conf" <<'NGINX'
server {
  listen 80;
  server_name ${domain};
  add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
  location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
NGINX
nginx -t
systemctl reload nginx
PREVIEW_URL="https://$APP_DOMAIN/"
if certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d "$APP_DOMAIN"; then
  curl --fail --silent --show-error --location "$PREVIEW_URL" >/dev/null
else
  echo "Certificate validation failed; starting an HTTPS Quick Tunnel."
  if ! command -v cloudflared >/dev/null 2>&1; then
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64|amd64) CF_ARCH="amd64" ;;
      aarch64|arm64) CF_ARCH="arm64" ;;
      *) echo "Unsupported architecture for cloudflared: $ARCH" >&2; exit 1 ;;
    esac
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" -o /usr/local/bin/cloudflared
    chmod 0755 /usr/local/bin/cloudflared
  fi
  pm2 delete "$APP_NAME-tunnel" >/dev/null 2>&1 || true
  pm2 start /usr/local/bin/cloudflared --name "$APP_NAME-tunnel" -- tunnel --url "http://127.0.0.1:$APP_PORT" --no-autoupdate
  pm2 save
  TUNNEL_URL=""
  for i in $(seq 1 30); do
    TUNNEL_URL=$(pm2 logs "$APP_NAME-tunnel" --lines 100 --nostream --raw 2>&1 | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
    [ -n "$TUNNEL_URL" ] && break
    sleep 1
  done
  [ -n "$TUNNEL_URL" ] || { pm2 logs "$APP_NAME-tunnel" --lines 100 --nostream; exit 1; }
  curl --fail --silent --show-error --location "$TUNNEL_URL/" >/dev/null
  PREVIEW_URL="$TUNNEL_URL/"
fi
echo "PREVIEW_URL=$PREVIEW_URL"
echo "PARENT_PIN=${demoPin}"
`;

console.log(`正在连接 ${username}@${host}…`);
const client = await connect(payload.password);
try {
  console.log("正在上传独立预览版本…");
  await upload(client);
  await execute(client, script);
} finally {
  client.end();
  await fs.rm(archive, { force: true });
}
