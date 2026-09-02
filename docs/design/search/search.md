# 搜索服务设计（CQRS 架构）

> **状态边界（2026-09-03 复核）**：search 服务的仓库代码已从 Meilisearch 改为 Elasticsearch，`backend/go.mod` 不再依赖 Meilisearch 与 NATS。node3 的 Elasticsearch 9.4.5 + IK 本机只监听 `127.0.0.1:9200`，2026-09-02 起经 Pangolin 暴露 `https://es.apikv.com`（SSO off，鉴权在 ES 自身）；实测集群内匿名 401、错误 key 401、正确 key 200。Config Center 已写入 `search.catalog`，但运行中的仍是旧 Meilisearch 镜像，因 Bootstrap 不兼容而 CrashLoopBackOff；alias `ecommerce_catalog_products` 尚不存在。**投影写入路径同日重新平衡**：改为 PostgreSQL 表 `products.search_catalog` → Debezium → Kafka → Elasticsearch Sink（见「投影写入」）；`tools/search-indexer`、`tools/outbox-relay`、`tools/cdc-demo` 与 `pkg/outbox/{relay,stream}.go` 已从仓库删除，迁移 `00005_search_catalog.sql` 已写。NATS 与 indexer/relay 的集群资源已同日卸载；存量 Meilisearch 运行资源在切流和回滚窗口结束前继续存在，代码删除不等于运行退役。拓扑看 [`.service-matrix.yaml`](../../../.service-matrix.yaml)，进度看 [`TODO.md`](../../../TODO.md)，分线判据看 [`row-projection-vs-domain-event.md`](../../../context/project/ecommerce/events/experience/row-projection-vs-domain-event.md)。

搜索服务采用 CQRS。PostgreSQL 保存商品真相，Elasticsearch 只保存可从 PostgreSQL 重建的只读投影。搜索不可成为价格、库存或交易状态的事实来源。

## 设计不变量

1. **PostgreSQL 是唯一事实源**：索引中的价格、销量和状态只用于召回、展示和排序，交易计算必须回到领域数据。
2. **查询路径不回查主库**：Search Service 只读搜索投影；投影故障可以让搜索降级，但不能改变交易正确性。
3. **策展投影只有一处定义**：PostgreSQL 表 `products.search_catalog`（[`00005_search_catalog.sql`](../../../backend/services/product/internal/data/migrations/00005_search_catalog.sql)），一行对应一个策展文档，由 trigger 在 `spus`/`skus`/`sale_detail` 变更时重算。Debezium + Elasticsearch Sink 只搬运这张表，不定义投影；Sink 直写裸行形成的 `ecommerce_products_*` 六个镜像索引不是策展投影，search 服务不得读取它们。本仓不再有自写 indexer。
4. **索引可重建**：全量重建必须使用临时物理索引、原子切换稳定 alias，并补偿扫描期间发生的变更。
5. **代码态与运行态分开验收**：代码依赖、配置契约、部署清单、网络通路和真实流量切换是不同完成条件；任何一项未完成都不能写成「搜索已迁移到 Elasticsearch」。

## 组件边界

