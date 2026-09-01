# 搜索服务设计（CQRS 架构）

> **状态边界（2026-09 代码迁移）**：search 服务与 `tools/search-indexer` 的仓库代码已从 Meilisearch 改为 Elasticsearch，`backend/go.mod` 不再依赖 Meilisearch；这只是**代码接线完成**。node3 的 Elasticsearch 9.4.5 + IK 仍只监听 `127.0.0.1:9200`，Pod 没有网络通路，尚未完成运行时切流。存量 Meilisearch 部署在切流和回滚窗口结束前继续存在。拓扑看 [`.service-matrix.yaml`](../../../.service-matrix.yaml)，进度看 [`TODO.md`](../../../TODO.md)。

搜索服务采用 CQRS。PostgreSQL 保存商品真相，Elasticsearch 只保存可从 PostgreSQL 重建的只读投影。搜索不可成为价格、库存或交易状态的事实来源。

## 设计不变量

1. **PostgreSQL 是唯一事实源**：索引中的价格、销量和状态只用于召回、展示和排序，交易计算必须回到领域数据。
2. **查询路径不回查主库**：Search Service 只读搜索投影；投影故障可以让搜索降级，但不能改变交易正确性。
3. **策展投影只有一个权威写入者**：[`tools/search-indexer`](../../../backend/tools/search-indexer/main.go) 负责增量写入与全量重建。Debezium→Kafka→Elasticsearch 的 CDC 演示链不拥有该投影，不能写入稳定 alias。
4. **索引可重建**：全量重建必须使用临时物理索引、原子切换稳定 alias，并补偿扫描期间发生的变更。
5. **代码态与运行态分开验收**：代码依赖、配置契约、部署清单、网络通路和真实流量切换是不同完成条件；任何一项未完成都不能写成「搜索已迁移到 Elasticsearch」。

## 组件边界

| 角色 | 当前实现 | 边界 |
|---|---|---|
| 查询契约 | [`SearchCatalog`](../../../backend/services/search/internal/data/data.go) | 返回项目自有 `CatalogProduct`，不暴露 Elasticsearch SDK 类型 |
| 查询 provider | [`esCatalog`](../../../backend/services/search/internal/data/catalog.go) | 当前唯一生产 provider；这是单实现 deep-module boundary，不是 capability seam |
| Elasticsearch 适配层 | [`backend/pkg/searchindex`](../../../backend/pkg/searchindex/) | 拥有 SDK、HTTP 请求、mapping、alias、写入与重建细节 |
| 策展投影写入者 | [`tools/search-indexer`](../../../backend/tools/search-indexer/main.go) | 唯一权威写入者；持续消费与 `reindex` 两种模式共用同一契约 |
| 事件传输 | PostgreSQL outbox → relay → NATS JetStream | 当前代码仍使用 NATS；目标 Kafka 主干尚未接业务 producer/consumer |
| 查询入口 | Search RPC → repository → `SearchCatalog` | 请求路径只读稳定 alias，不回查 PostgreSQL |

`SearchCatalog` 的签名由反射测试递归检查：任何 `github.com/elastic/*` 或 `github.com/meilisearch/*` 类型进入参数、返回值或嵌套类型都会令测试失败。判据见 [`context/team/capability-seams.md`](../../../context/team/capability-seams.md)。

## 当前数据流

### 仓库代码态

```text
Product 业务事务（生产者尚未接）
  → products.outbox
  → outbox relay
  → NATS JetStream
  → tools/search-indexer
  → Elasticsearch alias: ecommerce_catalog_products

Search RPC
  → searchRepo
  → SearchCatalog
  → esCatalog
  → Elasticsearch alias: ecommerce_catalog_products
```

Product Service 当前没有完整的商品写 RPC，也没有在业务事务中调用 `outbox.Insert`。因此，全量 `reindex` 已有从 PostgreSQL 建投影的代码路径；增量链只能消费实际写入 outbox 的事件，不能据此宣称商品变更已经自动同步。

### 运行态

新代码尚未切流。node3 Elasticsearch 只在宿主机回环地址监听，集群 Pod 无法直接访问；当前 deploy/Helm 里的 Meilisearch 内容仍如实描述存量运行路径，不是新代码的部署说明。建立 Pod→Elasticsearch 的受控网络通路、更新 Config Center 与部署产物、发布新镜像并完成真实查询验收后，运行态才算切换。

## 商品索引契约

`backend/pkg/searchindex.Doc` 是策展投影文档的代码真相源：

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
| `sale_count` | `long` | `products.spu_total_sales` 的展示/排序投影 |
| `updated_at` | `date`，`strict_date_time` | 新鲜度与重建水位补偿 |

mapping 使用 `dynamic: strict`，未知字段会被拒绝。当前代码创建索引时设置 `number_of_replicas: 0` 和 `index.translog.durability: request`；这是单实例开发形态，不构成生产 HA 结论。

稳定 alias 固定为 `ecommerce_catalog_products`。读写双方只使用 alias，物理索引使用 `ecommerce_catalog_products-000001` 或带 UTC 时间戳的 `-rebuild-*` 名称。

