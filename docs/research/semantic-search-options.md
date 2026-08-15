# 语义检索自托管方案研究

- Issue: liujiaqi222/transcriptly#4(wayfinder:research,阻塞 #7「语义检索架构决策」)
- 研究方法: 仅采信一手来源(pgvector/Ollama/Meilisearch/Typesense/PostgreSQL/OpenAI 官方文档、Hugging Face 模型卡、GitHub 仓库与 LICENSE 文件),每条结论带引用;license 均经 GitHub API 或仓库 LICENSE 原文核验
- 结论用途: 为 TypeScript + Postgres 云服务在自托管硬约束下的 transcript segment 检索架构提供候选清单与权衡依据
- 约束回顾(来自 #1 地图与 spec): 自部署是硬约束(云端 DB/embedding/认证每个组件必须有自托管路径);检索对象是 transcript segments(短文本、带整秒时间戳);查询混合精确词与语义;CJK 覆盖是必备(fixture 明确含 CJK 转写);本地端零 embedding、零向量库,重索引只属于云端;索引是 derived data,可从规范化转写全量重建

## TL;DR 候选清单

| # | 方案 | 语义检索能力 | 精确检索能力 | 自托管路径 | 主要成本/风险 |
|---|------|------------|------------|-----------|--------------|
| A | Postgres + pgvector + FTS(+ 自托管 embedding 服务) | ANN(HNSW/IVFFlat)+ tsvector 同库同事务 | tsvector/tsquery,拉丁语系好;CJK 需 pg_trgm/pg_bigm/pg_jieba 补齐 | pgvector 扩展(PG13+,Docker 官方镜像)+ Ollama | 嵌入供给是独立运维件;CJK 精确检索要额外扩展;过滤+ANN 有后置过滤语义 |
| B | 方案 A 但 embedding 由应用进程内生成(transformers.js/ONNX) | 同上 | 同上 | 无额外服务,Node 进程内跑 ONNX | 模型 ~1GB 级内存驻留应用进程;吞吐受限于 API 进程;冷启动 |
| C | 方案 A + 外部 embedding API(OpenAI)作可选加速 | 同上(质量略升,MTEB 62→65) | 同上 | 依赖外部 SaaS,数据出境 | 只能是默认关闭的 opt-in;换模型=全量重嵌 |
| D | Meilisearch 独立引擎 | 内建 hybrid(自动嵌入管线+semanticRatio 融合) | 内建全文+typo tolerance | 单二进制/Docker;核心 MIT,EE 模块 BUSL-1.1 | 多一个数据平面,需 Postgres→Meili 同步管线;嵌入配置变更触发全量重嵌 |
| E | Typesense 独立引擎 | 向量字段+auto-embedding(内置 ONNX/OpenAI 兼容 API/自备模型)+ rank fusion hybrid | 内建关键字搜索+过滤 | DEB/RPM/Docker;**GPL-3.0** | 同上多一数据平面;GPL 对分发场景有传染性顾虑;内置多语模型覆盖需逐个核验 |

推荐倾向(供 #7 决策): **A 为主线**(pgvector + Postgres FTS 同库,嵌入供给选 Ollama 作为默认、transformers.js 作轻量备选、外部 API 作显式 opt-in 加速;CJK 精确检索用 pg_trgm 兜底 + pg_jieba/pg_bigm 按需增强);D/E 作为"检索体验优先、接受双数据平面"的备选。理由见 §6。

---

## 1. pgvector:版本、索引、运维面

### 1.1 版本与安装

- 当前版本 v0.8.6,支持 PostgreSQL 13+;提供官方 Docker 镜像(`pgvector/pgvector:pg13` ~ `pg18`)、APT/Yum/Homebrew/PGXN 包,Postgres.app 预装,主流托管 Postgres 均可用 [pgvector README「Installation」](https://github.com/pgvector/pgvector)。自托管 Docker 部署零编译成本。
- License:PostgreSQL License(BSD 类)[pgvector README](https://github.com/pgvector/pgvector)。对商用与闭源集成无约束。
- TypeScript 一等支持:官方 `pgvector-node` 客户端库(pg / node-postgres / postgres.js / Prisma / Drizzle 集成)[pgvector README「Languages」](https://github.com/pgvector/pgvector)。

### 1.2 索引类型与权衡

| 维度 | HNSW | IVFFlat |
|------|------|---------|
| 查询性能(speed-recall 权衡) | 更好 | 更差 |
| 构建时间 | 更慢 | 更快 |
| 内存 | 更多 | 更少 |
| 空表可建索引 | 可以(无训练步) | 不行,需先有数据;lists 建议 `rows/1000`(≤1M)、`sqrt(rows)`(>1M) |

来源: [pgvector README「Indexing」「HNSW」「IVFFlat」](https://github.com/pgvector/pgvector)。

对本项目的含义: 个人库/公共库的 segment 总量在 10⁴~10⁷ 量级,优先 HNSW;建索引调 `maintenance_work_mem`、生产用 `CREATE INDEX CONCURRENTLY` [README「Index Build Time」「Querying」](https://github.com/pgvector/pgvector)。

### 1.3 关键参数与坑(均出自 README)

- 维度上限: `vector` 可索引至 2000 维、`halfvec` 4000、binary 64000、`sparsevec` 1000 非零元素 [README「Indexing」](https://github.com/pgvector/pgvector)。主流多语模型(bge-m3/e5-large = 1024 维,见 §3)在 `vector` 上限内。
- 存储公式: `vector` 每行 `4 × dims + 8` 字节 [README「Vector Type」](https://github.com/pgvector/pgvector) → 1024 维 ≈ 4KB/segment;百万 segment ≈ 4GB 数据 + HNSW 索引开销,单机 Postgres 完全可承载。README 亦给出 32TB 单表上限与分区扩展路径 [FAQ](https://github.com/pgvector/pgvector)。
- **过滤发生在 ANN 扫描之后**: 带 `WHERE user_id = …` 的 ANN 查询,过滤在索引扫描后应用,选择性高时结果可能不足;0.8.0+ 提供 `hnsw.iterative_scan`(strict/relaxed)自动扩扫 [README「Filtering」「Iterative Index Scans」](https://github.com/pgvector/pgvector)。对本项目直接相关: 私有库搜索必须带 owner 过滤,需默认开启迭代扫描或接受"多取再滤"的查询形状。
- 多租户: 官方明确共享近似索引会互相干扰 recall,租户隔离建议 list 分区或分表 [README「Multitenancy」](https://github.com/pgvector/pgvector)。若按 user 维度隔离成本高,至少 public/private 两个 scope 可用部分索引/分区表达。
- 距离函数: cosine(`<=>`)、inner product(`<#>`)、L2 等 [README「Querying」](https://github.com/pgvector/pgvector);归一化模型(OpenAI 与多数检索模型)可用内积提速 [README「Exact Search」](https://github.com/pgvector/pgvector)。
- 运维: HNSW 的 VACUUM 较慢,官方建议先 `REINDEX INDEX CONCURRENTLY` 再 VACUUM [README「Vacuuming」](https://github.com/pgvector/pgvector);复制/PITR 走 WAL 原生支持 [FAQ](https://github.com/pgvector/pgvector)。

### 1.4 与 FTS 同库的运维面

- 同一数据库内 `tsvector` GIN 索引 + `vector` HNSW 索引并存,备份/恢复/事务/权限模型统一;pgvector 官方 hybrid search 章节即示范同表 FTS + 向量混合,并给出 RRF 与 cross-encoder 两种融合参考实现 [README「Hybrid Search」](https://github.com/pgvector/pgvector)、[rrf.py 示例](https://github.com/pgvector/pgvector-python/blob/master/examples/hybrid_search/rrf.py)。
- 需要关注的两个额外调参面: 向量索引构建期的 `maintenance_work_mem`/并行 worker [README「Index Build Time」](https://github.com/pgvector/pgvector),以及查询期 `hnsw.ef_search` / `ivfflat.probes` [README「Query Options」](https://github.com/pgvector/pgvector)。均属 DBA 常规手段,无新基础设施。

## 2. Postgres 原生 FTS 对精确检索的覆盖度(含 CJK)

### 2.1 拉丁语系: 覆盖良好

- `tsvector`/`tsquery` + GIN 是核心能力;默认 parser `pg_catalog.default` 识别 23 种 token 类型,`plainto_tsquery`/`websearch_to_tsquery` 可直接吃用户输入;排序用 `ts_rank`/`ts_rank_cd`(pgvector hybrid 示范即用 `ts_rank_cd`)[PG 文档 12 章](https://www.postgresql.org/docs/current/textsearch-intro.html)、[pgvector README「Hybrid Search」](https://github.com/pgvector/pgvector)。
- 硬限制(词元 <2KB、tsvector <1MB、位置 ≤16383 等)对 segment 级短文本无影响 [PG 文档 12.11 Limitations](https://www.postgresql.org/docs/current/textsearch-limitations.html)。

### 2.2 CJK: 默认 parser 不做分词,需要扩展

- 默认 parser 只"识别词边界"且"letter"概念由 `lc_ctype` 决定 [PG 文档 12.5 Parsers](https://www.postgresql.org/docs/current/textsearch-parsers.html);中日文连续汉字无空格,默认 parser 无法切成可用词元——这是 CJK 检索要靠扩展的根因。
- `pg_trgm`(contrib 自带,trusted 扩展,非超级用户可装 [PG 文档 F.35](https://www.postgresql.org/docs/current/pgtrgm.html)): 三字符组相似度 + GiST/GIN 索引,加速 `LIKE`/`ILIKE`/正则;但 pg_bigm 官方对比表明确: **pg_trgm 默认不支持非字母语言(如日语)的全文检索**(需注释掉 `KEEPONLYALNUM` 宏重编译),且 1–2 字符关键词只能退化为顺序扫描或全索引扫描 [pg_bigm 文档「Comparison with pg_trgm」](https://github.com/pgbigm/pg_bigm/blob/REL1_2_STABLE/docs/pg_bigm_en.md)。中文二字词高频,这点对体验影响大。
- `pg_bigm`(PostgreSQL License,NTT 出品): 2-gram GIN 索引,官方对比表声明支持非字母语言、1–2 字符关键词快;代价是仅 GIN、仅 `LIKE` 匹配、且必须配置 `shared_preload_libraries = 'pg_bigm'`(重启级运维动作)[pg_bigm 文档](https://github.com/pgbigm/pg_bigm/blob/REL1_2_STABLE/docs/pg_bigm_en.md)。支持 PG 9.1–19。
- `pg_jieba`(BSD-3-Clause,已核验): 基于 jieba 的中文分词 FTS 扩展,可产出正常 tsvector 词元,走标准 `to_tsquery` 管线 [GitHub jaiminpan/pg_jieba](https://github.com/jaiminpan/pg_jieba)。同类还有 zhparser(SCWS),未核验 license,列出备查: <https://github.com/wangfenjin/zhparser>。
- 另一条路: ParadeDB `pg_search`(Tantivy BM25 in Postgres)质量好但 **AGPL-3.0**(已核验),对闭源分发场景有顾虑,仅备选 [GitHub paradedb/paradedb](https://github.com/paradedb/paradedb)。

### 2.3 覆盖度判定

- 精确检索需求 = "搜索确切词与名字"(spec 用户故事 30)。英文/拉丁: 原生 FTS 足够。CJK: **原生 FTS 不够**,最少要 `pg_trgm`(trivial 上手、但二字词慢),进阶 `pg_bigm`(LIKE 语义、需 preload)或 `pg_jieba`(真分词、tsvector 语义)。语义检索路线(§3)对 CJK 的兜底也降低了精确通道的压力——两通道互补正是 hybrid 的动机。

## 3. 自托管 embedding 供给

### 3.1 供给通道

| 通道 | 形态 | 一手来源 |
|------|------|--------- | 
| Ollama(MIT,已核验) | 独立 HTTP 服务,`POST /api/embed`,支持 `input` 数组批量、`truncate`、`keep_alive`(默认 5m,可常驻);官方 JS 客户端 ollama-js `ollama.embed()` | [Ollama API 文档](https://github.com/ollama/ollama/blob/main/docs/api.md)、[bge-m3 库页 JS 示例](https://ollama.com/library/bge-m3)、[GitHub ollama/ollama](https://github.com/ollama/ollama) |
| transformers.js(Apache-2.0,已核验) | 应用进程内(Node/浏览器),`pipeline('feature-extraction')`,模型走 ONNX;无独立服务 | [transformers.js 文档](https://huggingface.co/docs/transformers.js/en/api/pipelines)、[GitHub](https://github.com/huggingface/transformers.js) |
| 裸 ONNX Runtime(未在本研究展开) | 自己管理 tokenizer+session,控制力最强、工作量最大 | 同上(底层同一生态) |

权衡: Ollama 把模型加载/量化/常驻管理好,代价是多一个部署件;transformers.js 零新增部署件,代价是模型权重(~1GB 级)驻留 API 进程内存、吞吐与 Web 服务抢资源。两者对 TS 栈都是纯 HTTP/库调用,无 Python 依赖。

### 3.2 模型候选(CJK 必须覆盖)

| 模型 | 维度 | 最大长度 | 语言 | License | 关键事实 |
|------|------|---------|------|---------|---------| 
| BAAI/bge-m3 | 1024 | 8192 token | 100+ 语言 | MIT(已核验) | dense/sparse/colbert 三模式单模型;MIRACL(多语检索)/MKQA(跨语)基准强;社区评测英文与其他语言均超 OpenAI 模型;模型卡明确推荐 hybrid 检索 + rerank 管线;Ollama 官方库收录(`bge-m3:latest`,1.2GB,8K 上下文,5.8M 下载) |
| intfloat/multilingual-e5-large-instruct | 1024 | 512 token(超长截断) | 100 语言(xlm-roberta 初始化) | MIT(已核验) | 0.6B 参数;**查询侧必须加 `Instruct: …\nQuery: …` 前缀否则性能退化**(文档侧不需要);模型卡自带中文查询示例 |
| intfloat/multilingual-e5 base/small | 768/384(家族存在小杯) | 512 | 100 语言 | MIT | 降内存/降延迟备选;具体参数以各模型卡为准([E5 合集](https://huggingface.co/collections/intfloat/multilingual-e5-text-embeddings-6737924cc9e3e8606e9b2d1d)) |

来源: [BAAI/bge-m3 模型卡](https://huggingface.co/BAAI/bge-m3)、[intfloat/multilingual-e5-large-instruct 模型卡](https://huggingface.co/intfloat/multilingual-e5-large-instruct)、[ollama.com/library/bge-m3](https://ollama.com/library/bge-m3)。

首选 **bge-m3** 的理由(全部有据): 覆盖 100+ 语言且 CJK 基准强;8192 token 长度对"多 segment 合并嵌入"友好;MIT;Ollama 一行拉取;额外产出 sparse lexical weights 可当 BM25 替代参与混合(§5)。e5-instruct 作备选时务必实现查询前缀逻辑,否则静默掉点。

### 3.3 资源开销

- 权重量级: bge-m3 在 Ollama 库为 1.2GB(≈0.57B 参数量化后)[ollama bge-m3](https://ollama.com/library/bge-m3);multilingual-e5-large-instruct 为 0.6B 参数 F16(模型卡 Safetensors 信息)[模型卡](https://huggingface.co/intfloat/multilingual-e5-large-instruct)。→ 供给服务按 **1.5–2.5GB 内存预算**规划(权重 + 运行时)。
- 计算特性: Meilisearch 官方定性 embedding 模型"小、快、便宜,远低于 LLM" [Meilisearch hybrid 文档](https://www.meilisearch.com/docs/learn/hybrid_search/hybrid_search);Typesense 官方同时提示"embedding 模型计算密集,大数据集可考虑 GPU 加速,仅索引与查询向量化用 GPU,ANN 检索本身不用" [Typesense vector search「Using a GPU」](https://typesense.org/docs/28.0/api/vector-search.html)。→ **推断**(标注): 本项目 segment 为短文本、查询为单条,CPU-only 推理可接受;吞吐瓶颈主要在历史回填批处理,可用队列限速解决。
- 查询路径新增一跳 embedding 推理(毫秒~几十毫秒级,CPU),对 P99 的影响需在 #7 的实现票里实测——本研究不下结论。

## 4. 外部 embedding API(OpenAI)的定位

- 模型事实: `text-embedding-3-small` 默认 1536 维 / `text-embedding-3-large` 3072 维,输入上限 8192 token,MTEB 62.3% / 64.6%;支持 `dimensions` 参数无损降维(Matryoshka);按输入 token 计费(small ≈ 62,500 页/$);向量归一化到长度 1,可用内积等价 cosine [OpenAI embeddings 官方文档](https://platform.openai.com/docs/guides/embeddings)。
- 数据与合规: OpenAI 明确"客户拥有其输入与输出(含 embeddings)" [同上 FAQ](https://platform.openai.com/docs/guides/embeddings);但调用即把转写原文送出自治边界——在"云端每个组件必须有自托管路径"的硬约束下(#1 地图 Notes),**外部 API 只能定位为显式 opt-in 的加速器/质量档位,不能是必经路径**。默认部署(自托管)应全程 Ollama/本地模型。
- 工程含义: 同库不同模型向量空间不兼容,**切换模型 = 全量重嵌入**;Meilisearch 对此有官方明示(改 embedder 配置触发全量 re-embed,可能产生 API 费用)[Meilisearch hybrid 文档](https://www.meilisearch.com/docs/learn/hybrid_search/hybrid_search),pgvector 同理(向量不可混用,需按模型分列/分表重建)。设计上应把 `model_id` 与向量绑定存储(pgvector FAQ 的多维度列方案)[pgvector FAQ](https://github.com/pgvector/pgvector)。

## 5. 混合检索(精确 + 语义)常见组合方式

三种主流融合,均有官方实现背书:

1. **RRF(Reciprocal Rank Fusion)**: 每路按名次贡献 `1/(k + rank)`,免调分、对异构分值稳健;pgvector 官方 hybrid 示例即此([rrf.py](https://github.com/pgvector/pgvector-python/blob/master/examples/hybrid_search/rrf.py)、[README「Hybrid Search」](https://github.com/pgvector/pgvector))。SQL 形态: FTS top-K 与 ANN top-K 各自子查询,应用层或 SQL 聚合 RRF。
2. **加权线性融合(可调旋钮)**: Typesense hybrid 默认 `0.7×关键字名次 + 0.3×语义名次`,`alpha` 可调,`rerank_hybrid_matches: true` 可补全两路分值 [Typesense「Hybrid Search」](https://typesense.org/docs/28.0/api/vector-search.html);Meilisearch 用 `semanticRatio`(默认 0.5)在"精确查询偏关键字、描述性查询偏语义"之间自动/手动调节 [Meilisearch hybrid 文档](https://www.meilisearch.com/docs/learn/hybrid_search/hybrid_search)。
3. **两阶段: 粗召回混合 + cross-encoder / reranker 精排**: pgvector 官方给 cross-encoder 参考实现 [README「Hybrid Search」](https://github.com/pgvector/pgvector);bge-m3 模型卡官方推荐"hybrid retrieval + re-ranking"管线,并指出其 sparse 输出可无额外成本地替代/补充 BM25 [bge-m3 模型卡](https://huggingface.co/BAAI/bge-m3)。MVP 可先不做精排(spec Out of Scope 未含 reranker,留作质量迭代)。

与授权边界的关系(spec: 私有检索不得串库): 在 Postgres 单库方案里,owner/published 过滤天然进两路子查询的 `WHERE`;注意 §1.3 的 ANN 后置过滤语义即可。bge-m3 的 sparse 通道 + pgvector 的 sparsevec 类型(1000 非零元素上限 [README](https://github.com/pgvector/pgvector))可构成"单模型三路融合"的进阶形态,但 bge-m3 词表级别 sparse 远超 1000 非零,需截断评估——记为 #7 的开放问题。

## 6. 独立检索引擎对比(Meilisearch vs Typesense)

### 6.1 能力面

- **Meilisearch**: 配置 embedder 后自动为全量文档生成向量(批处理、缓存、限流自动重试、Liquid `documentTemplate` 控制嵌入字段)[hybrid 文档](https://www.meilisearch.com/docs/learn/hybrid_search/hybrid_search);查询时关键字+语义并行、智能融合,`semanticRatio` 调权。embedder 来源: OpenAI、**HuggingFace 本地(引擎进程内跑模型)**、**REST embedder(任意兼容 API,可指向自托管 Ollama)**、`userProvided`(自算向量灌入);兼容性矩阵中已出现原生 `ollama` source [同上「Supported embedder providers」「Embedder field compatibility」](https://www.meilisearch.com/docs/learn/hybrid_search/hybrid_search)。→ 完全自托管的语义检索可由 Meilisearch+Ollama 组成,且引擎自管嵌入管线。
- **Typesense**: `float[]` + `num_dim` 向量字段、内置 HNSW、KNN 查询;auto-embedding 支持内置 `ts.*` ONNX 模型、OpenAI、**OpenAI 兼容 API(可指向自托管服务)**、自备 ONNX 模型(`model_type` 支持 `bert` 与 `xlm_roberta`——bge-m3 属 XLM-R 架构,理论可自托管加载,需自行转换验证)[vector search 文档](https://typesense.org/docs/28.0/api/vector-search.html)。hybrid 为 `query_by` 混合普通字段与向量字段的 rank fusion(§5.2)。`filter_by` 可与向量查询组合。

### 6.2 自托管复杂度与许可

- 部署面相近: Meilisearch 单二进制/cURL 安装脚本/Docker/Homebrew/APT,支持 Linux(amd64/arm64, glibc 2.35+)/macOS 14+ [官方安装文档](https://www.meilisearch.com/docs/resources/self_hosting/getting_started/install_locally);Typesense 提供 DEB/RPM/macOS 二进制/官方 Docker 镜像 [官方安装指南](https://typesense.org/docs/guide/install-typesense.html)。两者都是"多一个常驻服务 + 一条数据同步管道(Postgres → 引擎)",而 pgvector 方案的同步管道为零。
- **许可差异(已核验原文)**: Meilisearch = 核心 MIT + 显式标注 EE 的模块 BUSL-1.1(生产使用 EE 需商业授权,4 年 change date 后转 MIT)[LICENSE](https://github.com/meilisearch/meilisearch/blob/main/LICENSE)、[LICENSE-EE](https://github.com/meilisearch/meilisearch/blob/main/LICENSE-EE);自托管 OSS 功能集可行,但升级时需盯住 EE 边界。Typesense = **GPL-3.0** [GitHub typesense/typesense](https://github.com/typesense/typesense);对"仅网络调用、不分发二进制"的 SaaS 使用无触发,但若未来打包分发(桌面/一体机形态)需法务评估。
- 数据一致性: 两个引擎都是独立数据平面,Postgres 仍是 source of truth(符合 spec"索引是 derived data、可重建"),代价是删除/发布/取消发布的索引同步时效与故障处理。

### 6.3 取舍判定

- 引擎方案换来的主要是: 免自建 CJK 分词的内置全文体验(typo tolerance、同义词等)与现成 hybrid 融合。付出的主要是: 第二数据平面 + 同步管线 + 许可约束。
- 对 MVP(单库、个人库+公共库两个 scope、segment 级短文本): Postgres 单库方案(A)的运维面最小,且 spec 已要求 Postgres;检索体验的差距(打字纠错等)不属于 spec 承诺范围。故推荐 A 为主、D(Meilisearch)为检索体验优先时的备选、E(Typesense)因 GPL 与模型覆盖核验成本靠后。

## 7. 给 #7(语义检索架构决策)的输入清单

1. 存储与检索: pgvector 0.8.x(HNSW + cosine),`vector(1024)` 列挂 segment 表,模型 id 与向量绑定;查询默认 `SET LOCAL hnsw.iterative_scan = strict_order` 应对 owner 过滤 [pgvector README](https://github.com/pgvector/pgvector)。
2. 精确通道: 拉丁语走 tsvector + `websearch_to_tsquery`;CJK 起步 `pg_trgm`(trusted、零 preload),若二字词体验不达标再评估 `pg_bigm`(preload 成本)或 `pg_jieba`(BSD-3,真分词)[各文档见 §2]。
3. 嵌入供给: 默认 Ollama + bge-m3(MIT、100+ 语言、8K 上下文、Ollama 官方收录)[§3];备选 transformers.js 进程内;OpenAI 作显式 opt-in 加速档,`dimensions` 降维可对齐 1024 列(需实测质量)[§4]。
4. 融合: 先 RRF(pgvector 官方参考实现),旋钮化权重后置;reranker 留作迭代 [§5]。
5. 开放问题: bge-m3 sparse 通道与 pgvector sparsevec 1000 非零上限的截断可行性;embedding 查询延迟预算;CJK 分词扩展的最终选择;发布/取消发布时两路索引的失效策略。

## 引用

- pgvector README(安装/索引/过滤/迭代扫描/hybrid/FAQ/语言): https://github.com/pgvector/pgvector
- pgvector RRF 示例: https://github.com/pgvector/pgvector-python/blob/master/examples/hybrid_search/rrf.py
- PostgreSQL FTS parsers: https://www.postgresql.org/docs/current/textsearch-parsers.html ; Limitations: https://www.postgresql.org/docs/current/textsearch-limitations.html ; textsearch-intro: https://www.postgresql.org/docs/current/textsearch-intro.html
- pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html
- pg_bigm 1.2 文档(含 pg_trgm 对比表): https://github.com/pgbigm/pg_bigm/blob/REL1_2_STABLE/docs/pg_bigm_en.md
- pg_jieba: https://github.com/jaiminpan/pg_jieba ; zhparser(未核验): https://github.com/wangfenjin/zhparser ; ParadeDB(AGPL): https://github.com/paradedb/paradedb
- BAAI/bge-m3 模型卡: https://huggingface.co/BAAI/bge-m3
- intfloat/multilingual-e5-large-instruct 模型卡: https://huggingface.co/intfloat/multilingual-e5-large-instruct
- Ollama API(embed 端点): https://github.com/ollama/ollama/blob/main/docs/api.md ; Ollama 仓库(MIT): https://github.com/ollama/ollama ; bge-m3 库页: https://ollama.com/library/bge-m3
- transformers.js pipelines: https://huggingface.co/docs/transformers.js/en/api/pipelines ; 仓库(Apache-2.0): https://github.com/huggingface/transformers.js
- OpenAI embeddings 官方指南: https://platform.openai.com/docs/guides/embeddings
- Meilisearch hybrid/semantic search: https://www.meilisearch.com/docs/learn/hybrid_search/hybrid_search ; 本地安装: https://www.meilisearch.com/docs/resources/self_hosting/getting_started/install_locally ; LICENSE(MIT+BUSL): https://github.com/meilisearch/meilisearch/blob/main/LICENSE 与 LICENSE-EE
- Typesense vector search(核验于 v28.0 文档): https://typesense.org/docs/28.0/api/vector-search.html ; 安装: https://typesense.org/docs/guide/install-typesense.html ; 仓库(GPL-3.0): https://github.com/typesense/typesense