| 角色 | 当前实现 | 边界 |
|---|---|---|
| 查询契约 | [`SearchCatalog`](../../../backend/services/search/internal/data/data.go) | 返回项目自有 `CatalogProduct`，不暴露 Elasticsearch SDK 类型 |
| 查询 provider | [`esCatalog`](../../../backend/services/search/internal/data/catalog.go) | 当前唯一生产 provider；这是单实现 deep-module boundary，不是 capability seam |
| Elasticsearch 适配层 | [`backend/pkg/searchindex`](../../../backend/pkg/searchindex/) | 拥有 SDK、HTTP 请求、mapping、alias 与读路径细节；保留 `Reindex` 库函数作切流前止血用 |
| 策展投影定义 | `products.search_catalog` 表（[`00005_search_catalog.sql`](../../../backend/services/product/internal/data/migrations/00005_search_catalog.sql)） | 投影 = PG 行的函数；trigger 维护，任何写入 PG 的路径自动覆盖 |
| 策展投影搬运 | Debezium → Kafka → Elasticsearch Sink（同级仓 `postgres-kafka-es-streaming-pipeline`，node3 运行中） | 只搬运不定义；幂等由 `_id` 覆盖写 + offset external version 承担 |
| 全量重建 | pipeline 仓 reindex Job（版本化索引 + alias 原子切换） | 与实时 Sink 分开执行：暂停 Sink → 重建 → 校验 → 切 alias → 恢复 Sink → lag 归零 |
| 已删除（2026-09-03） | `tools/search-indexer`、`tools/outbox-relay`、`tools/cdc-demo`、`pkg/outbox/{relay,stream}.go` | 只承载过搜索投影；`pkg/outbox` 只保留 `Insert`，留给订单域事件；relay 不重写成 Kafka 版 |
| 查询入口 | Search RPC → repository → `SearchCatalog` | 请求路径只读稳定 alias，不回查 PostgreSQL，不感知搬运层 |

`SearchCatalog` 的签名由反射测试递归检查：任何 `github.com/elastic/*` 或 `github.com/meilisearch/*` 类型进入参数、返回值或嵌套类型都会令测试失败。判据见 [`context/team/capability-seams.md`](../../../context/team/capability-seams.md)。

## 数据流

### 目标态（2026-09-03 定）

```text
任何写入 PostgreSQL 的路径（seed / 后台 SQL / 未来 RPC）
  → products.spus / skus / sale_detail
  → trigger 重算 products.search_catalog 该 SPU 一行
  → Debezium（WAL）→ Kafka topic ecommerce_cdc.products.search_catalog
  → Elasticsearch Sink → alias: ecommerce_catalog_products

Search RPC
  → searchRepo
  → SearchCatalog
  → esCatalog
  → Elasticsearch alias: ecommerce_catalog_products
```

这条路径不依赖 Product 服务的写 RPC 或 outbox 生产者。搜索新鲜度由 Connect 决定：Connect 停止时索引仍可查、只是不再更新，这是可接受的降级，但必须有告警（slot 位点差、connector task 状态、sink consumer lag），不能只看容器健康。

### 已删除的存量链（2026-09-03）

`products.outbox → outbox relay → NATS JetStream → tools/search-indexer → alias` 这条链已从仓库删除。它的生产者从未存在（Product 没有商品写 RPC，也没有调用 `outbox.Insert`），增量部分一直空转；它验证过的 alias 原子切换与水位补偿设计保留在 `pkg/searchindex.Reindex` 与本文「全量重建」一节。

### 运行态

search Pod 跑的是 Meilisearch 时代的旧镜像，读到 Config Center 的新 `search.catalog` 后严格解码失败（`'search' has invalid keys: catalog`），CrashLoopBackOff。这是「发布与回滚」一节警告的 Bootstrap 不兼容：配置先于镜像切换，且未走版本化配置或协调窗口。恢复顺序见「运行时切流完成条件」。

## 投影写入

### `products.search_catalog` 表

