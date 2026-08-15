# obsidian-clipper 捕获架构研究

- Issue: liujiaqi222/transcriptly#3(wayfinder:research)
- 上游版本: obsidianmd/obsidian-clipper v1.7.1,commit `9aa509b8f2801b08d974fb59f026df6f9a12e496`(2026-08-03,浅克隆)
- 研究方法: 浅克隆源码通读 + defuddle 上游源码/README + npm registry 许可证核验;全部结论带一手来源引用
- 结论用途: 为本项目 capture boundary(YouTube DOM 捕获隔离、净化、序列化)提供可借鉴模式清单

## TL;DR 可借鉴清单

| # | 模式 | 来源 | 对本项目的价值 |
|---|------|------|----------------|
| 1 | content script 是唯一触碰页面 DOM 的层,popup/background 只通过消息拿已序列化的结果 | `src/content.ts` | 直接对应 spec "capture boundary 收窄维护面" |
| 2 | 环境中立 API seam:DOM 解析器注入 + polyfill 打桩,使同一捕获核心跑在扩展/CLI/测试 | `src/api.ts`、`src/utils/cli-stubs.ts`、`scripts/build-api.mjs` | 浏览器级契约测试可下钻到纯函数层 |
| 3 | 站点特定选择器放数据(用户模板 JSON + `selector:`/`selectorHtml:` 变量),不放代码 | `src/utils/variables/selector.ts`、`src/types/types.ts` | YouTube 选择器变更 = 改配置/fixture,不改通用管线 |
| 4 | fixture 三元组:输入 HTML + 模板 JSON + 期望 Markdown,冻结时间,首跑自动落盘 expected | `src/utils/template-integration.test.ts`、`src/utils/fixtures/` | spec 的"浏览器级捕获契约"可直接套此形状 |
| 5 | 三份 manifest 源文件 + webpack `BROWSER` env 选输出目录与 manifest | `webpack.config.js`、`src/manifest.*.json` | Chrome 先行、Firefox/Safari 后补的构建差异化管理 |
| 6 | DOMPurify 只在"HTML 进入扩展自身 UI DOM"的边界消毒(`RETURN_DOM_FRAGMENT` + `replaceChildren`) | `src/utils/i18n.ts:221`、`src/core/highlights.ts:1217` | 我们预览/公开页渲染不可信文本,须比它更激进 |
| 7 | defuddle(MIT)内置 `youtube.ts` 提取器:DOM 优先、点击 Transcript 面板 + 轮询等待渲染 | defuddle `src/extractors/youtube.ts` | 与 spec 的人造 DOM 路径几乎同构;但默认 async 路径走 InnerTube API,违反我们 spec,见 §7.2 |

## 1. 总体架构

仓库布局(`ls` 实测):

```
src/
  content.ts          # content script,唯一接触页面 DOM 的入口
  background.ts       # service worker,消息路由(sendMessageToTab)
  core/               # popup.ts / settings.ts / highlights.ts / reader-view.ts(扩展自身页面)
  manifest.chrome.json / manifest.firefox.json / manifest.safari.json
  api.ts              # 环境无关编程 API(发布为 obsidian-clipper/api)
  managers/           # 设置/模板等 UI 管理器
  utils/              # 捕获核心:shared/content-extractor/clip-utils/triggers/renderer/...
    filters/          # 40+ 模板过滤器(每个配 .test.ts)
    fixtures/         # 测试 fixture(templates/ + expected/)
    variables/        # selector/simple/schema/model/prompt 变量解析
```

数据流(捕获主路径):

1. popup 向 background 发 `sendMessageToTab` -> content script(`src/content.ts` 的 `getPageContent` handler,约 L199-280)。
2. content script:flatten shadow DOM(3s 超时)-> `new Defuddle(document, {url}).parseAsync()`(8s 超时回退同步 `parse()`)-> 组装 `ContentResponse`(title/author/content/description/schemaOrgData/metaTags/highlights…)。
3. `fullHtml` 在返回前做粗净化:DOMParser 重解析后移除全部 `script, style` 元素与 `style` 属性,并把 `src/href/srcset` 相对 URL 转绝对(`src/content.ts` L222-260)。
4. popup 侧 `initializePageContent`(`src/utils/content-extractor.ts:127`)用 `createMarkdownContent`(defuddle/full,内部 turndown)做 HTML->Markdown 序列化,`buildVariables` 生成 `{{title}}` 等模板变量。
5. 模板编译(`template-compiler.ts` + `renderer.ts` + `filters/`)产出最终笔记。

