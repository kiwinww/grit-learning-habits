# 阿里云 ECS 正式发布说明

正式版使用 Next.js + Prisma + SQLite，通过独立备案子域名访问。应用只监听 `127.0.0.1:3001`，由 Nginx 提供公网 HTTP/HTTPS，不影响同一台 ECS 上的其他站点。

## 服务器准备

- Ubuntu 22.04/24.04 或 Alibaba Cloud Linux。
- Node.js 22、Nginx、Certbot、Git、tar、curl；推荐安装 `sqlite3` 以获得一致性备份。
- 安全组只需开放 22、80、443，不开放 3001。
- `study.<备案主域名>` 的 A 记录已指向 ECS 公网 IP。
- SSH 用户能够执行 `sudo nginx`、`sudo systemctl`、`sudo certbot` 和写入 `/var/www`。

Ubuntu 安装示例：

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx sqlite3 git curl
```

## 从 Windows 发布

```powershell
cd D:\GRIT

powershell -ExecutionPolicy Bypass -File deploy-online.ps1 `
  -HostName 47.99.236.88 `
  -User root `
  -Domain study.example.com `
  -LetsEncryptEmail admin@example.com `
  -KeyPath C:\path\to\aliyun.pem
```

不使用密钥文件、已经配置 SSH Agent 时，可以省略 `-KeyPath`。

## 服务器目录

```text
/var/www/grit-learning-habits/
├── current -> releases/<timestamp>
├── releases/                 # 每次发布的只读代码版本
├── shared/
│   ├── .env
│   ├── prisma/dev.db
│   └── public/uploads/
└── backups/
    ├── releases/             # 发布前备份
    └── daily/                # 每日 03:17 备份，保留 14 天
```

## 发布流程

1. 本地执行类型检查和生产构建。
2. 上传不含 `.env`、数据库和上传文件的代码包。
3. 在新版本目录安装依赖、生成 Prisma Client、初始化数据库、再次检查并构建。
4. 停止旧 PM2 进程，备份共享数据，切换 `current` 软链接并启动新版本。
5. 本机健康检查失败时切回上一个版本。
6. 写入独立 Nginx 配置、申请 Let's Encrypt 证书并验证正式 HTTPS 地址。

## 手动备份

```bash
sudo /usr/local/bin/grit-learning-habits-backup /var/www/grit-learning-habits 14
```

## 访问保护说明

当前版本按项目约定不提供登录保护。Nginx 和页面会发送 `noindex` 指令，但任何获得网址的人仍能访问孩子端、家长后台及写接口。
