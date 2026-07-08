# 森林星币站

面向单家庭使用的儿童学习习惯培养系统，包含孩子端和家长后台。孩子可以按今日日程完成任务、获得星币、兑换奖励；家长可以维护任务规则、奖励清单、日程模板、星币余额、兑换记录和周复盘。

## 在线访问

- 孩子端：https://kiwinww.github.io/grit-learning-habits/
- 家长后台：https://kiwinww.github.io/grit-learning-habits/admin/

GitHub Pages 版本是静态托管版本，会在浏览器里运行 React，并把操作记录保存在当前浏览器的 `localStorage` 中。也就是说：

- 完成/取消任务、兑换奖励、后台调整星币、保存任务/奖励/日程、处理兑换、重置演示记录都可以在页面上操作。
- 数据会在同一个浏览器里持久保留，刷新页面后仍然存在。
- 不同设备、不同浏览器之间不会自动同步数据。
- GitHub Pages 不能运行 Next API、Prisma 或 SQLite；如果需要真正的服务端数据库和上传能力，请使用本地/服务器版。

## 功能

- 孩子端：今日日程、任务完成/取消、星币余额、目标奖励、奖励兑换、本周小成就、最近记录。
- 家长后台：日程模板、今日临时安排、任务规则、奖励图片、兑换处理、星币手动调整、周复盘、演示记录重置。
- 服务端版数据存储：SQLite + Prisma。
- Pages 版数据存储：浏览器 `localStorage`。

## 本地运行完整 Next 版本

```bash
npm install
cp .env.example .env
npm run db:init
npm run dev
```

访问：

- 孩子端：http://localhost:3000/
- 家长后台：http://localhost:3000/admin

## 构建 GitHub Pages 静态版本

```bash
npm ci
DATABASE_URL=file:./dev.db npm run db:init
DATABASE_URL=file:./dev.db npm run build:pages
```

构建结果会写入 `pages-dist/`。当前仓库的 GitHub Actions 会在推送 `main` 时自动执行上述流程并发布到 GitHub Pages。

## 生产运行完整服务端版本

```bash
npm ci
cp .env.example .env
npm run db:init
npm run build
HOSTNAME=0.0.0.0 PORT=3001 npm start
```

使用 PM2：

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

也可以使用仓库里的阿里云 ECS 部署脚本：

```powershell
powershell -ExecutionPolicy Bypass -File deploy-online.ps1
```

## 注意事项

- `.env`、SQLite 数据库、构建产物和上传图片目录不会提交到 GitHub。
- 上传奖励图片默认保存在 `public/uploads/rewards/`，部署完整服务端版本时需要保留该目录。
- GitHub Pages 版本适合公开演示和单浏览器自用；完整家庭多端同步应部署 Next 服务端版本。
