# 搜索服务设计（CQRS 架构）

> **状态边界（2026-09-04 复验）**：search 服务已切到 Elasticsearch。`products.search_catalog` 的表、trigger、publication、Debezium table include、Kafka topic、Sink 映射、strict mapping 和稳定 alias 均已运行；search Pod 通过 `ecommerce_catalog_products` 查询，增量改价/删除/还原与网关查询已经验收。NATS JetStream、自写 relay 和 `tools/search-indexer` 已从代码与集群退役，不再承担搜索写入。Meilisearch 运行资源已于 2026-09-04 完整退役。重建、offset 恢复、积压判断、Sink fail-stop/原 offset 重放与 alias 回退的唯一操作入口是 pipeline 仓 `deploy/docker-node3/RUNBOOK.md`。拓扑看 [`.service-matrix.yaml`](../../../.service-matrix.yaml)，进度看 [`TODO.md`](../../../TODO.md)，分线判据看 [`row-projection-vs-domain-event.md`](../../../context/project/ecommerce/events/experience/row-projection-vs-domain-event.md)。

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

`products.outbox → outbox relay → NATS JetStream → tools/search-indexer → alias` 这条链已从仓库删除。它的生产者从未存在（Product 没有商品写 RPC，也没有调用 `outbox.Insert`），增量部分一直空转。旧 worker 的 ACK/NACK、`MaxDeliver` 与应用层水位语义只属于历史，不再维护；当前 alias 原子切换、回退和重建由 pipeline 手顺定义。

### 运行态

2026-09-03 已完成运行时切流：search Pod 使用 Elasticsearch provider，readiness 深检稳定 alias，经网关查询命中；`products.search_catalog` 回填 7 行，改价、删除、还原的 trigger 与 CDC 增量链均通过实测。切流前曾因新配置先于新镜像发布而 CrashLoopBackOff；该事故保留为「发布与回滚」的顺序约束，不再作为当前状态。

## 投影写入

### `products.search_catalog` 表

