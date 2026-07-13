# 家庭星币成长站

面向单家庭、单孩子的学习习惯与家庭奖励站。孩子端用于查看今日日程、完成任务、积累星币和兑换奖励；家长端用于维护任务与日程、确认记录、处理兑换、复盘和备份。

## 本地运行

```powershell
Copy-Item .env.example .env
npm ci
npm run db:init
npm run dev
```

默认入口：

- 孩子端：`http://localhost:3000/`
- 家长端：`http://localhost:3000/admin`
- 首次初始化：`http://localhost:3000/setup`

初始化需要 `.env` 中的 `BOOTSTRAP_SECRET`。初始化完成后入口永久关闭。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

## 数据与安全边界

- SQLite 是唯一业务数据库；星币余额始终由不可静默修改的流水求和。
- 家长 PIN 使用随机盐和 `scrypt`，管理会话闲置 30 分钟失效。
- 孩子端按产品决定公开访问；管理接口全部在服务端复核会话。
- PWA 只缓存应用外壳与静态资源，不缓存 API、家庭数据或家长后台。
- 完整 JSON 备份包含版本号、校验摘要、业务数据和 Base64 奖励图片。

## 组件与许可

界面使用 [`animal-island-ui@1.2.2`](https://github.com/kiwinww/animal-island-ui)，仅用于个人家庭非商业用途，并在网站页脚保留来源署名。该组件库采用 CC BY-NC 4.0 许可。

## 发布顺序

先发布独立数据库的 HTTPS 预览站并完成验收；收到确认后，才创建新的正式实例并切换 `study.lwnavx.com`。详见 [DEPLOY_ALIYUN_ECS.md](./DEPLOY_ALIYUN_ECS.md)。
