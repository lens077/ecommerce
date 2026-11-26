# Order 服务 — 事务性发件箱（Outbox）

> 2026-11-26 起 order 的领域事件走**事务性发件箱**：事件行与订单状态变更在**同一个 PostgreSQL 事务**里写，
> 由 Debezium Outbox Event Router 从 WAL 搬到 Kafka 领域事件主干。
> 进程内 `GoEventBus`（原先记在 `eventbus.md`，已随本次改造删除）不再存在，服务内没有任何事件缓冲。
> 设计依据：[`docs/TECH.md`](../../../docs/TECH.md) §4.1、[`docs/TECH-RADAR.md`](../../../docs/TECH-RADAR.md) §1.6/§1.8；
> 决策记录：[`context/decisions/implemented/2026-11-26-order-events-outbox.md`](../../../context/decisions/implemented/2026-11-26-order-events-outbox.md)。

## 四个窗口怎么被关掉的

旧实现是「`SaveOrder()` 提交 → `Publish()` 入进程内环 → handler 执行」，两次写不在同一事务，
因此有四个丢事件/失明窗口（决策文档里编号 W0–W3）：

| 窗口 | 旧实现 | 现在的机制 |
|---|---|---|
| W1 提交后、发布前崩溃 | 订单已落库、事件**从未存在**，无法重放 | 事件行与状态同事务：提交即双可见，回滚即双消失 |
| W2 事件只在内存环 | 进程退出即丢；异步 worker 池也没有 Drain | 没有内存环：事件写在 WAL 里，进程死活不影响它 |
| W3 反序发布 | 先发后写会让下游处理不存在的订单 | 行只可能随**成功提交**出现，不存在先于业务事实的事件 |
| W0 handler 失败不可见 | 只让计数器自增，连 `Metrics()` 都没人读 | 没有进程内 handler；写入失败直接回滚并返回给调用方，投递失败表现为 connector task 状态 / consumer lag |

## 实际接线（2026-11-26 核对代码）

以代码为准，本文不复制实现：

| 文件 | 职责 |
|---|---|
| [`internal/biz/application/order.go`](internal/biz/application/order.go) | 加载聚合 → 调领域方法 → `SaveOrder()`；用例层**不再发布**事件 |
| [`internal/data/order.go`](internal/data/order.go) | `SaveOrder()`：`ExecTx` 内 `UPDATE order_main` + 逐条 `outbox.Append`；另含 CE 信封构造 |
| [`internal/outbox/outbox.go`](internal/outbox/outbox.go) | 发件箱写入侧：列定义、`traceparent`、`Execer` 收窄接口；不发布、不重试、不簿记 |
| [`internal/data/migrations/00002_outbox.sql`](internal/data/migrations/00002_outbox.sql) | `orders.outbox` 表（CE 属性 + EventRouter 默认列） |

发布点从「`Publish("OrderCompleted", evt)` 字符串硬编码」变成编译期类型：`order.Events()` 返回
`[]events.OrderCompletedPayload`，`Publish` 的参数拼错不再可能。

## 信封与列

`orders.outbox` 一行的列（`TECH-RADAR` §1.6 的 CE 属性 + §1.8 的 EventRouter 默认列名）：

| 列 | 含义 |
|---|---|
| `id` | CE id：UUIDv7，幂等键的一半 `(source, id)` |
| `source` | CE source：`/services/order` |
| `type` | CE type：reverse-DNS 过去式，当前 `io.lens077.ecommerce.order.completed.v1` |
| `subject` | CE subject：`order/<order_no>` |
| `aggregatetype` / `aggregateid` | EventRouter 路由与聚合标识（`order` / 订单号） |
| `partitionkey` | Kafka partition key：同一订单的事件保序 |
| `payload` | CE data（JSON）：`order_id`、`order_no`、`user_id`、`total_amount`（decimal 字符串，不用 float） |
| `headers` | CE 属性（`ce_*`、`content-type`）与 `traceparent`（binary mode 下 CE 属性走 Kafka header） |
| `occurred_at` | CE time；同时是保留策略的扫描键 |

没有 `published_at` / `attempts` / `last_error` 列：游标就是 WAL 位点（§1.8），
按提交序推进，不需要自写 relay 那套簿记。

## 上线前必须做的两件外部事

这两件不在本仓代码里，**没做之前生产不要打开流量**（rows 会只进不出）：

1. **connector 接线**：`backend/infrastructure/kafka-connect/setup.sql` 的 publication 目前只捕获
   `orders.order_main,order_item,order_log,products.*`，不含 `orders.outbox`；
   `kafkaconnector.yaml` 的 `table.include.list` 同样没有它，且尚未挂
   `OutboxEventRouter` + `CloudEventsConverter`。两处一起改、一起 apply，才能把 WAL 里的事件搬去 Kafka。
2. **保留策略**：Debezium 消费 WAL 不会删表行。需要按 `occurred_at` 定期 `DELETE`（例如 7 天），
   频率与批量按流量定；没配 purge 之前 dev 环境也会持续增长。已登记在 `TODO.md`。

## 已知缺口

- `SaveOrder` 的 `UPDATE` 是**手写 SQL**：sqlc 生成需要在线 schema（`sqlc.yaml` 的 uri 指向运行库），
  事件目录落地时并进 `queries/query.sql` 重新生成，别留两份真源。
- 事件契约仍是临时字符串（CE type、payload 字段），proto + buf 的事件目录尚未落地（`TODO.md` §89）。
- `OrderRoot.TotalAmount` 在领域层是 `float64`（`money.NumericToFloat` 转换所致），
  事件里用 `decimal.NewFromFloat` 还原成字符串——数值精度在加载时已经丢过一次，改金额模型时一起收。
- 目前**没有消费者**：事件写进表即结束，跨服务的通知/积分/履约要等 Inbox 侧落地。

## 故障排除

| 症状 | 排查方向 |
|---|---|
| Kafka 上没有事件 | connector 是否包含 `orders.outbox`、SMT 是否配了 EventRouter/CloudEventsConverter、`occurred_at` 是否在 connector 快照之后 |
| 表持续增长 | 保留任务是否在跑；`idx_orders_outbox_occurred_at` 是否命中 |
| 订单状态没变但事件在 | 不可能：两者同事务。若出现，先查是不是有人绕过 `SaveOrder` 直写 outbox |
| 事件重复 | 至少一次语义：消费端用 Inbox 唯一键 `(consumer_group, event_id)` 去重 |
| 写入失败 | `SaveOrder` 返回错误即整笔事务回滚——这是特性，不要吞错 |

## 相关文档

- [`kafka-legacy.md`](kafka-legacy.md) — Kafka 方案存档，仅配置结构与 fx 装配可参考
- [`docs/design/order/consistency.md`](../../../docs/design/order/consistency.md) — Outbox + Debezium 的权威设计
- [`docs/design/order/checkout.md`](../../../docs/design/order/checkout.md) §9 — 下单链路里的事件时序
- [`context/project/ecommerce/events/experience/row-projection-vs-domain-event.md`](../../../context/project/ecommerce/events/experience/row-projection-vs-domain-event.md) — 「领域事实 vs 行投影」分线判据
