# 阿里云 ECS 发布说明

推荐第一版使用阿里云 ECS 发布，因为当前系统需要本地 SQLite 数据库和奖励图片上传目录。

## 服务器要求

- Ubuntu 22.04/24.04 或 Alibaba Cloud Linux。
- 已开放安全组入方向 TCP `3000`，或配置 Nginx 反向代理到 `3000`。
- Node.js 20 LTS 或更高版本。
- Git。

## 首次部署

```bash
sudo mkdir -p /www
sudo chown -R $USER:$USER /www
cd /www
git clone https://github.com/kiwinww/grit-learning-habits.git
cd grit-learning-habits

cp .env.example .env
npm ci
npm run db:init
npm run build

npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

也可以在本机 Windows PowerShell 里直接发布当前 Git 提交：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-aliyun-ecs.ps1 -HostName 服务器公网IP -User root -KeyPath C:\path\to\key.pem
```

访问：

```text
http://服务器公网IP:3000/
http://服务器公网IP:3000/admin
```

## 更新部署

```bash
cd /www/grit-learning-habits
git pull
npm ci
npm run db:init
npm run build
pm2 restart grit-learning-habits
```

> 如果 GitHub 仓库是私有仓库，ECS 需要先配置 GitHub SSH deploy key、GitHub CLI 登录，或改用本地打包后 `scp` 上传。

## 可选：Nginx 反向代理

```nginx
server {
  listen 80;
  server_name 你的域名或公网IP;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

改完后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 需要 Codex 继续代发布时请提供

- ECS 公网 IP。
- SSH 用户名，例如 `root` 或 `ecs-user`。
- SSH 密钥文件路径，或已配置好的 `ssh user@ip` 免密连接。
- 希望使用 `:3000` 直接访问，还是绑定域名/Nginx。