## 查询契约

- `SearchCatalog.SearchProducts` 接收查询串并返回 `[]CatalogProduct`，Consumer 不解析 Elasticsearch response。
- 非空查询使用 `multi_match`：`name^4`、`spu_code.search^3`、`description`，类型为 `best_fields`；空查询使用 `match_all`。
- 服务端固定增加 `status=online` 过滤。当前内部默认返回 20 条，上限 100；RPC 尚未暴露分页、排序或筛选参数。
- `SearchRequest.index` 仅为旧客户端兼容而保留，服务端忽略传入值。
- readiness 检查鉴权、Elasticsearch 9.x 主版本、稳定 alias，以及同一条最小搜索路径。只检查进程或 TCP 端口不算就绪。

## 增量写入与 ACK 边界

事件携带完整投影文档：

- `ecommerce.product.spu.upserted` 以稳定文档 ID 覆盖写入。
- `ecommerce.product.spu.deleted` 按同一 ID 删除；重复删除已不存在的文档视为幂等成功，但 alias 不存在仍报错。
- Elasticsearch 主分片确认写入，且 `translog.durability=request` 生效后，indexer 才 ACK JetStream。refresh 只控制可见性，不是持久化边界。
- ACK 丢失会触发重投；稳定文档 ID 让重复 upsert 收敛。当前 `MaxAckPending=1`，避免旧事件在重投乱序后覆盖新投影。
- 达到 `MaxDeliver` 的毒消息执行 TERM 并留日志。持久 DLQ、授权重放和审计仍是待办，TERM 不能冒充完整 DLQ。

## 全量重建与 alias 切换

`search-indexer -mode reindex` 按以下顺序执行：

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

当前阻断不是客户端实现，而是网络拓扑：Elasticsearch 只监听 node3 回环地址。切流方案必须先给 Pod 提供私网或受控隧道端点，再配最小权限凭据、传输保护、健康检查和超时；不能把 SSH 手工端口转发当生产通路。

## 能力状态

| 能力 | 代码状态 | 运行状态或缺口 |
|---|---|---|
| `SearchCatalog` provider-neutral 查询边界 | 已实现并有 vendor-type 门禁 | 只有 `esCatalog` 一个 provider，不是 capability seam |
| Elasticsearch 读路径 | 已实现 | Pod 无网络通路，未切流 |
| Elasticsearch 增量 indexer | 已实现 | 新 indexer 尚未发布到运行环境 |
| strict mapping、IK 分词与稳定 alias | 已实现并有 HTTP 合约测试 | 未完成真实商品大样本相关性验收 |
| 全量重建、alias 原子切换、水位补偿 | 已实现并有单元测试 | 未在目标运行通路完成恢复演练 |
| Product 事务内 outbox producer | 未实现 | 商品变更不能自动形成完整增量链 |
| 类目、品牌、价格区间、属性 Facet | 未实现 | 需先扩展 RPC 契约、mapping 与查询语义 |
| 价格、销量、新品等显式排序 | 未实现 | RPC 当前无排序参数 |
| 补全、热门词、同义词、拼音与 typo 策略 | 未实现 | IK 不能单独解决「苹果手机→Apple iPhone」等归一化问题 |
| Kafka 搜索消费者、Inbox、DLQ | 未实现 | 当前仍是 NATS 迁移链 |
| 生产容量与 HA | 未验收 | `replicas=0`、无固定数据集与故障恢复证据 |

## 运行时切流完成条件

运行时切流必须按顺序给出证据：

1. 建立 Pod 可达、受控且可观测的 Elasticsearch 网络入口，验证正确凭据可用、错误凭据被拒绝。
2. 用版本化配置或协调窗口更新 Config Center 的 `search.catalog`，同步更新 search 与 indexer 的部署产物。
3. 发布新 search 和 `tools/search-indexer`，确认 readiness 走稳定 alias，而不是只探 TCP。
4. 从 PostgreSQL 全量重建，核对文档数量、关键字段、`online` 过滤和固定查询集结果。
5. 验证增量 upsert、delete、重复投递、断连恢复、毒消息和水位补偿。
6. 切真实查询流量并观察错误率、延迟、索引新鲜度与 NATS pending。
7. 回滚窗口结束后再退役 Meilisearch 运行资源、旧 Secret 和旧配置；代码移除不能代替这一步。

## 发布与回滚

新代码只接受 `search.catalog`，旧 Meilisearch 镜像依赖旧配置。不能让新旧镜像共用一份互不兼容的 Bootstrap；需要并行验证时使用版本化 selector/key，或在协调窗口同时切配置与工作负载。

回滚旧镜像时必须同时恢复与之匹配的旧 Bootstrap。Elasticsearch reindex 在 alias 原子切换前不会影响读路径；切换后的水位补偿失败会保留旧物理索引供检查，但成功流程会删除旧物理索引，因此不能把它当成无限期自动回滚机制。
