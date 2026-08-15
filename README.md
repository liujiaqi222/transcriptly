# Transcriptly

一个开源 Chrome 浏览器扩展:在 YouTube 观看页一键把 transcript(逐段字幕)保存成本地 Markdown。

无需登录、无云、无上传——保存结果是一份普通 Markdown,可直接放进 Obsidian、用 `rg`/`grep` 搜索、或交给本地 coding agent 读取。

## 产品环

`Capture → Store → Find → Publish`

P1 只做前两环的本地部分:**捕获 YouTube 已渲染的 transcript → 本地 Markdown 落盘**。云存储、语义检索、公开发布留待后续期。

## 当前状态

| 阶段 | 状态 |
| --- | --- |
| #15 脚手架 + 数据契约(monorepo、Capture schema、Markdown 序列化器、WXT 壳、Playwright 加载) | ✅ 已合入 |
| #16 捕获管线(content script + 环境中立捕获核心) | 待开发 |
| #17 本地落盘(File System Access API) | 待开发 |
| #18 Popup UI(React + Tailwind v4) | 待开发 |
| #19 端到端 Save + 浏览器契约测试 | 待开发 |

> 目前 popup 是占位 scaffold(只显示「Transcriptly ready」),捕获与保存尚未接线。

## 目录结构

pnpm workspaces monorepo,三个包:

```
packages/schema    归一化 Capture 类型契约(单一事实源,纯类型)
packages/capture   环境中立捕获核心 + serializeToMarkdown()
apps/extension     WXT 扩展壳(React popup + content script)
docs/adr/          架构决策记录
CONTEXT.md         领域术语表
```

## 技术栈

- **TypeScript**(strict)、pnpm workspaces
- **WXT**(Vite 基、MV3 优先)——扩展构建
- **React** —— popup UI
- **vitest** —— 单元测试
- **Playwright** —— 扩展加载的 e2e 测试

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
pnpm run build        # 三个包全部构建;扩展产出 apps/extension/.output/chrome-mv3
pnpm run typecheck    # 三个包类型检查
pnpm run test         # vitest 单元测试
pnpm run e2e          # 先 build 扩展,再用 Playwright 加载并断言
```

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
```

全部绿即通过:`build` 产出 `chrome-mv3` 产物;`test` 是 10 个序列化器用例;`e2e` 会用 `launchPersistentContext + --load-extension` 把扩展加载进捆绑的 Chromium,并断言 popup 能渲染。

### 方式二:手动加载扩展到 Chrome

```bash
pnpm --filter @transcriptly/extension run build
```

1. 打开 Chrome,访问 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」,选择目录 `apps/extension/.output/chrome-mv3`
4. 点工具栏的 Transcriptly 图标,应看到 popup 显示「Transcriptly … ready」

### 开发模式(HMR)

```bash
pnpm --filter @transcriptly/extension run dev
```

按终端提示在浏览器里加载 `.output/chrome-mv3`,改动会自动热更新。

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

页面内容一律按不可信输入转义(HTML 与 Markdown 链接/强调语法)。

## 领域术语

见 [`CONTEXT.md`](./CONTEXT.md):Capture、Source、Segment、capture boundary、Markdown serialization、Destination。架构决策见 [`docs/adr/`](./docs/adr/)。
