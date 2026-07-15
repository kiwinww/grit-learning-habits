# 家庭星币成长站

面向单家庭、单孩子的学习习惯与家庭奖励站。孩子通过完成日常任务积累星币、选择目标和兑换奖励；家长通过 PIN 后台统一管理任务、时间安排、奖励、兑换和家庭设置。

正式站：[https://study.lwnavx.com](https://study.lwnavx.com)

> 项目仅用于个人家庭非商业场景。孩子端按产品设计公开可访问，家长操作必须通过 PIN 会话验证。

## 主要功能

### 孩子端

- “今天、奖励、成长、记录”四个移动优先页面。
- 查看今日任务、时间、星币余额和当前奖励目标。
- 完成任务、取消仍待家长确认的完成记录、兑换奖励。
- 任务、奖励和成长记录在页面可见时自动同步。
- 支持 PWA 安装、减少动态效果和移动端悬浮导航。

### 家长端

- PIN 登录、错误次数锁定和 30 分钟闲置会话失效。
- 今日概览、待确认任务、星币调整和补录昨天任务。
- “成长内容”统一管理任务、时间安排、独立日程和奖励。
- 每个任务可配置多组每周安排或指定日期安排。
- 处理奖励兑现、取消退款并查看申请时间。
- 家庭信息、首页文案、动画、补录、PIN 和分级数据重置。

### 数据规则

- 星币余额由有效流水实时求和，不保存可脱离流水修改的余额。
- 完成、确认、撤销、兑换和退款使用数据库事务与幂等键。
- 完成记录保存任务名称、说明和星币快照；兑换记录保存奖励名称和价格快照。
- 同一任务同一天只显示并完成一次，多组时间安排不会重复发币。
- 任务或奖励删除后保留历史快照和流水。
- 家庭日期使用 IANA 时区，时间戳统一保存为 UTC。

## 技术栈

- Next.js 16、React 19、TypeScript
- Prisma 6、SQLite
- [`animal-island-ui@1.2.2`](https://github.com/kiwinww/animal-island-ui)
- Vitest
- PM2、Nginx、HTTPS

## 本地运行

环境要求：Node.js 20 或更高版本。

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

`.env` 需要配置：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | SQLite 数据库位置 |
| `BOOTSTRAP_SECRET` | 一次性家庭初始化密钥 |
| `SESSION_SECRET` | 家长会话签名密钥 |
| `DEMO_SEED` | 设为 `1` 时生成演示数据 |

初始化成功后，初始化接口会永久关闭。不要把 `.env`、数据库或真实备份提交到 Git。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

测试覆盖星币流水、重复完成、待确认取消、撤销重做、奖励兑换退款、统一任务计划、旧字段兼容、数据重置和备份规则。

## 部署

### 独立预览站

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-preview-password.ps1
```

预览实例使用端口 `3002`、独立演示数据库和独立 PM2 进程，不影响正式站。

### 正式站

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-production-password.ps1
```

正式发布脚本会：

1. 在本地和服务器执行类型检查、测试与生产构建。
2. 发布到 `/var/www/family-star-coin-v2` 和端口 `3003`。
3. 保留正式数据库，不导入预览数据。
4. 备份旧 Nginx、PM2、站点代码和数据库。
5. 新实例健康检查通过后才切换 `study.lwnavx.com`。
6. 公网 HTTPS 验证失败时恢复旧 Nginx 上游。
7. 配置每日 SQLite 在线备份并保留 14 天。

首次正式部署会输出一次性初始化地址和密钥。密钥只应交给家庭管理员，不要写入仓库、Issue 或 PR。

详细说明见 [DEPLOY_ALIYUN_ECS.md](./DEPLOY_ALIYUN_ECS.md)。

## 安全与隐私边界

- 家长 PIN 使用随机盐和 `scrypt` 哈希。
- 所有管理 API 都在服务端复核家长会话。
- PWA Service Worker 只缓存静态外壳，不缓存 API、家庭数据或家长后台。
- 站点使用 `noindex` 和 `X-Robots-Tag` 降低搜索引擎收录，但这不等同于孩子端访问控制。
- 项目不接入广告、分析、支付或第三方追踪。

## 组件与许可

界面使用 [`animal-island-ui@1.2.2`](https://github.com/kiwinww/animal-island-ui)，并在网站页脚保留来源和许可署名。该组件库采用 CC BY-NC 4.0，仅限非商业使用。
