# 术语表（GLOSSARY）

> **用途**：记录审问式学习中问到的专业术语，配合 [`TECH-RADAR.md`](TECH-RADAR.md) 等文档阅读。
> **维护约定**：审问中每问到一个新术语，追加一条；已收录术语被再次问到时就地补充。词条按领域分组，组内按首次收录顺序排列。
> **边界**：本文件只解释概念，不是选型真相源；选型结论以 [`STACK.md`](../STACK.md) 与 [`TECH-RADAR.md`](TECH-RADAR.md) 为准。每条分「含义」与「本项目」两部分，后者只登记指针与落点。

---

## 搜索（TECH-RADAR §2）

### Meilisearch

- **含义**：Rust 编写的开源搜索引擎，主打开箱即用的即时搜索体验：typo 容错、facet 过滤、sortable、中文分词（charabia+jieba）。
- **本项目**：§2 定稿主选型，v1.53 已装（`search/meilisearch:7700`）。注意 2025-08-27 起双许可：CE 保持 MIT 但无 HA，可用性模型 = 单实例 + 备份重建 + 索引全量重放。代码迁移见 `TODO.md`「搜索引擎切换」小节。
- **数据模型**：Meilisearch 自带存储引擎（LMDB），存一份完整的文档与索引副本；数据从真相源 PG **异步喂入**，查询只打 Meilisearch、不回源 PG——它是可丢弃、可全量重建的派生视图（见「真相源与派生视图」条）。

### typo 容错（typo tolerance）

- **含义**：用户输入有拼写错误时仍能命中正确结果。基于编辑距离（Levenshtein distance）实现：查询词与索引词相差 1–2 个字符的插入/删除/替换仍算匹配。Meilisearch 默认开启，按词长分级——默认 5 字符以上的词容 1 个错字、9 字符以上容 2 个，可按索引配置。
- **例子**：搜「iphoen」返回 iPhone 商品；搜「adidsa」返回 adidas。
- **本项目**：主要惠及英文品牌词、型号、拼音混输场景；关系库 `LIKE` 与 ES 默认 match 查询都不提供这种开箱容错，是 §2 里「覆盖 search.md 未落地能力」的一项。

### facet 过滤（faceted search）

- **含义**：分面搜索——把结构化属性（类目、品牌、价格区间、颜色）作为「面」，让用户在搜索结果内逐层筛选，并且返回每个取值的**命中计数**。「筛选 + 计数分布」同时返回是 facet 与普通 filter 的区别。
- **例子**：电商列表页左侧筛选栏「品牌：Apple (12) / 小米 (8)，价格：0–999 (5) / 1000+ (15)」。
- **本项目**：Meilisearch 中把字段声明进 `filterableAttributes` 后即可在查询时用 `filter` 条件与 `facets` 统计；商品搜索页的筛选栏依赖此能力。

### sortable（可排序字段）

- **含义**：允许用户指定排序键的字段能力。搜索引擎默认按相关性（relevancy）排序；把字段声明为可排序后，查询可改按该字段排（或与相关性结合）。需要显式声明是因为排序要建额外索引结构，有内存与写入成本。
- **例子**：商品列表切换「价格从低到高」「销量优先」「最新上架」。
- **本项目**：Meilisearch 中对应 `sortableAttributes` 配置 + 查询时 `sort` 参数。

### hybrid search（混合搜索）

- **含义**：关键词全文检索与向量语义检索的融合召回——既命中字面匹配，也命中「意思相近但字面不同」的结果。
- **本项目**：Meilisearch hybrid 走 userProvided 模式（向量由外部算好喂入），只作召回展示层；权威向量存储在 pgvector（§2.5 组合裁决）。

### 倒排索引（inverted index）

- **含义**：关键词检索的核心数据结构。正排是「文档 → 它包含哪些词」，倒排反过来存「词 → 包含该词的文档 ID 列表」。查询时按词直接取出文档列表做交并集，避免逐篇扫描。例：文档 1「红色 手机 壳」、文档 2「蓝色 手机」→ 倒排表 `手机→[1,2]`、`红色→[1]`；查「红色 手机」= 两表求交 = `[1]`。
- **对比**：向量检索属于另一族索引（HNSW 图、IVFFlat 聚类），回答「距离最近」而非「包含哪个词」。PostgreSQL 里真正的倒排结构是 GIN 索引（Generalized INverted index，服务 tsvector 全文检索、数组、JSONB），与 pgvector 无关。
- **本项目**：ES（Lucene）与 Meilisearch 的关键词检索内部都基于倒排族结构；项目不直接运维它，只通过声明 searchable/filterable/sortable 属性影响其构建。

## 向量检索（TECH-RADAR §2）

### pgvector

- **含义**：PostgreSQL 扩展，新增 `vector` 数据类型与相似度检索（余弦/内积/欧氏距离），支持 HNSW、IVFFlat 索引做近似最近邻查询。这两种都是向量近邻索引，**不是倒排索引**（区别见「倒排索引」条）。
- **本项目**：权威 embedding 存储。CNPG 官方 standard 操作数镜像已内置——换 `imageName` + `CREATE EXTENSION` 即可，零自定义镜像；向量随交易库共用同一套备份/PITR。规模位备选 Qdrant，触发条件 = embedding 数百万级或 HNSW 挤压交易库。

### embedding（向量嵌入）

- **含义**：用模型把文本、图片等内容映射成高维数字向量，语义相近的内容向量距离也近；是语义检索、相似推荐的数据基础。
- **本项目**：落 pgvector 为真相源，喂给 Meilisearch hybrid 作召回；生成侧方案未定，见 `search.md` 设计。

### HNSW（Hierarchical Navigable Small World）

- **含义**：近似最近邻（ANN）检索的分层图索引算法，查询快、召回率高，代价是索引常驻内存、构建与内存开销大。
- **本项目**：pgvector 支持的索引类型之一。「HNSW 挤压交易库」（内存被向量索引占走）被列为切换 Qdrant 的触发条件之一。

## 通用 / 基础设施

### HA（High Availability，高可用）

- **含义**：通过冗余部署（多副本、主从、共识复制）让单实例故障不中断服务。
- **本项目**：Meilisearch CE 无 HA（sharding/replication 属 EE/BUSL），故采用「单实例 + 备份重建 + 索引可全量重放」模型，读高可用需要时走双实例双写；且 3 台 VM 同宿主（物理故障域=1），组件级 HA 不等于容灾——这是 Typesense raft HA 优势被判「无法兑现」的原因。

### CNPG（CloudNativePG）

- **含义**：在 Kubernetes 上以 operator 方式管理 PostgreSQL 集群的开源项目（CNCF sandbox），提供声明式建库、复制、备份恢复。
- **本项目**：集群内 `pg-main` 即由 CNPG 管理（§3.1 既成事实确认）；补强待办 = instances=2 反亲和 + Barman Cloud Plugin 异地 PITR。

### 真相源与派生视图（source of truth / derived view）

- **含义**：真相源是数据的权威落地点，丢了就真丢；派生视图是从真相源加工出来的副本（搜索索引、缓存、物化报表），可丢弃、可重建。判断标准：这份数据坏了，能否从别处完整重建。
- **本项目**：PG（CNPG `pg-main`）是业务数据真相源；Meilisearch 索引、Redis 缓存、ClickHouse 埋点（可断代重放）都是派生视图。Meilisearch CE 无 HA 可接受、ClickHouse 单节点可接受，论据都建立在「派生视图可重建」上。