要点:**页面 DOM 的读取、清洗、序列化全部发生在 content script 与纯函数层;popup 从不直接执行页面选择器**(站点选择器经 `extractContent` 消息转发回 content script 执行,见 `src/utils/variables/selector.ts:11-23` 的注释:Firefox iframe/side-panel 上下文里 `browser.tabs` 不可用)。

## 2. 站点特定逻辑的隔离(对应研究问题 1)

obsidian-clipper 没有硬编码的"每站点 if/else";站点特异性被拆到三个互不相同的层:

### 2.1 站点提取器层(defuddle)

defuddle(MIT,同作者)用 extractor 子类承载站点逻辑:`src/extractors/` 下每个站点一个文件(youtube.ts、reddit.ts、wikipedia.ts 等 29 个,GitHub API 实测),基类 `_base.ts` 定义 `canExtract()/extract()/extractAsync()`。通用内容抽取(打分去噪、footnote/math 标准化)留在 defuddle 主管线(defuddle README "Options"/"HTML standardization" 节)。**通用 vs 站点的分界 = 基类管线 vs extractor 子类**。

### 2.2 选择器即数据(用户模板)

`Template` 接口(`src/types/types.ts:1-12`)只有 `noteNameFormat/path/noteContentFormat/properties/triggers` 等数据字段;模板里可写 `{{selector:h1.x?attr|filters}}`,由 `src/utils/variables/selector.ts:57-86` 的 `processSelector` 解析后**发消息回 content script 执行**(`extractContentBySelector`,`src/utils/shared.ts:257-283`:querySelectorAll -> textContent/outerHTML/attribute)。选择器坏了改模板 JSON 即可,不必改代码。

URL->模板匹配在 `src/utils/triggers.ts`:支持前缀/正则/`schema:` 三种 trigger,用字符级 Trie + memoize(`triggers.ts:1-50`)做优先级匹配。

### 2.3 对本项目的映射

- 我们的"YouTube 选择器集合"应是一个独立的纯数据模块(或 defuddle 式 extractor 类),输入 `Document`、输出 normalized capture;不得把 `ytd-…` 选择器散落在 UI/云代码里——这正是 spec Implementation Decisions 第 92 行的要求。
- 值得照抄的具体手法:**extractor 接口用 `canExtract()` 守门 + 多级回退**(defuddle youtube.ts:DOM 已有字幕 → 直接读;没有 → 打开面板重读;再没有 → 才走网络)。

## 3. DOMPurify 的使用位置与策略(对应研究问题 2)

实测 `rg -l dompurify src` 只有 **2 个文件、2 处调用**,且用法完全一致:

```ts
// src/utils/i18n.ts:221(翻译文案插入扩展 UI)
element.replaceChildren(DOMPurify.sanitize(translation, { RETURN_DOM_FRAGMENT: true }));
// src/core/highlights.ts:1217(高亮内容插入 highlights 页)
content.replaceChildren(DOMPurify.sanitize(joined, { RETURN_DOM_FRAGMENT: true }));
```

策略解读:

1. **净化点选在"字符串 HTML 即将进入扩展自身页面 DOM"的写入边界**,用 `RETURN_DOM_FRAGMENT: true` 返回 DocumentFragment 再 `replaceChildren`,不经过 innerHTML 字符串往返(i18n.ts L218 注释:"Sanitize HTML content before inserting")。
2. 主捕获路径**不经过 DOMPurify**:内容净化依赖三道互补机制——content script 的 script/style 剥除(§1 第 3 步)、defuddle 管线清洗、以及 **HTML->Markdown 序列化本身**(turndown 只保留白名单结构,script/style 自然消失)。纯文本输出(XSS 角度)由 Markdown 转义兜底。
3. defuddle youtube.ts 对视频描述用 `escapeHtml(description)` 再拼 HTML(`formatDescription`),即"先转义再拼接"而不是"先拼接再净化"。

