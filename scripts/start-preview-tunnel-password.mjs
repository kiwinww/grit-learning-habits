import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ssh2Root = process.env.SSH2_NODE_ROOT || path.join(os.tmpdir(), "family-star-coin-ssh2");
const require = createRequire(pathToFileURL(path.join(ssh2Root, "package.json")).href);
const { Client } = require("ssh2");
const localBinary = path.join(os.tmpdir(), "cloudflared-linux-amd64");
const remoteBinary = "/tmp/cloudflared-family-star-preview";

const input = await new Promise((resolve, reject) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { value += chunk; });
  process.stdin.on("end", () => resolve(JSON.parse(value)));
  process.stdin.on("error", reject);
});

const client = await new Promise((resolve, reject) => {
  const session = new Client();
  session.on("ready", () => resolve(session)).on("error", reject).connect({ host: "47.99.236.88", port: 22, username: "root", password: input.password, readyTimeout: 30_000 });
});

try {
  await new Promise((resolve, reject) => client.sftp((error, sftp) => {
    if (error) return reject(error);
    sftp.fastPut(localBinary, remoteBinary, (uploadError) => { sftp.end(); uploadError ? reject(uploadError) : resolve(); });
  }));
  await new Promise((resolve, reject) => client.exec("bash -s", (error, stream) => {
    if (error) return reject(error);
    stream.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Tunnel startup exited with ${code}`))).on("data", (data) => process.stdout.write(data));
    stream.stderr.on("data", (data) => process.stderr.write(data));
    stream.end(`set -euo pipefail
install -m 0755 '${remoteBinary}' /usr/local/bin/cloudflared
pm2 delete family-star-coin-preview-tunnel >/dev/null 2>&1 || true
pm2 start /usr/local/bin/cloudflared --name family-star-coin-preview-tunnel -- tunnel --url http://127.0.0.1:3002 --no-autoupdate
pm2 save
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(pm2 logs family-star-coin-preview-tunnel --lines 100 --nostream --raw 2>&1 | grep -Eo 'https://[a-z0-9-]+\\.trycloudflare\\.com' | tail -1 || true)
  [ -n "$TUNNEL_URL" ] && break
  sleep 1
done
[ -n "$TUNNEL_URL" ] || { pm2 logs family-star-coin-preview-tunnel --lines 100 --nostream; exit 1; }
curl --fail --silent --show-error --location "$TUNNEL_URL/" >/dev/null
echo "PREVIEW_URL=$TUNNEL_URL/"
echo "PARENT_PIN=2468"
`);
  }));
} finally {
  client.end();
}
