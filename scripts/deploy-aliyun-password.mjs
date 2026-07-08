import { createRequire } from "node:module";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const ssh2Root = process.env.SSH2_NODE_ROOT || path.join(os.tmpdir(), "grit-ssh-deploy-node");
const require = createRequire(pathToFileURL(path.join(ssh2Root, "package.json")).href);
const { Client } = require("ssh2");

const host = process.env.ALIYUN_HOST || "47.99.236.88";
const username = process.env.ALIYUN_USER || "root";
const remoteDir = process.env.ALIYUN_REMOTE_DIR || "/var/www/grit-learning-habits";
const remoteArchive = "/tmp/grit-learning-habits.tar.gz";
const appPort = process.env.PORT || "3001";
const startOnly = process.env.ALIYUN_START_ONLY === "1";
const diagnosticsOnly = process.env.ALIYUN_DIAG === "1";
const nginxOnly = process.env.ALIYUN_NGINX === "1";

if (process.env.ALIYUN_LOG) {
  const logPath = process.env.ALIYUN_LOG;
  fsSync.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fsSync.createWriteStream(logPath, { flags: "a" });
  const patchWrite = (stream) => {
    const originalWrite = stream.write.bind(stream);
    stream.write = (chunk, ...args) => {
      logStream.write(chunk);
      return originalWrite(chunk, ...args);
    };
  };
  patchWrite(process.stdout);
  patchWrite(process.stderr);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function promptPassword() {
  if (!process.stdin.isTTY) {
    throw new Error("Password prompt requires an interactive terminal.");
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let password = "";

    stdout.write("ECS root password: ");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (char) => {
      if (char === "\r" || char === "\n") {
        stdout.write("\n");
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        resolve(password);
        return;
      }

      if (char === "\u0003") {
        stdout.write("\n");
        process.exit(130);
      }

      if (char === "\b" || char === "\u007f") {
        password = password.slice(0, -1);
        stdout.write("\b \b");
        return;
      }

      password += char;
      stdout.write("*");
    };

    stdin.on("data", onData);
  });
}

function runLocal(command, args, cwd = projectRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function connect({ password }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => resolve(conn))
      .on("error", reject)
      .connect({
        host,
        port: 22,
        username,
        password,
        readyTimeout: 30_000
      });
  });
}

function upload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((sftpError, sftp) => {
      if (sftpError) {
        reject(sftpError);
        return;
      }

      sftp.fastPut(localPath, remotePath, (putError) => {
        sftp.end();
        if (putError) {
          reject(putError);
        } else {
          resolve();
        }
      });
    });
  });
}

function execRemote(conn, script) {
  return new Promise((resolve, reject) => {
    conn.exec("bash -s", (execError, stream) => {
      if (execError) {
        reject(execError);
        return;
      }

      stream
        .on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`remote deploy exited with code ${code}`));
          }
        })
        .on("data", (data) => process.stdout.write(data))
        .stderr.on("data", (data) => process.stderr.write(data));

      stream.end(script);
    });
  });
}

const payloadText = process.env.ALIYUN_PROMPT_PASSWORD === "1" ? "" : await readStdin();
const payload = payloadText ? JSON.parse(payloadText) : { password: await promptPassword() };
if (!payload.password) {
  throw new Error("Missing SSH password payload.");
}

const archivePath = path.join(os.tmpdir(), "grit-learning-habits.tar.gz");
if (!startOnly && !diagnosticsOnly && !nginxOnly) {
  await fs.rm(archivePath, { force: true });

  console.log("Building deployment archive...");
  await runLocal("tar", [
    "--exclude=.git",
    "--exclude=node_modules",
    "--exclude=.next",
    "--exclude=pages-dist",
    "--exclude=public/uploads",
    "--exclude=prisma/dev.db",
    "--exclude=.env",
    "--exclude=*.tar.gz",
    "-czf",
    archivePath,
    "-C",
    projectRoot,
    "."
  ]);
}

