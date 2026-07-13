# 森林星币站

面向单家庭使用的儿童学习习惯培养系统，包含孩子端和家长后台。孩子可以按今日日程完成任务、获得星币、兑换奖励；家长可以维护任务规则、奖励清单、日程模板、星币余额、兑换记录和周复盘。

## 正式访问

- 孩子端：`https://study.<备案主域名>/`
- 家长后台：`https://study.<备案主域名>/admin`

正式版运行在阿里云 ECS 上，孩子端和家长后台通过同一个 SQLite 数据库共享数据。原 GitHub Pages 静态站点已停止使用。

## 功能

- 孩子端：今日日程、任务完成/取消、星币余额、目标奖励、奖励兑换、本周小成就、最近记录。
- 家长后台：日程模板、今日临时安排、任务规则、奖励图片、兑换处理、星币手动调整、周复盘、演示记录重置。
- 数据存储：SQLite + Prisma，多台手机访问同一正式站时共享数据。

## 本地运行完整 Next 版本

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run db:init
npm.cmd run dev
```

访问：

- 孩子端：http://localhost:3000/
- 家长后台：http://localhost:3000/admin

## 生产运行完整服务端版本

```bash
npm ci
cp .env.example .env
npm run prisma:generate
npm run db:init
npm run typecheck
npm run build
HOSTNAME=127.0.0.1 PORT=3001 npm start
```

使用 PM2：

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

## 阿里云 ECS 部署

部署前需要完成：

- 将 `study.<备案主域名>` 的 A 记录指向 ECS 公网 IP。
- ECS 已安装 Node.js 22、Nginx、Certbot、Git、tar 和 curl。
- 安全组开放 22、80、443；应用端口 3001 不对公网开放。

在 Windows PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File deploy-online.ps1 `
  -HostName 47.99.236.88 `
  -User root `
  -Domain study.example.com `
  -LetsEncryptEmail admin@example.com `
  -KeyPath C:\path\to\aliyun.pem
```

脚本会先在本地执行类型检查和生产构建，再上传一个新版本目录。SQLite、`.env` 和奖励图片保存在服务器共享目录中；发布前会备份数据，健康检查失败时会回滚到上一个版本。Nginx 使用独立域名转发到 `127.0.0.1:3001`，Certbot 自动配置 HTTPS，每天 03:17 自动备份并保留 14 天。

## 注意事项

- `.env`、SQLite 数据库、构建产物和上传图片目录不会提交到 GitHub。
- 上传奖励图片默认保存在 `public/uploads/rewards/`，部署完整服务端版本时需要保留该目录。
- 当前版本按用户选择不提供登录保护。任何获得正式网址的人都可以操作孩子端和家长后台；`noindex` 只能阻止常规搜索收录，不能替代权限控制。

## 视觉参考与许可

界面视觉风格参考 [Animal Island UI](https://github.com/guokaigdg/animal-island-ui)，按 [CC BY-NC 4.0](https://github.com/guokaigdg/animal-island-ui/blob/main/LICENSE) 用于个人/家庭非商业用途。站点字体通过本地依赖自托管，不请求 Google Fonts。