一行一个策展文档，列与 [商品索引契约](#商品索引契约) 的字段一一对应，主键 `id` = SPU id。维护方式：

- `AFTER INSERT/UPDATE/DELETE` trigger 挂在 `products.spus`、`products.skus`、`products.sale_detail` 上，按受影响的 `spu_id` 重算单行；重算 SQL 只存在于 `products.search_catalog_refresh`，pipeline reindex 直接扫描投影表，不再重复定义聚合逻辑。
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

策展投影文档的真相源是 `products.search_catalog` 的列（[`00005_search_catalog.sql`](../../../backend/services/product/internal/data/migrations/00005_search_catalog.sql)）；Elasticsearch mapping 的真相源是 pipeline 仓 `deploy/docker-node3/index-mappings.json`；`backend/pkg/searchindex.Doc` 是 search 服务读路径对同一文档的 Go 表示，三者字段必须一一对应。静态 Go 测试核对 DTO 与本仓读模型，pipeline 的 `verify-search-contract.sh` 核对 live PG、trigger、Connector、mapping 与 alias：

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
| `updated_at` | `date`，`strict_date_optional_time_nanos||epoch_millis` | 投影刷新时刻，表示索引新鲜度，不是商品业务时间 |

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
- `behavior.on.malformed.documents=fail` 与 `errors.tolerance=none` 保证 task fail-stop，原 topic offset 不前进。task trace 与原 topic/partition/offset 是恢复真相源；DLQ 只作诊断出口，固定 Sink 版本完成 malformed fault injection 前，不保证每类失败都会生成副本。修复后由 Sink 从原 offset 重放；DLQ 不是消费游标。
- 「全绿但死了」是这条链已实测过的故障形态：容器 healthy、task RUNNING、位点不推进。告警看 `pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)` 与 sink consumer lag，不看容器健康。

## 全量重建与 alias 切换

由 pipeline 仓的 reindex Job 承接。只重建 ES 搜索索引时执行 `REINDEX_SCOPE=search-catalog ./reindex.sh`；PG 投影表自身不一致时，先实际隔离商品写入，再执行 `PRODUCT_WRITES_DISABLED=true REBUILD_SEARCH_CATALOG=true REINDEX_SCOPE=search-catalog ./reindex.sh`。PG+ES 流程分两个数据库事务：第一阶段锁表重算并提交 PG 投影；第二阶段重新建立 PostgreSQL `SHARE` 写屏障，等待 Source slot/committed offset 越过屏障并让旧 alias 的 Sink lag 归零，再暂停 Sink、全量写新物理索引、校验 mapping/计数/逐文档内容、独占保存旧 topology、原子切换 alias、恢复 Sink 并复验，最后释放写屏障。外部商品写入隔离必须覆盖两个事务之间的交接。失败时默认保持 Sink 为 `PAUSED`；执行前已暂停的 Sink 在成功后也默认恢复为 `PAUSED`。恢复旧 alias 不会回退 Sink offset；如果 offset 已推进，不能直接在旧 alias 上 resume，必须再建 fresh index。alias/backing/mapping 损坏且 Sink 无法在旧 alias 追平时，需先实际隔离搜索读取，再使用 `SEARCH_READS_DISABLED=true REINDEX_RECOVERY_MODE=true`。完整步骤见 pipeline 仓 `deploy/docker-node3/RUNBOOK.md`。

`pkg/searchindex.Reindex` 是切流前的遗留止血实现，没有 CLI，也不是当前操作入口。当前不得为它恢复常驻 worker、broker consumer 或应用层 ACK 语义；全量重建和 alias 回退只维护 pipeline 仓手顺。

## 配置、安全与网络

search 服务使用 `search.catalog`：

- `endpoint` 必须是 `http://` 或 `https://` URL，凭据不得嵌在 URL 中。
- 认证二选一：API key，或同时提供 username/password；两种方式不能并用。
- `index` 填稳定 alias `ecommerce_catalog_products`。
- 凭据只进入 Config Center、Secret 或本地环境，不进入仓库。
- `search.catalog` 变化只告警、不热建客户端；修改端点、凭据或 alias 后需要滚动重启。

网络拓扑阻断已于 2026-09-02 解除：Elasticsearch 本机仍只监听 node3 回环地址，Pod 经受控隧道端点 `https://es.apikv.com`（Pangolin rid 47 → node3 newt → `127.0.0.1:9200`，TLS 在 node1 Traefik 终止，SSO off）访问，正反凭据与 Pod 内可达性均已实测（2026-09-03）。search 服务的 key 实测为 `read + view_index_metadata`，`write`/`manage`/`monitor` 均为否，够 readiness 用；Sink 侧写 key 由 pipeline 仓管理。2026-09-04 重建 search Pod 后，`/healthz` 深检与真实 ConnectRPC 查询均通过。

## 能力状态

| 能力 | 代码状态 | 运行状态或缺口 |
|---|---|---|
| `SearchCatalog` provider-neutral 查询边界 | 已实现并有 vendor-type 门禁 | 只有 `esCatalog` 一个 provider，不是 capability seam |
| Elasticsearch 读路径 | 已实现 | 2026-09-03 已切流；新镜像、readiness、稳定 alias 与网关查询实测通过 |
| `products.search_catalog` 表 + trigger | 已实现 | dev 库已执行并回填；三类 trigger 的改价、删除与还原实测通过 |
| Debezium + Elasticsearch Sink 搬运 | 已实现 | publication、table include、topic、mapping 和 Sink 映射已接线，增量约 6 秒 |
| strict mapping、IK 分词与稳定 alias | 已实现并有合约检查 | 基础查询已验收；真实商品大样本相关性仍待验证 |
| PG 投影重算、ES 全量重建、alias 原子切换与回退 | pipeline 仓 reindex Job + 状态文件 | `REBUILD_SEARCH_CATALOG`/`REINDEX_SCOPE=search-catalog`、失败保持 Sink 暂停、完整 partition lag 与逐文档门禁已固化 |
| 存量 NATS 增量 indexer 与 relay | 已删除（2026-09-03） | 集群侧 `nats` ns、`ecommerce-search-indexer`/`ecommerce-outbox-relay` Deployment 已卸载（实测 2026-09-03：ns NotFound、Deployment 不存在） |
| Product 事务内 outbox producer | 未实现 | 搜索不再依赖它；留给订单域事件 |
| 类目、品牌、价格区间、属性 Facet | 未实现 | 需先扩展 RPC 契约、投影表列、mapping 与查询语义 |
| 价格、销量、新品等显式排序 | 未实现 | RPC 当前无排序参数 |
| 补全、热门词、同义词、拼音与 typo 策略 | 未实现 | IK 不能单独解决「苹果手机→Apple iPhone」等归一化问题 |
| Connect 链路告警（slot 位点差、task 状态、sink lag） | 已上线〔实测 2026-09-06〕 | node3 vmalert `ecommerce-cdc.yml` 12 条 + `cdc-connect-exporter`（按 task 暴露 REST 状态）；暂停 Source 触发测试 ~3 分钟到达 Alertmanager。源：pipeline 仓 `deploy/docker-node3/monitoring/` |
| 生产容量与 HA | 未验收 | `replicas=0`、node3 单机同时承载 PG/ES/Kafka/Connect/观测；node3 有序重启演练已通过（[报告](../../reports/2026-09-06-node3-reboot-drill.md)），断电/崩溃恢复与容量仍无证据 |

## 运行时切流证据

2026-09-03 已完成以下验收：

1. Pod 经受控入口访问 Elasticsearch；正确凭据返回 200，匿名和错误凭据返回 401。
2. Config Center 与新 search 镜像已同步；Pod 为 `Ready`，`/healthz` 深检稳定 alias。
3. `00005_search_catalog.sql` 已执行并回填 7 行；publication、Debezium、Kafka topic、Sink mapping 与 alias 均已接线。
4. 改价、删除、还原触发投影重算并在约 6 秒内到达 Elasticsearch；经网关查询命中。
5. NATS、indexer、relay 与 Meilisearch 的代码或运行资源均已退役；Meilisearch 的 Secret、路由、PVC/PV 与 namespace 于 2026-09-04 同步删除。

尚未完成的是生产容量/HA 证据与灾备手顺的破坏性故障注入（断电、WAL 损坏、ES 分片恢复）；链路告警与有序重启演练已于 2026-09-06 完成。这些缺口不能反写为「搜索尚未切流」。

## 发布与回滚

新代码只接受 `search.catalog`。2026-09-04 回滚窗口结束后，旧 Meilisearch 运行资源、Secret 与索引数据均已删除，不再存在可直接切回的旧路径；紧急回退必须显式启用安装器中的退役组件、重建索引，并恢复与旧镜像匹配的版本化 Bootstrap。

回滚旧镜像时必须同时恢复与之匹配的旧 Bootstrap。Elasticsearch reindex 在 alias 原子切换前不会影响读路径；切换成功或失败都不会自动删除旧物理索引，状态文件可用于原子恢复旧 alias 拓扑。旧索引只保留到验收和回滚窗口结束，过期清理由独立、显式且已核对索引名的操作完成。
