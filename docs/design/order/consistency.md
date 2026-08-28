# 订单分布式一致性方案（已定）

> 2026-08-08 从 `TODO.md` 移入（设计决策不该住在进度真相源里）；
> 治理四项的落地进度仍在 `TODO.md` 追踪。与 [checkout.md](checkout.md) 的关系：
> checkout 定义单次下单的编排（token、拆单、预占、补偿），本文定义跨服务事务的
> 一致性底座（Outbox、Saga 分段）。

下单跨服务事务采用 **混合模式**，不引入 Seata（Java 生态，Go 栈不适配。
⚠️ 集群 pre 环境仍部署着 seata-server 并配有路由——属设计已弃用组件的残留，
下线任务见 TODO/看板 P1）：

1. **可靠投递底座（必选）**：本地事务 + **Outbox 表 + 持久事件主干**。当前 relay 写 NATS JetStream；2026-08-27 目标改为 Kafka。写订单与写 outbox 同一事务，relay 收到 broker ack 后记录独立 delivery 状态，杜绝「落库成功但事件丢失」和迁移期双 broker 状态混淆。
2. **A 段·建单↔库存预占（强一致 + 快反馈）**：建单事务内 **同步 RPC 调库存预占**（即 TCC 的 Try），预占成功才建单成功，用户即时得到"库存不足"反馈；proto 现有 `Reserve`/`ReleaseReserve` 天然是 Try/Cancel，支付成功后的确认扣减为 Confirm。[checkout.md](checkout.md) v2 已决议把这组接口收敛为**全组原子**的 `ReserveGroup`/`ConfirmReservationGroup`/`ReleaseGroup`（一次请求一个库存事务），proto 改造在其 §14 清单内、尚未落地。
3. **B 段·建单后→支付→履约/营销（最终一致）**：走 **编舞式 Saga（Choreography）**。经 Outbox 发 `OrderCreated`；支付回调发 `OrderPaid`（库存 Confirm、订单转已支付）；取消/超时发 `OrderCancelled`（库存 `ReleaseReserve` 补偿）。

编舞 Saga 的四项治理（必须随事件驱动一起落，否则流程失控；落地进度见 `TODO.md`）：

- **幂等消费**：consumer 以 `order_no`/事件 ID 去重（消息至少投递一次语义）
- **显式补偿事件**：`StockReserveFailed → 订单自动取消` 等补偿作为一等公民设计，不散落
- **状态即真相**：`order_status` 作为"这单走到哪"的唯一可见状态，弥补编舞流程不可见
- **超时兜底 job**：扫 `pay_deadline` / 卡在中间态的订单做补偿或告警（编舞无中心，必须有 backstop）
- **全链路 trace_id**：事件贯穿 `trace_id`，靠 OTel + VictoriaTraces 追踪定位
