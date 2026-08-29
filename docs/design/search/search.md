# 搜索服务设计（CQRS 架构）

> 从根 `DESIGN.md` 拆出（2026-08-08）。2026-08-21，查询端已从退役的 Elasticsearch
> 迁移到 Meilisearch；dev 集群已部署 NATS JetStream、outbox relay 和 search indexer，并完成
> 7 个示例 SPU 的全量回灌与相关性验收。Product Service 尚无商品写 RPC，因此增量生产者接线
> 仍未完成。2026-08-27 已决策把本链作为 NATS→Kafka 的首条迁移链，先写 shadow index 再切流；进度以 `TODO.md` 为准。

搜索服务采用 CQRS 命令查询职责分离架构。PostgreSQL 保存商品真相，搜索存储只保存可重建的只读投影。存量 Meilisearch 仍在运行；目标按 [TECH.md](../../TECH.md) 迁移到隐藏于 `SearchCatalog` 接口后的 Elasticsearch。

## 核心架构

1. 命令端：存量 Product Service 写 PostgreSQL；目标由 Catalog Service 管理 Product（SPU）、SKU、Listing、Category。
2. 事件端：Product Service 应在同一事务写入 broker-neutral outbox；目标 relay 发布到 Kafka。当前 NATS 链保留到 Kafka shadow index 验收通过。
3. 索引端：search-projection 消费 Catalog 领域事件，并以幂等方式更新目标 Elasticsearch 索引；存量 indexer 继续写 Meilisearch，直到新投影完成验证和切流。
4. 查询端：Search Service 通过 `SearchCatalog` 读取搜索投影，不在请求路径回查 PostgreSQL；索引必须支持从 PostgreSQL 全量重建。

索引写入组件和 dev Deployment 已部署。当前 Product Service 只有查询路径，没有商品写 RPC，
也没有调用 `outbox.Insert`；因此 reindex 可以从 PostgreSQL 全量回灌，增量链路则只处理已写入
`products.outbox` 的事件。新增商品写路径时，必须在同一业务事务中补齐第 2 步。

## 商品索引契约

**后续决策覆盖（2026-08-28）**：以下字段与业务语义继续作为投影契约输入，但 Meilisearch 专属的 settings、key scope、index swap task 等实现细节不再是目标契约；目标须按 Elasticsearch 重建 mapping、alias、权限与原子切换方案，并隐藏于 `SearchCatalog` 接口后。

`backend/pkg/searchindex.Doc` 是索引文档的代码真相源：

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

索引设置如下：

- 主键：`id`。
- 可搜索字段：`name`、`spu_code`、`description`。
- 可过滤字段：`status`、`merchant_id`。
- 可排序字段：`price`、`sale_count`、`updated_at`。

`price` 是最低有效 SKU 价格的数值投影，只用于搜索结果展示和排序。金额真相仍在 PostgreSQL，交易计算不得使用索引值。

## 查询边界

- 当前 `Search` RPC 使用请求的 `name` 作为存量 Meilisearch 查询串；目标查询由 `SearchCatalog` 适配 Elasticsearch。
- 服务端固定查询配置中的 `products` 索引，并强制使用 `status = online` 过滤条件。
- `SearchRequest.index` 仅为兼容旧客户端保留，已标记为 deprecated，服务端忽略传入值。
- 搜索结果按扁平索引字段解析：`price` 对应价格，`sale_count` 对应返回值中的 `quantity`。
- Config Center 保存查询端的 Meilisearch 主机、索引名和 API key；查询 key 仅授予 `products` 索引的 `search` 动作。
- 持续 indexer 使用独立 Kubernetes Secret，只允许 `products` 的文档写入、索引读取/创建、设置更新和任务读取。
- reindex Job 使用另一个 action-scoped key。Meilisearch 的 index swap task 没有单一 `indexUid`，
  限定为两个具体索引的 key 无法读取 swap task，因此 reindex key 的 index scope 是 `*`；
  actions 仍只保留重建所需的文档、索引、设置和任务操作。

## 能力状态