const fullDeployScript = `
set -e
APP_DIR='${remoteDir}'
ARCHIVE='${remoteArchive}'
APP_PORT='${appPort}'
STAMP=$(date +%Y%m%d%H%M%S)
BACKUP_DIR="/var/www/grit-learning-habits-deploy-backups/$STAMP"

if [ "$APP_DIR" != "/var/www/grit-learning-habits" ]; then
  echo "Unexpected APP_DIR: $APP_DIR" >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$BACKUP_DIR"

if [ -f "$APP_DIR/.env" ]; then
  cp -a "$APP_DIR/.env" "$BACKUP_DIR/.env"
fi

if [ -f "$APP_DIR/prisma/dev.db" ]; then
  mkdir -p "$BACKUP_DIR/prisma"
  cp -a "$APP_DIR/prisma/dev.db" "$BACKUP_DIR/prisma/dev.db"
fi

if [ -d "$APP_DIR/public/uploads" ]; then
  mkdir -p "$BACKUP_DIR/public"
  cp -a "$APP_DIR/public/uploads" "$BACKUP_DIR/public/uploads"
fi

find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
tar -xzf "$ARCHIVE" -C "$APP_DIR"

if [ -f "$BACKUP_DIR/.env" ]; then
  cp -a "$BACKUP_DIR/.env" "$APP_DIR/.env"
elif [ -f "$APP_DIR/.env.example" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

if [ -f "$BACKUP_DIR/prisma/dev.db" ]; then
  mkdir -p "$APP_DIR/prisma"
  cp -a "$BACKUP_DIR/prisma/dev.db" "$APP_DIR/prisma/dev.db"
fi

if [ -d "$BACKUP_DIR/public/uploads" ]; then
  mkdir -p "$APP_DIR/public"
  cp -a "$BACKUP_DIR/public/uploads" "$APP_DIR/public/uploads"
fi

cd "$APP_DIR"
npm ci
npm run db:init
npm run build
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
PORT="$APP_PORT" HOSTNAME=0.0.0.0 pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
curl -s -o /dev/null -w "local app %{http_code}\\n" "http://127.0.0.1:$APP_PORT/"
exit 0
`;

const startOnlyScript = `
set -e
APP_DIR='${remoteDir}'
APP_PORT='${appPort}'
cd "$APP_DIR"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
PORT="$APP_PORT" HOSTNAME=0.0.0.0 pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
curl -s -o /dev/null -w "local app %{http_code}\\n" "http://127.0.0.1:$APP_PORT/"
exit 0
`;

const diagnosticsScript = `
set +e
APP_DIR='${remoteDir}'
APP_PORT='${appPort}'
echo "== node/npm =="
node -v
npm -v
echo "== app files =="
ls -la "$APP_DIR" | head -40
echo "== env =="
cd "$APP_DIR" && sed 's/=.*/=<hidden>/' .env 2>/dev/null
echo "== pm2 list =="
pm2 list
echo "== pm2 logs =="
pm2 logs grit-learning-habits --lines 120 --nostream
echo "== listeners =="
ss -ltnp | grep ":$APP_PORT" || true
echo "== local http =="
curl -i --max-time 10 "http://127.0.0.1:$APP_PORT/" || true
exit 0
`;

const nginxScript = `
set -e
APP_PORT='${appPort}'
CONF='/etc/nginx/conf.d/grit-learning-habits.conf'
cat > "$CONF" <<'NGINX'
server {
  listen 80;
  server_name grit.47.99.236.88.sslip.io grit.47.99.236.88.nip.io;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX
nginx -t
systemctl reload nginx
curl -I --max-time 10 -H 'Host: grit.47.99.236.88.sslip.io' http://127.0.0.1/
exit 0
`;

console.log(`Connecting to ${username}@${host}...`);
const conn = await connect({ password: payload.password });
try {
  if (!startOnly && !diagnosticsOnly && !nginxOnly) {
    console.log("Uploading archive...");
    await upload(conn, archivePath, remoteArchive);
  }
  console.log(
    diagnosticsOnly
      ? "Running remote diagnostics..."
      : nginxOnly
        ? "Configuring nginx..."
        : startOnly
          ? "Starting remote app..."
          : "Running remote deploy..."
  );
  await execRemote(conn, diagnosticsOnly ? diagnosticsScript : nginxOnly ? nginxScript : startOnly ? startOnlyScript : fullDeployScript);
  console.log(`Done: http://${host}:${appPort}/`);
} finally {
  conn.end();
}