一行一个策展文档，列与 [商品索引契约](#商品索引契约) 的字段一一对应，主键 `id` = SPU id。维护方式：

- `AFTER INSERT/UPDATE/DELETE` trigger 挂在 `products.spus`、`products.skus`、`products.sale_detail` 上，按受影响的 `spu_id` 重算单行；重算 SQL 与 `pkg/searchindex` 的 reindex SQL 同源。
- `spus.status = 'deleted'` 或 SPU 行删除时删除投影行，Debezium 发 tombstone，Sink 删除文档。
- 不用物化视图：`REFRESH` 是全量重写，Debezium 也不捕获物化视图。
- `products.spu_total_sales` 是 VIEW，Debezium 抓不到；投影表正好绕开它。

选 trigger 而不是应用层同事务 upsert 的理由：投影是 PG 行的纯函数，不含业务判断；今天没有任何 Go 写路径（product 只有 `GetProductDetail`），应用层维护零收益；trigger 覆盖 seed、修数 SQL 和未来所有 RPC，不依赖开发者纪律。应用层更优的条件（投影需要 PG 之外的信息、需要延迟发布、团队禁止 DB 侧逻辑）当前都不成立。

### 搬运与 Sink

- publication `ecommerce_cdc` 是 `FOR TABLE` 显式列表，新表要同时加进 publication 和 Debezium `table.include.list`。
- Sink 的 `topic.to.external.resource.mapping` 增加 `ecommerce_cdc.products.search_catalog:ecommerce_catalog_products`；`index-mappings.json` 增加一份 mapping，字段类型照 [商品索引契约](#商品索引契约)。
- Sink 语义沿用 pipeline 仓已验收的配置：`key.ignore=false`、`write.method=INSERT`、`behavior.on.null.values=DELETE`、`behavior.on.malformed.documents=fail`、DLQ topic `ecommerce_cdc.elasticsearch.dlq`。
- search 服务只读 key 权限保持 `read + view_index_metadata`；Sink 用 pipeline 仓已有的写 key。

## 商品索引契约

策展投影文档的真相源是 `products.search_catalog` 的列（[`00005_search_catalog.sql`](../../../backend/services/product/internal/data/migrations/00005_search_catalog.sql)）；Elasticsearch mapping 的真相源是 pipeline 仓 `deploy/docker-node3/index-mappings.json`；`backend/pkg/searchindex.Doc` 是 search 服务读路径对同一文档的 Go 表示，三者字段必须一一对应：

```json
{
  "id": 42,
  "spu_code": "SPU-42",
  "name": "鲁班灯",
  "description": "商品描述",
  "status": "online",
  "main_media_url": "https://example.test/42.webp",
  "merchant_id": "merchant-id",
  "price": 199.5,
  "sale_count": 17,
  "updated_at": "2026-08-21T00:00:00Z"
}
```

字段语义：

| 字段 | Elasticsearch mapping | 约束 |
|---|---|---|
| `id` | `long` | SPU 数值主键，也是稳定文档 ID |
| `spu_code` | `keyword` + `spu_code.search` 文本子字段 | 精确过滤使用 keyword，检索使用 standard analyzer |
| `name` | `text` | 索引用 `ik_max_word`，检索用 `ik_smart` |
| `description` | `text` | 索引用 `ik_max_word`，检索用 `ik_smart` |
| `status` | `keyword` | 查询端固定过滤 `online` |
| `main_media_url` | `keyword`，不建索引与 doc values | 仅随结果展示 |
| `merchant_id` | `keyword` | 商家过滤预留 |
| `price` | `scaled_float`，`scaling_factor=100` | 最低有效 SKU 价格投影；不得用于交易计算 |
| `sale_count` | `long` | `products.sale_detail` 按 SPU 求和的展示/排序投影（与 `spu_total_sales` 视图同义，视图本身进不了逻辑复制） |
| `updated_at` | `date`，`strict_date_time` | 投影刷新时刻，表示索引新鲜度，不是商品业务时间 |

mapping 使用 `dynamic: strict`，未知字段会被拒绝。`number_of_replicas: 0` 是单实例开发形态，不构成生产 HA 结论。

稳定 alias 固定为 `ecommerce_catalog_products`。读写双方只使用 alias；物理索引由 pipeline 仓 reindex Job 按 `ecommerce_catalog_products_v<UTC 时间戳>` 版本化命名，`pkg/searchindex.Reindex` 的止血路径则使用 `-000001` 或 `-rebuild-*` 名称。

## 查询契约

- `SearchCatalog.SearchProducts` 接收查询串并返回 `[]CatalogProduct`，Consumer 不解析 Elasticsearch response。
- 非空查询使用 `multi_match`：`name^4`、`spu_code.search^3`、`description`，类型为 `best_fields`；空查询使用 `match_all`。
- 服务端固定增加 `status=online` 过滤。当前内部默认返回 20 条，上限 100；RPC 尚未暴露分页、排序或筛选参数。
- `SearchRequest.index` 仅为旧客户端兼容而保留，服务端忽略传入值。
- readiness 检查鉴权、Elasticsearch 9.x 主版本、稳定 alias，以及同一条最小搜索路径。只检查进程或 TCP 端口不算就绪。

## 增量写入与幂等边界

增量语义由 Debezium + Elasticsearch Sink 承担，本仓没有消费者代码：

- WAL 位点即游标：Connect 提交 offset 后才推进 `confirmed_flush_lsn`；崩溃后从上次位点重放，表现为至少一次。
- 文档 `_id` = 行主键（`extractKey` SMT 取 `id`），重复投递收敛为覆盖写；Kafka offset 作 external version，过期或乱序事件不会覆盖新状态。
- 投影行删除 → Debezium tombstone → `behavior.on.null.values=DELETE` 删除文档。
- `behavior.on.malformed.documents=fail`：坏文档使 task 失败并保留 offset，不静默丢弃；DLQ topic `ecommerce_cdc.elasticsearch.dlq` 只用于诊断。
- 「全绿但死了」是这条链已实测过的故障形态：容器 healthy、task RUNNING、位点不推进。告警看 `pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)` 与 sink consumer lag，不看容器健康。

## 全量重建与 alias 切换

由 pipeline 仓的 reindex Job 承接（版本化索引 + `switch-aliases.sh` 原子切换），并且必须与实时 Sink 分开执行：暂停 Sink → 重建到新版本索引 → 计数与抽样校验 → 切 alias → 恢复 Sink → 等待 lag 归零。不要在切 alias 前恢复 Sink，否则扫描期间的变更只写进旧索引。

`pkg/searchindex.Reindex` 保留了带水位补偿的重建路径（不经 broker），可作切流前止血建 alias 用；它的 CLI 已随 `tools/search-indexer` 删除，需要时以一次性 Job 调用库函数：

1. 以 alias 名获取 PostgreSQL session advisory lock，拒绝同一投影并发重建。
2. 从 PostgreSQL 时钟读取扫描前水位，并向前留 5 秒补偿窗口。
3. 从 PostgreSQL 全量生成策展文档，创建 strict mapping 的临时物理索引并批量写入。
4. refresh 临时索引后，在一次 `_aliases` 请求中移除旧指向并添加新写索引。
5. 重放水位后的 upsert 与 delete，再次 refresh。
6. 水位补偿可见后删除旧物理索引；删除失败使任务失败，不静默报告成功。

alias 更新响应丢失时，清理逻辑会先反查 alias；无法确认临时索引是否已激活时保留现场，避免误删正在承载查询的索引。

## 配置、安全与网络

search 服务使用 `search.catalog`：

- `endpoint` 必须是 `http://` 或 `https://` URL，凭据不得嵌在 URL 中。
- 认证二选一：API key，或同时提供 username/password；两种方式不能并用。
- `index` 填稳定 alias `ecommerce_catalog_products`。
- 凭据只进入 Config Center、Secret 或本地环境，不进入仓库。
- `search.catalog` 变化只告警、不热建客户端；修改端点、凭据或 alias 后需要滚动重启。

网络拓扑阻断已于 2026-09-02 解除：Elasticsearch 本机仍只监听 node3 回环地址，Pod 经受控隧道端点 `https://es.apikv.com`（Pangolin rid 47 → node3 newt → `127.0.0.1:9200`，TLS 在 node1 Traefik 终止，SSO off）访问，正反凭据与 Pod 内可达性均已实测（2026-09-03）。search 服务的 key 实测为 `read + view_index_metadata`，`write`/`manage`/`monitor` 均为否，够 readiness 用；Sink 侧写 key 由 pipeline 仓管理。剩余前置：健康检查与超时验收。

## 能力状态

| 能力 | 代码状态 | 运行状态或缺口 |
|---|---|---|
| `SearchCatalog` provider-neutral 查询边界 | 已实现并有 vendor-type 门禁 | 只有 `esCatalog` 一个 provider，不是 capability seam |
| Elasticsearch 读路径 | 已实现 | 通路已建；新镜像未发布，alias 未建 |
| `products.search_catalog` 表 + trigger | 迁移已写（`00005_search_catalog.sql`） | 未在 dev 库执行；未加入 publication 与 Debezium `table.include.list` |
| Debezium + Elasticsearch Sink 搬运 | pipeline 仓已实现并验收（六表） | 待加投影表、mapping 与 topic 映射 |
| strict mapping、IK 分词与稳定 alias | 已实现并有 HTTP 合约测试 | 未完成真实商品大样本相关性验收 |
| 全量重建、alias 原子切换 | pipeline 仓 reindex Job；本仓 `pkg/searchindex.Reindex` 库函数 | 目标态收敛到 pipeline 仓；本仓库函数无 CLI，仅止血用 |
| 存量 NATS 增量 indexer 与 relay | 已删除（2026-09-03） | 集群侧 `nats` ns、`ecommerce-search-indexer`/`ecommerce-outbox-relay` Deployment 已卸载（实测 2026-09-03：ns NotFound、Deployment 不存在） |
| Product 事务内 outbox producer | 未实现 | 搜索不再依赖它；留给订单域事件 |
| 类目、品牌、价格区间、属性 Facet | 未实现 | 需先扩展 RPC 契约、投影表列、mapping 与查询语义 |
| 价格、销量、新品等显式排序 | 未实现 | RPC 当前无排序参数 |
| 补全、热门词、同义词、拼音与 typo 策略 | 未实现 | IK 不能单独解决「苹果手机→Apple iPhone」等归一化问题 |
| Connect 链路告警（slot 位点差、task 状态、sink lag） | 未实现 | Connect 成为搜索新鲜度的生产依赖后必须有 |
| 生产容量与 HA | 未验收 | `replicas=0`、node3 单机同时承载 PG/ES/Kafka/Connect/观测，无故障恢复证据 |

## 运行时切流完成条件

运行时切流必须按顺序给出证据：

1. 建立 Pod 可达、受控且可观测的 Elasticsearch 网络入口，验证正确凭据可用、错误凭据被拒绝。〔已完成，实测 2026-09-03〕
2. 用版本化配置或协调窗口更新 Config Center 的 `search.catalog`，同步更新 search 的部署产物。〔配置已写入，但先于镜像切换，旧镜像因此崩溃——违反了本条的「同步」要求〕
3. 建立投影：执行 `00005_search_catalog.sql`（表 + trigger + 回填）→ 加入 publication 与 Debezium `table.include.list` → Sink 加 mapping 与 topic 映射 → 由 pipeline 仓 reindex Job 建版本化索引并切 alias。核对文档数量、关键字段、`online` 过滤和固定查询集结果。
4. 发布新 search 镜像，确认 readiness 走稳定 alias，而不是只探 TCP。
5. 验证增量：改 `spus`/`skus`/`sale_detail` 任一表，确认投影行重算、Sink 写入、删除 tombstone、Connect 重启恢复、malformed 文档进 DLQ 且 task 状态可见。
6. 切真实查询流量并观察错误率、延迟、索引新鲜度、slot 位点差与 sink consumer lag。
7. 回滚窗口结束后再退役 Meilisearch 运行资源（`search` ns 的 StatefulSet，实测 2026-09-03 仍 1/1 Running 但已无写入者）、旧 Secret 和旧配置；NATS 与 indexer/relay 的集群资源已于 2026-09-03 随代码一并卸载。代码移除不能代替运行退役这一步。

## 发布与回滚

新代码只接受 `search.catalog`，旧 Meilisearch 镜像依赖旧配置。不能让新旧镜像共用一份互不兼容的 Bootstrap；需要并行验证时使用版本化 selector/key，或在协调窗口同时切配置与工作负载。

回滚旧镜像时必须同时恢复与之匹配的旧 Bootstrap。Elasticsearch reindex 在 alias 原子切换前不会影响读路径；切换后的水位补偿失败会保留旧物理索引供检查，但成功流程会删除旧物理索引，因此不能把它当成无限期自动回滚机制。