**对本项目的含义(重要差异)**:我们的 spec(User Stories #52、Implementation Decisions 第 93 行)要求 YouTube 文本在**预览、Markdown 序列化、云存储、公开渲染**前都净化,且公开页是服务端渲染 HTML——比 obsidian-clipper 的纯 Markdown 输出面更宽。应采用比它更强的策略:capture boundary 出口处对进入 HTML 上下文的字段(标题/频道/描述/字幕文本)统一 escape 或 DOMPurify 白名单,云公开页再按服务端模板引擎的自动转义兜底;`RETURN_DOM_FRAGMENT + replaceChildren` 的写入手法值得保留。

## 4. webpack 多浏览器输出与 manifest 差异(对应研究问题 3)

全部机制在 `webpack.config.js`(184 行,单文件、函数式配置):

- **目录选择**:`BROWSER` env + mode 决定输出目录——生产 `dist`(chrome)/`dist_firefox`/`dist_safari`,开发对应 `dev*`(`webpack.config.js:28-34`)。package.json scripts 为每个浏览器提供 `dev:*`/`build:*`,`build` 串行跑三个(`package.json:18-24`)。
- **manifest 差异化**:仓库维护三份完整 manifest 源文件,CopyPlugin 按 BROWSER 选中一份复制为输出目录里的 `manifest.json`(`webpack.config.js:140-144`),不是运行时 patch。
- **manifest 实质差异**(diff 实测):
  - Firefox:`background.scripts` 数组替代 `service_worker`;`webRequest/webRequestBlocking` 替代 `declarativeNetRequest`;新增 `optional_host_permissions` 与 `browser_specific_settings.gecko`(id、strict_min_version、data_collection_permissions);无 `sidePanel`/`commands` 权限。
  - Safari:去掉 sidePanel/declarativeNetRequest,加 `nativeMessaging`;`options_ui.open_in_tab` 移除;i18n 命令描述直接写死字符串(无 `__MSG_` 占位);配套 Xcode 工程在 `xcode/Obsidian Web Clipper`。
- **polyfill 别名**:webpack alias 把 `./utils/browser-polyfill` 指到 `node_modules/webextension-polyfill/dist/browser-polyfill.min.js`(`webpack.config.js:95-101`),同时 CopyPlugin 把该文件复制进产物;`src/utils/browser-polyfill.ts` 只有一句 re-export + `declare global`(全仓库统一 `import browser from './utils/browser-polyfill'`)。
- **压缩注意**:Terser 开 `keep_classnames/keep_fnames/mangle:false`(`webpack.config.js:60-85`),避免扩展环境(如消息反序列化、Safari 审核)踩坑;生产附 ZipPlugin 直接产 `builds/obsidian-web-clipper-<ver>-<browser>.zip`。
- **api/api 双产物**:CLI 与 npm 包用 esbuild 单独打包,`platform: 'neutral'` + alias 把 webextension-polyfill 换成 `src/utils/cli-stubs.ts` 打桩(`scripts/build-api.mjs`)。

**对本项目的含义**:Chrome 先行时也应从第一天放三份 manifest 源文件 + `BROWSER` env 的 webpack(或等价)结构,即使只构建 chrome 目标——差异面被显式文件化后,Firefox/Safari 后补只是加构建命令。Terser 的 keep-fnames 教训可直接继承。

## 5. 测试打法与 fixture 组织(对应研究问题 4)

- **runner**:vitest,`vitest.config.ts` 仅 13 行——`include: ['src/**/*.test.ts']`、`globals: true`、`define: { DEBUG_MODE: false }`、以及关键一条:alias 把 `webextension-polyfill` 指到 `src/utils/__mocks__/webextension-polyfill.ts`(手写 stub:runtime/storage/tabs/i18n 均 no-op)。
- **规模与摆放**:58 个 `.test.ts`(find 实测),全部与被测文件同目录(filters/ 下每个过滤器一个);被 mock 的只有 webextension-polyfill 一个,DOM 用 jsdom(vitest 默认)+ linkedom(集成测试自选)。
- **fixture 三元组**(最值得抄的东西,`src/utils/template-integration.test.ts`):
  - `fixtures/templates/<name>.html`(页面 HTML)+ `<name>.json`(模板定义)→ 跑 defuddle + buildVariables + compileTemplate → 与 `fixtures/expected/<name>.md` 全量比对;
  - `fixtures/` 与 `expected/` 分离,`loadExpected` 找不到期望文件时 `saveExpected` 自动落盘(首次运行生成基线,之后严格回归);
  - `vi.useFakeTimers({ now: FROZEN_DATE })` 冻结时间使 `{{date}}` 确定;
  - 文件头 `// @vitest-environment jsdom` + 注释解释为什么需要 DOM(turndown 依赖 document/DOMParser);
  - 用 `parseHTML`(linkedom)解析 fixture,与 CLI 运行时同路径;
  - fixture 覆盖面:minimal / edge-cases / schema-rich / goodreads / imdb / **youtube**(expected/youtube.md 实测含 frontmatter + embed 图链)。
- **测试即 API 消费者**:集成测试 import 的是 `../api` 公开 seam(`createAsyncResolver/createSelectorProcessor`,`template-integration.test.ts:12`),不是内部函数——测试压在模块边界上,与 spec Testing Decisions 第 118 行"测外部可见行为"一致。

**对本项目的映射**:spec 第 119-121 行的"浏览器级捕获契约"(watch page fixture → 打开 Transcript → 有序分段 → 本地 Markdown + 云 normalized capture)可直接复刻三元组形状:`fixtures/pages/<case>.html` + `cases/<case>.json`(断言意图)→ `expected/<case>.md` + `expected/<case>.capture.json`(normalized capture 双输出,对应 spec 第 100 行"同一 normalized 表示驱动两种输出")。spec 要求的 fixture 覆盖(手动字幕/自动字幕/长 transcript/CJK/无 Transcript)与它的 minimal/edge-cases/youtube 分法同构。

## 6. 依赖角色裁决(对应研究问题 5)

| 依赖 | 许可证(npm registry 实测) | 在 clipper 中的角色 | 本项目裁决 |
|------|------|------|------|
| `webextension-polyfill` | **MPL-2.0** | 统一 Chrome(`chrome.*` 回调式)与 Firefox(`browser.*` promise 式)API;全仓库唯一导入点 `src/utils/browser-polyfill.ts`;测试 mock 与 CLI stub 也挂在这一点上 | **值得引入**(以 npm 依赖形式使用,不复制其源码,MPL-2.0 文件级义务即不触发)。Chrome-only 阶段收益有限,但 mock seam 的可测试性收益立刻兑现 |
| `defuddle` | MIT | 内容抽取 + 元数据 + schema.org + Markdown 转换(`defuddle/full` 含 turndown);内含 youtube.ts 专门提取器 | **分层裁决**,见 §7 |
| `lz-string` | MIT | 仅 2 处:模板导入导出与超长模板分块存储的 `compressToUTF16` 压缩(`src/managers/template-manager.ts:2,34,100`、`src/utils/import-export.ts:12`) | **不引入**。我们无浏览器 storage 配额压力;云上传用结构化 JSON 而非压缩字符串 |
| `dompurify` | MPL-2.0 OR Apache-2.0 | 见 §3,仅 UI 写入边界 2 处 | **引入**,但用在比它更靠前的 capture boundary 出口(§3 差异分析) |
| (clipper 未用)highlight.js/dayjs/lucide/linkedom | — | 编辑器高亮/日期/图标/测试端 DOM | linkedom 或 jsdom 随 vitest 需要;其余与我们无关 |

## 7. defuddle 深挖:youtube.ts 提取器

### 7.1 与 spec 同构的部分(高价值借鉴)

defuddle `src/extractors/youtube.ts`(MIT,一手源码通读):

- **选择器成组封装**:`TranscriptSelectors { segments, timestamp, text, chapters }`,桌面/移动两套常量(DESKTOP/MOBILE_TRANSCRIPT_SELECTORS),容器探测先于选择器选择(`getTranscriptContainer` + `getTranscriptSelectors`)。
- **DOM 优先、多级回退**:`extractAsync()` 顺序 = 已渲染 DOM(`extractTranscriptFromExistingDom`)→ `fetchTranscript()`(API)→ `extractTranscriptFromOpenedDom()`(点击面板)。
- **打开折叠面板 + 轮询等待**:桌面路径点击 `ytd-video-description-transcript-section-renderer button` 后 `pollFor`(250ms × 20 次)等 `#segments-container` 出现——正是 spec User Story #5"打开折叠 Transcript 并等待渲染"的现成实现。
- **分段模型**:`{ start: 秒, text }[]`,`parseTimestamp` 支持 mm:ss / h:mm:ss;这与 spec 第 104 行"start times 为整秒 + 保序"一致。
- **SPA 导航防串台**:多处校验 inline JSON(ytInitialPlayerResponse/ytInitialData)的 videoId 与当前 URL 一致才使用(`getValidatedPlayerResponse`、`getInlineChapters` 注释:YouTube 客户端导航后 inline 数据是旧页面的)——YouTube 是 SPA,我们必须同样设防。
- **字幕可读性分组**:`groupTranscriptSegments` 按speaker 标记(>>)或句读把碎段合并成可读块,含 CJK 句末标点正则(。!?)与中英混排断句正则。对本项目:云检索按原始碎段索引、Markdown 输出按可读分组,两层都可用。
- **语言选择**:caption track 偏好 非-ASR > 精确语言 > 基础语言(`pickCaptionTrack`/`findPreferredCaptionTrack`)。

### 7.2 与 spec 冲突的部分(必须剥离)

- `fetchTranscript()`/`fetchPlayerData()` 走**非官方 InnerTube API**(iOS/Android/WEB client 三连回退,`INNERTUBE_API_URL`)。spec Implementation Decisions 第 88 行明令:**不得用 YouTube Data API、OAuth caption 下载或第三方 transcript 服务**;Extensions Review 政策对隐匿 API 抓取同样敏感。**若依赖 defuddle,必须只用其 DOM 路径**:`new Defuddle(doc, { url })` 且关闭 async 抓取(defuddle README Options:`useAsync: false`——"Allow async extractors to fetch from third-party APIs" 默认 true,必须显式关),或干脆只借鉴 youtube.ts 的 DOM 部分自实现。注意 clipper 自己调 `parseAsync()` 正是为拿到 `{{transcript}}` async 变量(`src/content.ts` L216-221),这条捷径我们不能抄。
- youtube.ts 的 `buildResult` 把内容拼成 embed iframe + 描述 + 字幕 HTML 的**展示形 HTML**,而 spec 要求的是 normalized capture(结构化 segments);序列化目标不同,不能整体复用其输出层,只复用其**抽取层**。

### 7.3 引入 vs 借鉴的权衡

- **整包引入 defuddle**:得到 29 个站点提取器与持续维护,但(a)默认 async 抓第三方 API 需显式关闭;(b)其 youtube 输出是展示形 HTML,还需二次解析;(c)把核心 capture boundary 的命运绑在外部包的发布节奏上。
- **借鉴自研(推荐)**:youtube.ts 的 DOM 选择器表、面板打开流程、SPA 校验、分组算法都是 MIT,可按 §9 许可边界搬运改造;capture boundary 保持自有代码,fixture 契约锁行为。与 wayfinder 地图 #1"参考项目借码"姿势一致:借模式与局部代码,不嫁接运行时依赖。

## 8. MIT 借用边界确认(对应研究问题 6)

- `LICENSE`(全文通读):标准 MIT,Copyright (c) 2024 Obsidian。义务:在"copies or substantial portions of the Software"中保留版权与许可声明;无商标授权。
- `README.md:109` 明示:**"Obsidian Web Clipper source code is open source under the MIT License. All trademarks, icons, marketing copy, and other marketing assets are excluded from that license."**——图标(`src/icons/`、`assets/`)、营销文案、Obsidian 名称/品牌全部在许可之外。
- 操作含义:
  1. 复制任何源码片段(如 youtube.ts 的选择器表、分组算法)须在我们的仓库保留其 MIT 头与出处注记(满足 "above copyright notice … included");
  2. **不得**沿用其图标、logo、截图、README 文案、`obsidian-clipper`/`Obsidian Web Clipper` 命名(商标与素材排除);spec 第 113 行"保留自有产品身份、尊重第三方商标"即此;
  3. 依赖形式使用(defuddle、dompurify、webextension-polyfill)各自按其许可证:defuddle/lz-string MIT;dompurify 双许可可选 Apache-2.0;**webextension-polyfill 是 MPL-2.0——只作 npm 依赖调用、不 vendoring 其源码,则无文件级传染问题**。

## 9. 落地建议(供 wayfinder 地图后续票引用)

1. capture boundary 形状:content script 内 `extractCapture(doc, url) -> NormalizedCapture`(纯函数,可注入 Document),选择器集中在单一 `youtube-selectors.ts` 数据模块;popup/云代码只见 NormalizedCapture。(§1、§2.3)
2. 净化策略:capture boundary 出口对全部字符串字段做统一处理——文本字段(标题/频道/描述/segment text)进入 HTML 上下文前 escape 或 DOMPurify;扩展 UI 内任何 innerHTML 写入一律 `RETURN_DOM_FRAGMENT + replaceChildren`。(§3)
3. 构建:第一天空仓即三份 manifest 源文件 + `BROWSER` env 输出目录选择;Terser keep-fnames。(§4)
4. 测试:vitest + webextension-polyfill 单点 mock(alias);fixture 三元组 `<case>.html` + `<case>.json` → `expected/<case>.md` + `expected/<case>.capture.json`,冻结时间,首跑自动生成基线;fixture 覆盖按 spec 第 121 行五类。(§5)
5. YouTube 专项:抄 defuddle youtube.ts 的桌面/移动选择器表、`pollFor(250ms×20)` 面板等待、SPA videoId 校验、`parseTimestamp`;**禁用其 InnerTube 路径**;分组算法(CJK 友好)按需移植并保留 MIT 注记。(§7)
6. 依赖引入:webextension-polyfill(依赖形式)、dompurify;不引入 lz-string;defuddle 倾向不整包引入、只按 MIT 借码。(§6、§7.3)

## 附:引用索引

- obsidian-clipper 源码(均指 commit `9aa509b`):`webpack.config.js`、`vitest.config.ts`、`package.json`、`LICENSE`、`README.md:109`、`src/content.ts`、`src/api.ts`、`src/types/types.ts`、`src/core/highlights.ts:1217`、`src/utils/{i18n.ts:221, clip-utils.ts, shared.ts:257, triggers.ts, content-extractor.ts:127, template-integration.test.ts}`、`src/utils/variables/selector.ts`、`src/utils/__mocks__/webextension-polyfill.ts`、`src/managers/template-manager.ts`、`src/utils/import-export.ts`、`src/manifest.{chrome,firefox,safari}.json`、`scripts/build-api.mjs`
- defuddle:GitHub kepano/defuddle `README.md`(Bundles/Options/Third-party services 节)、`src/extractors/` 目录列表(GitHub API)、`src/extractors/youtube.ts`(raw 一手源码)
- 许可证:npm registry `defuddle`(MIT)、`webextension-polyfill`(MPL-2.0)、`lz-string`(MIT)、`dompurify`(MPL-2.0 OR Apache-2.0)
- 本项目约束:`.scratch/youtube-transcript-knowledge-platform/spec.md` L88-93(capture boundary/净化)、L100(单一 normalized 表示)、L104(整秒时间戳)、L118-128(测试契约与 fixture 覆盖)
