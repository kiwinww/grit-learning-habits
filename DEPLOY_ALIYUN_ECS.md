# 阿里云 ECS 发布说明

发布分为预览和正式两个阶段，二者使用不同目录、端口、PM2 进程和 SQLite 数据库。

## 预览阶段

- 地址：`https://grit-preview.47.99.236.88.sslip.io`
- 应用目录：`/var/www/family-star-coin-preview`
- 端口：`3002`
- PM2：`family-star-coin-preview`
- 数据：全新虚构演示数据
- 测试 PIN：`2468`

在 Windows 上执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-preview-password.ps1
```

脚本会先执行类型检查、测试和生产构建，再弹出 SSH 凭据窗口。它会安装 Node.js、Nginx、Certbot 和 PM2（如服务器尚未安装），发布独立实例并签发 HTTPS 证书。

如果临时域名受到服务器入口层拦截而无法签发证书，脚本会自动复用或创建 Cloudflare HTTPS Quick Tunnel；正式域名不会因此改变。

若已有 SSH 私钥，可先配置 `root@47.99.236.88` 免密登录，再采用同样的服务器目录和端口手动发布。

## 正式阶段

只有预览验收通过后才执行：

1. 备份旧站代码、配置和数据库。
2. 将 V2 发布到独立目录 `/var/www/family-star-coin-v2`、端口 `3003`。
3. 使用空数据库启动，通过 `/setup` 完成一次性家庭初始化。
4. 健康检查通过后，把 `study.lwnavx.com` 的 Nginx 上游切到 `127.0.0.1:3003`。
5. 验证首页、家长登录、任务完成、兑换、备份和 HTTPS；失败则恢复旧上游。
6. 启用每日 SQLite 在线备份并保留 14 天，随后关闭预览进程。

正式切换不会复用预览数据，也不会覆盖旧站归档。

在 Windows 上执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-production-password.ps1
```

脚本会在切换前归档旧站 Nginx、PM2 配置和已知站点目录，启动端口 `3003` 的正式实例并完成本机健康检查；只有公网 HTTPS 验证通过后才保留新上游。验证失败时会自动恢复原 Nginx 配置。发布成功后会输出一次性初始化地址与密钥，并配置每日 SQLite 在线备份（保留 14 天）。
