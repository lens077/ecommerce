# events

**代码路径**：`backend/pkg/outbox/`（只剩同事务 `Insert`）、`backend/pkg/searchindex/`（ES 客户端、mapping、alias 与全量重建）

PostgreSQL 事务发件箱与搜索 projection 链。

> **目标态（2026-08-28，2026-09-03 重新平衡）**：按 `docs/TECH.md`，事件主干为外部非 K8s Apache Kafka。数据流分两条线，共用 Debezium（Kafka Connect）作搬运层：
> - **行投影线（CDC）**：PostgreSQL 表 → Debezium → Kafka → Kafka Connect Sink。搜索投影在此：`products.search_catalog` 表 → Elasticsearch Sink → 稳定 alias。
> - **领域事实线（Outbox）**：业务事务 + outbox → Debezium Outbox Event Router → Kafka → franz-go + Inbox 消费者 + DLQ。订单 Saga 副作用在此，当前零生产者零消费者。
>
> 自写 relay 与 NATS JetStream 只承载过搜索投影，**已于 2026-09-03 退役**：`tools/outbox-relay`、`tools/search-indexer`、`tools/cdc-demo`、`pkg/outbox/{relay,stream}.go` 与 `searchindex` 的 JetStream 消费者已删除，`go.mod` 不再依赖 `nats-io`；集群侧 `nats` namespace（helm release + 3 个 PVC）、两个 Deployment、NetworkPolicy、ServiceAccount 与 VPA 已卸载。relay 不重写成 Kafka 版。分类判据与决策经过见 [row-projection-vs-domain-event.md](experience/row-projection-vs-domain-event.md)。
>
> **代码态订正（2026-09）**：search 服务已从 Meilisearch 改为 Elasticsearch，策展投影隐藏在 `SearchCatalog` 项目契约后。Pod 到 Elasticsearch 的通路已经 Pangolin `es.apikv.com` 建立（2026-09-03 实测：集群内匿名 401、正确 key 200），但 Config Center 已写入 `search.catalog` 而运行中的仍是旧 Meilisearch 镜像，search Pod 因 Bootstrap 不兼容 CrashLoopBackOff；alias `ecommerce_catalog_products` 尚不存在。

## 当前事实

- **部署态（2026-09-03）**：NATS 链已从集群卸载；Meilisearch 仍在 `search` ns 运行但无写入者；search Pod 因 Bootstrap 不兼容 CrashLoopBackOff；alias `ecommerce_catalog_products` 不存在。搜索当前**不可用**，恢复路径是建 `products.search_catalog` 表 → Sink 映射 → 建 alias → 发新 search 镜像。
- **仓库代码态**：策展投影的写入者只剩 `pkg/searchindex.Reindex`（PG → 临时索引 → alias 原子切换，不经 broker），供切流前止血建 alias；目标态由 `products.search_catalog` 表 + Debezium + Elasticsearch Sink 承担，reindex 能力由 pipeline 仓的版本化索引 Job 承接。
- node3 的 Debezium 3.6.1 → Kafka → Elasticsearch Sink 链**已运行并验收**（同级仓 `postgres-kafka-es-streaming-pipeline`，2026-08-28），六张业务表镜像进 ES；它是目标态的生产搬运层，不再称「演示链」。`EventRouter` 与 `CloudEventsConverter` 已在其类路径上（2026-09-03 实测）。
- `pkg/outbox` 只有 `Insert`（同事务写一行，不再 `pg_notify`）。没有 broker-neutral `EventSink`、Kafka Adapter 或 Kafka CLI 模式，目标态也不需要——搬运由 Debezium Outbox Event Router 承担。
- node3 Kafka 已有基础设施，CDC 线在用；领域事件线仍零业务接线。
- outbox payload 当前为 JSON。`products.outbox` 表仍带 `published_at/attempts/last_error` 三列——那是自写 relay 的记账本，换 Debezium 后「是否已发布」由 WAL 位点回答，这三列待随线 B 迁移删除（见 `docs/todo/数据一致性与事件驱动.md`）。
- PostgreSQL sequence ID 不代表并发 producer 的 commit 顺序；Debezium 按 WAL 提交序投递，但领域顺序仍必须由 aggregate version 和 consumer fence 约束。
- outbox 表尚无清理策略；在 Inbox、DLQ、重放窗口和恢复证据完成前，不能把任何 cleanup 当成生产安全策略。

## 不可破坏的不变量

1. 业务写与 outbox insert 必须在同一 PostgreSQL transaction。
2. 搬运层只有收到 broker 确认才推进发布位点；确认后、位点落地前崩溃允许重复投递（Debezium 用 WAL 位点）。
3. consumer 必须按稳定 `event_id` 幂等；缓存和 broker 去重窗口不能替代持久 Inbox。行投影线的幂等由 Sink 以文档 `_id` 覆盖写 + offset external version 承担。
4. partition key/aggregate id 必须稳定；需要业务顺序的 consumer 还要校验单调 aggregate version。
5. NACK、max deliver、DLQ 和重放都不能跳过业务补偿与审计。
6. Outbox 表达领域事实，逻辑复制表达行变更；两者不得共用一套语义。**分线判据：没有这个事件，业务语义是否丢失**——否则归行投影线。跨表聚合不是选 Outbox 线的理由，把聚合物化成 PG 表即可走 CDC。
7. 策展投影的定义只有一处：`products.search_catalog` 表（目标态）。CDC 链只搬运，不定义投影；Sink 直写裸行的六个镜像索引不是策展投影。
8. broker、搜索和缓存都是可恢复依赖，不是交易真相源。

## P0 验收

- Product/Order 的业务写与 outbox 使用同 transaction，并有 rollback/duplicate 测试。
- consumer Inbox 与业务数据库副作用原子提交；外部副作用必须具备幂等键或补偿。
- stream 声明 owner、subject、replicas、retention、max bytes、积压 SLO 和恢复步骤。
- 交易 stream 验证 R3；可重建 stream 是否保留 R1 由 RTO 和重建成本决定。
- poison message 验证 NACK/backoff、max deliver、DLQ、告警、授权重放和审计。
- 用真实 payload 执行 Kafka 压测、积压恢复、broker kill、Connect 重启和网络故障演练。
- cleanup retention 必须大于已验证的 replay/incident window，并有 consumer checkpoint 或等价门禁。

## 验证入口

```bash
cd backend
go test -count=1 ./pkg/outbox ./pkg/searchindex
go test -count=1 ./structcheck/...   # 门禁：retired ServiceAccount/VPA 不得复活，matrix 无 nats
```

## experience

| 症状 | 文件 |
|---|---|
| CDC 全绿（容器 healthy / 连接器 RUNNING / 无报错）却在悄悄撑爆 WAL | [debezium-idle-slot-wal-retention.md](experience/debezium-idle-slot-wal-retention.md) |
| 两仓平行做「PG → ES」：搜索投影被误归领域事件线，自写 relay 的「零新组件」前提在 Connect 进栈后失效 | [row-projection-vs-domain-event.md](experience/row-projection-vs-domain-event.md) |

## 相关

- 生产化目标：[`docs/design/platform/production-scale-goal.md`](../../../../docs/design/platform/production-scale-goal.md)
- 一致性设计：[`docs/design/order/consistency.md`](../../../../docs/design/order/consistency.md)
- 测试策略：[`context/team/go-testing.md`](../../../team/go-testing.md)