- 已实现：商品名、SPU 编码和描述的全文检索；仅返回 `online` 商品；就绪检查同时验证 API key、`products` 索引和 `status` 过滤设置。
- 尚未实现：类目、品牌、价格区间和商品属性的组合筛选。
- 尚未实现：销量、价格、新品和综合权重排序。
- 尚未实现：搜索词补全、热门搜索和相关搜索推荐。
- dev 集群现状：3 节点 JetStream、R1 `ECOMMERCE_EVENTS`、单副本 relay 和单副本 indexer；
  `MaxAckPending=1`，worker 镜像按 digest 固定。
- 数据集现状：使用仓库幂等 seed 灌入 7 个 SPU、13 个 SKU 和 21 条销量明细；reindex 后
  `products` 为 7 个文档。`降噪`、`咖啡`、`修护`、`无线鼠标`、`跑鞋`、`快速充电`、
  `iphone-15-pro` 和拼写容错 `Nespreso` 均将预期商品排在首位。
- 已验证：暂停 relay 时 outbox 行保持未发布；恢复 relay 后事件发布、consumer pending 归零，
  Meilisearch 投影收敛。另以外部会话持有 PostgreSQL 咨询锁，确认并发 reindex 会快速失败；
  释放锁后重跑成功且没有残留 `products_rebuild` 索引。
- 已知缺口：`苹果手机` 尚不能召回英文名称 `Apple iPhone 15 Pro`。同义词、拼音和中文品牌
  归一化需要单独定义词表与离线评测集，不能用本次 7 个示例商品宣称通用中文相关性。
- 尚未完成：Product Service 事务内 `outbox.Insert`、Kafka topic/schema/ACL、Kafka relay/indexer、shadow index 差异校验、持久 retry/DLQ、KEDA lag 扩缩和真实商品大样本评测。Kafka 切流前，当前 NATS 链与回滚数据不得提前删除。

## dev 部署清单

- relay：`backend/tools/outbox-relay/deploy/dev/deployment.yaml`。
- indexer：`backend/tools/search-indexer/deploy/dev/deployment.yaml`。
- dev 商品 seed：`backend/tools/dbmigrate/deploy/dev/product-seed-job.yaml`。
- 一次性 reindex：`backend/tools/search-indexer/deploy/dev/reindex-job.yaml`。
- 操作顺序、Secret 契约与验收命令：`backend/tools/search-indexer/deploy/dev/README.md`。

## 发布与回滚

本次迁移不支持旧配置与新镜像混跑：旧镜像不识别 `meilisearch`，新镜像也不再接受 `elastic_search`。旧前端会继续发送 `SearchRequest.index`，新后端会忽略该字段，因此前端可在后端之后独立发布。

- 本次 dev 后端迁移已执行「更新 Config Center → 发布新后端 → 验证旧客户端兼容」；本次请求未部署前端。旧 search 当时已因 Elasticsearch 退役而不可用，因此配置切换没有扩大已有服务中断。
- 回滚不能只回退镜像。必须同时恢复与旧镜像匹配的 Bootstrap；旧前端也依赖必填的 `index` 字段。
- 后续若要求无中断迁移，应使用新的 Config Center 键或版本化 selector，让新旧 Deployment 分别读取各自兼容的 Bootstrap，再切换流量。

## 性能与一致性

- 搜索读取不占用商品主库查询资源；搜索投影故障不得影响交易正确性。
- 存量 Meilisearch 写入是异步任务；当前 indexer 仅在任务成功后 ack NATS。目标 Elasticsearch consumer 成功更新投影后才提交 Kafka offset，并遵守统一 Inbox/DLQ 契约。
- 商品事件采用完整文档投影，重复消费以整文档覆盖方式收敛。
- 删除事件写入 tombstone，重建索引使用临时索引与原子 swap。
- reindex 从 PostgreSQL 时钟读取扫描前水位，并在 swap 后重放水位后的行；PostgreSQL 咨询锁
  保证同一索引只运行一个重建任务。旧索引删除失败会令 Job 失败，不会静默报告成功。
- 当前 RPC 未暴露分页和排序参数；新增这些字段前必须先在设计文档明确语义和上限。
