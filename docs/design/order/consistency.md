# 订单分布式一致性方案

> 2026-08-08 从 `TODO.md` 移入（设计决策不该住在进度真相源里）；
> 治理四项的落地进度仍在 `TODO.md` 追踪。与 [checkout.md](checkout.md) 的关系：
> checkout 定义单次下单的编排（token、拆单、预占、补偿），本文定义跨服务事务的
> 一致性底座（Order 内置 Saga Process Manager、Outbox/Inbox 与 Kafka 编舞）。
>
> **后续决策覆盖（2026-08-28）**：本文的「TCC Try + 纯编舞 Saga」机制结论已被 [TECH.md](../../TECH.md) §3 覆盖：Order 内置 Saga Process Manager 同步编排 Checkout → 价格快照 → 库存预占 → 支付意图，失败自动逆向补偿；阶段性终态再经 Outbox 发布 Kafka 事件，由下游编舞消费。

下单跨服务事务采用 **混合模式**，不引入 Seata（Java 生态，Go 栈不适配。
⚠️ 集群 pre 环境仍部署着 seata-server 并配有路由——属设计已弃用组件的残留，
下线任务见 TODO/看板 P1）：

1. **可靠投递底座（必选）**：本地事务 + **Outbox 表 + 持久事件主干**。存量 relay 仍写 NATS JetStream；目标 relay 写外部非 K8s Kafka，并仅在 `acks=all` 后标记 `published`。写订单与写 outbox 同一事务，relay 收到 broker ack 后记录独立 delivery 状态，杜绝「落库成功但事件丢失」和迁移期双 broker 状态混淆。
2. **A 段·建单↔库存预占（强一致 + 快反馈）**：建单事务内 **同步 RPC 调库存预占**（由 Order Saga Process Manager 同步编排），预占成功才建单成功，用户即时得到"库存不足"反馈；proto 现有 `Reserve`/`ReleaseReserve` 天然是 Try/Cancel，支付成功后的确认扣减为 Confirm。[checkout.md](checkout.md) v2 已决议把这组接口收敛为**全组原子**的 `ReserveGroup`/`ConfirmReservationGroup`/`ReleaseGroup`（一次请求一个库存事务），proto 改造在其 §14 清单内、尚未落地。
3. **B 段·阶段性终态后的副作用（最终一致）**：走去中心化编舞。Order 编排器将核心流程状态持久化，并经 Outbox 发 Kafka 领域事件；支付回调与库存结果可作为编排器输入，履约、通知、搜索投影、分析等下游独立消费。取消/超时的核心补偿仍由 Order 编排器显式驱动，不能只期待消费者自行收敛。

混合协同模型的治理（必须随事件驱动一起落，否则流程失控；落地进度见 `TODO.md`）：

- **幂等消费**：consumer 以 `(consumer_group, event_id)` 唯一键去重（消息至少投递一次语义）
- **显式补偿事件**：`StockReserveFailed → 订单自动取消` 等补偿作为一等公民设计，不散落
- **状态即真相**：Order Saga 状态与 `order_status` 共同表达流程进度，不能依赖消息到达顺序推断状态
- **超时兜底 job**：扫 `pay_deadline` / 卡在中间态的订单做补偿或告警（编排器仍必须有 backstop）
- **事件可靠性**：Topic 按限界上下文划分，`aggregate_id` 作为 partition key；连续失败超过 5 次转投 DLQ 并告警
- **统一 envelope**：Protobuf + Buf Schema Registry；包含 `event_id`、`aggregate_id`、`tenant_id`、`trace_id`、`schema_version`、`occurred_at`
