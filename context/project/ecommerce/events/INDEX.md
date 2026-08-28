# events

**代码路径**：`backend/pkg/outbox/`、`backend/tools/outbox-relay/`、`backend/pkg/searchindex/`

PostgreSQL 事务发件箱、NATS JetStream relay 与搜索 projection 链。

## 当前事实

- 当前已部署链路是 PostgreSQL outbox → NATS JetStream → search indexer → Meilisearch。
- `outbox.Relay` 直接依赖 JetStream，不存在 broker-neutral `EventSink`、Kafka Adapter 或 Kafka CLI 模式。
- node3 Kafka 是独立实验资源，应用 `used_by=[]`；不属于当前事件链或已采用技术栈。
- outbox payload 当前为 JSON；NATS subject 由 `events.` + 去掉 `ecommerce.` 前缀的 event type 生成。
- relay 按 outbox 表抢 PostgreSQL session advisory lock，单表只运行一个 active 实例；`pg_notify` 只负责唤醒，轮询才是投递保证。
- relay 收到 JetStream PubAck 后才写 `published_at`。PubAck 后、数据库 commit 前崩溃会重投；`Nats-Msg-Id` 只在 broker duplicate window 内去重，consumer 仍必须幂等。
- 当前 relay 在 PostgreSQL transaction 和 `FOR UPDATE` row lock 内执行 broker publish。长 broker 延迟会延长 transaction/锁持有时间；这是待消除的可靠性与容量风险，不能写成已解决。
- PostgreSQL sequence ID 不代表并发 producer 的 commit 顺序。relay 不漏扫晚提交的低 ID，但不承诺全局 commit ordering；领域顺序必须由 aggregate version 和 consumer fence 约束。
- 当前 cleanup 只按 `published_at + retention` 删除 outbox，没有 consumer checkpoint/重放门禁；在 Inbox、DLQ、重放窗口和恢复证据完成前，不能把 cleanup 当成生产安全策略。

## 不可破坏的不变量

1. 业务写与 outbox insert 必须在同一 PostgreSQL transaction。
2. relay 只有收到 JetStream PubAck 才记录发布完成；ack 后、落库前崩溃允许重复投递。
3. consumer 必须按稳定 `event_id` 幂等；缓存和 JetStream duplicate window 不能替代持久 Inbox。
4. partition key/aggregate id 必须稳定；需要业务顺序的 consumer 还要校验单调 aggregate version。
5. NACK、max deliver、DLQ 和重放都不能跳过业务补偿与审计。
6. Outbox 表达领域事实，分析 CDC 表达行变更；两者不得共用一套语义。
7. broker、搜索和缓存都是可恢复依赖，不是交易真相源。

## P0 验收

- Product/Order 的业务写与 outbox 使用同 transaction，并有 rollback/duplicate 测试。
- consumer Inbox 与业务数据库副作用原子提交；外部副作用必须具备幂等键或补偿。
- stream 声明 owner、subject、replicas、retention、max bytes、积压 SLO 和恢复步骤。
- 交易 stream 验证 R3；可重建 stream 是否保留 R1 由 RTO 和重建成本决定。
- poison message 验证 NACK/backoff、max deliver、DLQ、告警、授权重放和审计。
- 用真实 payload 执行 nats bench、积压恢复、broker kill 和网络故障演练。
- cleanup retention 必须大于已验证的 replay/incident window，并有 consumer checkpoint 或等价门禁。

## 验证入口

```bash
cd backend
go test -count=1 ./pkg/outbox ./pkg/searchindex ./tools/outbox-relay ./tools/search-indexer
go build ./tools/outbox-relay ./tools/search-indexer
```

## 相关

- 生产化目标：[`docs/design/platform/production-scale-goal.md`](../../../../docs/design/platform/production-scale-goal.md)
- 一致性设计：[`docs/design/order/consistency.md`](../../../../docs/design/order/consistency.md)
- 测试策略：[`context/team/go-testing.md`](../../../team/go-testing.md)
