# 儿童学习习惯系统

这是一个面向单家庭使用的儿童学习习惯培养系统，包含孩子端和家长后台。

## 功能

- 孩子端：今日日程、任务完成/取消、星币余额、奖励兑换、本周小成就。
- 家长后台：日程模板、今日安排、任务规则、奖励图片、兑换处理、星币手动调整、周复盘、演示数据重置。
- 数据存储：SQLite + Prisma。

## 本地运行

```bash
npm install
cp .env.example .env
npm run db:init
npm run dev
```

访问：

- 孩子端：http://localhost:3000/
- 家长后台：http://localhost:3000/admin

## 生产运行

```bash
npm ci
cp .env.example .env
npm run db:init
npm run build
HOSTNAME=0.0.0.0 PORT=3000 npm start
```

如果使用 PM2：

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

## 注意

- `.env`、SQLite 数据库和上传图片不会提交到 GitHub。
- 上传奖励图片保存在 `public/uploads/rewards/`，部署时请保留该目录。
- 默认初始星币为 `0`。
