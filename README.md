# Transcriptly

一个开源 YouTube transcript 工具：Chrome 扩展可把逐段字幕保存成本地 Markdown，或上传到私有云端书库；还支持在 playlist / 频道页勾选视频批量捕获。

本地保存无需登录或上传--结果是一份普通 Markdown，可用 `rg`/`grep` 搜索，或交给本地 coding agent 读取。云端保存是可选的：只有登录并显式选择后，Capture 才会写入你的私有 Library。

## 产品环

`Capture → Store → Find → Publish`

P1 完成前两环的本地部分：**捕获 YouTube 已渲染的 transcript → 本地 Markdown 落盘**。P2 在不改变本地隐私边界的前提下加入可选云端 Store → Find：扩展共享网站 Session 登录，捕获结果经持久化上传队列进入云端私有 Library，可浏览、阅读、精确全文检索与硬删除。批量捕获（#26）在此基础上支持 playlist / 频道页一次性勾选多个视频。

## 当前状态

| 阶段 | 状态 |
| --- | --- |
| #15 脚手架 + 数据契约(monorepo、Capture schema、Markdown 序列化器、WXT 壳、Playwright 加载) | ✅ 已合入 |
| #16 捕获管线(content script + 环境中立捕获核心) | ✅ 已合入 |
| #17 本地落盘(File System Access API) | ✅ 已合入 |
| #18 Popup UI(React + Tailwind v4) | ✅ 已合入 |
| #19 端到端 Save + 浏览器契约测试 | ✅ 已合入 |
| #25 扩展后台调度基建(background SW + 捕获/上传队列) | ✅ 已合入 |
| #28 扩展↔云上传 API 契约 | ✅ 已合入 |
| #30 P2 云端运行骨架（Next.js + PostgreSQL + Drizzle） | ✅ 已合入 |
| #31 网站登录与私库入口（Better Auth + Google/GitHub） | ✅ 已合入 |
| #32 扩展共享网站 Session 登录 | ✅ 已合入 |
| #33–#34 首个 Capture 云端入库 + 去重、更新与竞态 | ✅ 已合入 |
| #35–#36 扩展 Cloud Save 主链 + 上传失败恢复 | ✅ 已合入 |
| #37–#38 私有 Library 浏览、阅读与硬删除 | ✅ 已合入 |
| #39–#40 私库精确全文检索 + CJK 与子串检索 | ✅ 已合入 |
| #26 批量捕获：playlist/频道页一次性勾选 | ✅ 已合入 |
| #56–#58 批量改造 A/B/C：入口生命周期、选择模式交互、批量管理页 | ✅ 已合入 |
| #59 批量改造 D：恢复询问制（重启置 paused + 授权等待改暂停） | ✅ 已合入 |
| #63 批量捕获后续：恢复、授权与双目的地执行语义修正 | 🔨 开发中 |
| #41 P2 生产部署链路 / #42 异机加密备份 | 待开发 |
| #64 P3 公开首页与 Transcript SEO 页面 | 待开发 |

> 单视频「捕获 → 预览 → Save」、云端入库与 Library 检索、playlist/频道页批量勾选 + 批量管理页均已在真实浏览器中可用。

## 目录结构

pnpm workspaces monorepo：

```
packages/schema    归一化 Capture 类型契约（单一事实源、纯类型）
packages/capture   环境中立捕获核心 + serializeToMarkdown()
apps/extension     WXT 扩展壳（React popup + content script）
  ├─ batch/        批量捕获：发现、选择、执行、ETA 与 SPA 安全路由
  ├─ cloud/        云上传：持久化队列与失败恢复
  └─ entrypoints/  popup、content、background、批量管理页 manager
apps/web           Next.js App；src/db 分表 schema/migration、src/lib/auth 登录
docs/adr/          架构决策记录
CONTEXT.md         领域术语表
```

## 技术栈

- **TypeScript**(strict)、pnpm workspaces
- **WXT**(Vite 基、MV3 优先)——扩展构建
- **React** —— popup UI
- **vitest** —— 单元测试
- **Playwright** —— 扩展加载的 e2e 测试
- **Next.js + Tailwind CSS v4** —— 网站、SSR、UI 骨架与薄 Route Handlers
- **PostgreSQL + Drizzle** —— 云端权威数据源与版本化 SQL migration

## 环境要求

- Node.js ≥ 20
- [pnpm](https://pnpm.io) ≥ 9(本项目用 `packageManager` 锁定,`corepack` 会自动启用)
- Playwright 的 Chromium(首次运行 e2e 前安装一次)

## 安装

```bash
corepack enable          # 首次启用 pnpm
pnpm install             # 安装依赖
# 首次跑 e2e 前,安装 Playwright 捆绑的 Chromium:
pnpm --filter @transcriptly/extension exec playwright install chromium
```

## 常用命令

```bash
pnpm run build        # 全部 workspace 构建；扩展产出 apps/extension/.output/chrome-mv3
pnpm run typecheck    # 全部 workspace 类型检查
pnpm run test         # vitest 单元测试
pnpm run e2e          # 先 build 扩展，再用 Playwright 加载并断言
pnpm run e2e:web      # 临时 PostgreSQL + production build，验证网站 Session/私库/退出
pnpm run dev:web      # 本机启动 Next.js
pnpm run db:migrate   # 对本机配置的 DATABASE_URL 执行版本化 migration
pnpm run cloud:up     # Compose 构建并启动 migration、App 与 PostgreSQL
pnpm run cloud:down   # 停止云端容器
```

## 批量捕获

在 playlist 或频道页点 popup 的批量入口后进入选择模式：卡片出现复选框，工具栏提供 Load more、Select all 与配额（单批上限 50 个视频），满配额时禁用勾选并以 toast 提示。确认后由 background worker 逐个打开标签页捕获，SPA 导航由 source/target 身份校验保护（详见 `docs/agents/youtube-spa-safety.md`）。

进度统一在批量管理页（`manager` extension page）查看：总进度与滑动 ETA、每个视频的 Local / Cloud 双目的地结果与失败原因、失败项 Retry、Pause / Stop / Resume，以及最近批次历史。源页面关闭后管理页仍可从 popup 或悬浮胶囊重新打开，`?task=<id>` 可深链到单个批次。管理页同时承载本地保存宿主（目录授权与 Markdown 写入）：浏览器重启或目录授权过期时批次置为 paused，页面显示确切原因与对应操作（继续 / 重新授权），不会静默丢任务。

## P2 云端骨架

本机 `dev:web`、`db:generate` 和 `db:migrate` 在未注入 `DATABASE_URL` 时，只读取 `/Users/liujiaqi/code/video-blog-suggester/.env` 中的 `DATABASE_URL`。可通过 `TRANSCRIPTLY_ENV_FILE` 改用其他文件；显式注入的 `DATABASE_URL` 始终优先。其他 Secret 不会从共享文件复制进进程。

Compose 使用自己的 PostgreSQL 容器，不读取该共享文件。`migrate` 是独立 one-shot 服务；migration 成功后 App 才启动。PostgreSQL 不映射宿主机端口。

网站登录还需要 Better Auth 与 Google/GitHub OAuth 配置。复制 [`.env.example`](./.env.example) 并填写 Secret；本地 `dev:web` 放到 `apps/web/.env.local`，Compose 则放到仓库根目录 `.env`。OAuth App 回调地址分别是：

- `http://localhost:3000/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/github`

生产环境把域名替换为公开 HTTPS 域名，并让 `BETTER_AUTH_URL` 与其完全一致。`BETTER_AUTH_SECRET` 至少 32 字符，可用 `openssl rand -base64 32` 生成。OAuth access/refresh Token 由 Better Auth 加密后落库；完成回调验证后不再需要的 ID Token 不持久化；服务端响应会过滤全部 Token 字段。

```bash
pnpm run cloud:up
curl -i http://localhost:3000/api/health/live   # App 存活：200
curl -i http://localhost:3000/api/health/ready  # App + 已迁移数据库就绪：200；否则 503
```

`live` 不依赖数据库；`ready` 会实际查询 Drizzle schema。配置缺失返回 `configuration_error`，数据库不可用返回 `database_unavailable`，响应和 migration 错误均不包含连接串或 Secret。要用全新本地数据库验证 migration，可先执行 `docker compose down -v`（会删除本地 Compose 数据）。

访问 `/library` 时，服务端会用数据库完整验证 Cookie Session；未登录用户会跳转到 `/sign-in`。Google 与 GitHub 登录后进入私库空状态。退出只删除当前 Cookie 对应的数据库 Session，不会退出 Provider，也不会影响其他浏览器或设备上的 Session。

单个包:

```bash
pnpm --filter @transcriptly/schema run build
pnpm --filter @transcriptly/capture run test
pnpm --filter @transcriptly/extension run dev      # 开发模式(HMR)
```

## 人工运行与验证

### 方式一:命令行验证(推荐)

```bash
pnpm install
pnpm --filter @transcriptly/extension exec playwright install chromium   # 仅首次
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run e2e
pnpm run e2e:web
```

`e2e:web` 需要 Docker 和 Playwright Chromium；它会自动创建并清理临时 PostgreSQL，不读取真实 OAuth 账号或本机开发数据库。

全部绿即通过:`build` 产出 `chrome-mv3` 产物;`test` 跑 schema/capture 与扩展本地落盘模块的 vitest 用例;`e2e` 会用 `launchPersistentContext + --load-extension` 把扩展加载进捆绑的 Chromium,并断言 popup 能渲染及 manifest 入口符合 P1 约束；`e2e:web` 会在隔离数据库上验证未登录跳转、数据库 Session 私库访问，以及退出不影响另一客户端 Session。

### 方式二:手动加载扩展到 Chrome(完整流程)

```bash
pnpm --filter @transcriptly/extension run build
```

1. 打开 Chrome,访问 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」,选择目录 `apps/extension/.output/chrome-mv3`
4. 打开一个带 transcript 的 YouTube 观看页,再点工具栏的 Transcriptly 图标
5. popup 应展示可编辑文件名、Properties 与逐段时间戳 transcript;点 Save 选择目录后落盘 Markdown

保存模块(File System Access、IndexedDB、重名后缀、失败清理)的边界行为由扩展侧单元测试覆盖:

```bash
pnpm --filter @transcriptly/extension run test
```

## 人工验收边界

`#17`(本地落盘)、`#18`(Popup UI)与 P2 云端链路均已合入，单视频「捕获 → 预览 → Save」、云端上传与 Library 检索、批量捕获均可手动验收。单视频应重点验收:

1. 打开有 transcript 的 YouTube 视频,popup 展示可编辑文件名、可折叠 Properties、只读 transcript 预览(描述 + 逐段时间戳)。
2. 首次点击 Save 弹目录选择器,保存出包含 frontmatter、来源、描述和时间戳 transcript 的 Markdown。
3. 再次点击 Save 不弹选择器,直接写入上次目录。
4. 点击 Change 后选择新目录,后续保存写入新目录。
5. 重复保存同一视频时旧文件保留,新文件使用数字后缀。
6. 取消选择、拒绝权限或写入失败时显示明确错误,不显示成功状态,不留下可冒充成功结果的半成品文件。

批量捕获应重点验收：

1. 在 playlist / 频道页点批量入口进入选择模式，Load more、Select all、配额上限 50 与满额 toast 表现正确。
2. 确认后批量管理页展示总进度、ETA、每个视频的 Local / Cloud 结果与失败原因，失败项可 Retry，可 Pause / Stop / Resume。
3. 关闭源页面后管理页仍可从 popup 或悬浮胶囊重新打开，`?task=<id>` 深链到对应批次。
4. 浏览器重启或目录授权过期后批次置为 paused，管理页显示确切原因与对应操作，不静默丢任务。

### 开发模式(HMR)

```bash
pnpm --filter @transcriptly/extension run dev
```

按终端提示在浏览器里加载 `.output/chrome-mv3`。本仓库未装 `web-ext`,WXT 用 manual runner:`dev` 只起 watch + dev server,不会自动拉起浏览器,首次需手动加载一次。之后改动按类型自动生效:

- popup 的 React/样式 → Vite HMR,免刷新
- `content.ts`(内容脚本)→ WXT 自动重注册并刷新匹配的 YouTube 标签页
- manifest / background 变更 → 自动 reload 整个扩展
- `wxt.config.ts` / `.env` → 自动重启 dev server

自动刷新依赖 background service worker 与 dev server 之间的 websocket。连接丢失(dev server 重启、扩展被禁用后重开等)后改动不会自动推送,需在 `chrome://extensions` 点一次扩展刷新恢复。

## 序列化产物示例

一份 Capture 经 `serializeToMarkdown()` 落盘后的形状:

```markdown
---
title: "A Practical Guide to Agents"
channelName: "Ship It Weekly"
channelUrl: "https://www.youtube.com/@shipitweekly"
url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
videoId: "dQw4w9WgXcQ"
capturedAt: "2024-08-15T14:32:00.000Z"
---

# A Practical Guide to Agents

**Source:** [A Practical Guide to Agents](https://www.youtube.com/watch?v=dQw4w9WgXcQ) — Ship It Weekly

> Engineering lessons behind production agent systems.

## Transcript

- [00:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0) so you've been building agents
- [01:01](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=61) and you keep hitting the same walls
```

视频有章节(创作者分段)时,章节标题作为三级标题插在对应段之前:

```markdown
## Transcript

### Introduction

- [00:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0) welcome to the build

### Ship It

- [00:52](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=52) then open the pull request
```

页面内容一律按不可信输入转义(HTML 与 Markdown 链接/强调语法)。

## 领域术语

见 [`CONTEXT.md`](./CONTEXT.md):Capture、Source、Segment、Chapter、capture boundary、Markdown serialization、Destination。架构决策见 [`docs/adr/`](./docs/adr/)。
