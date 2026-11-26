---
name: 2026-11-26-order-events-outbox
layer: decisions
status: implemented
description: order 领域事件改为事务性发件箱（与业务写同事务 + Debezium 搬运），删除进程内 GoEventBus
---

# 决策：order 领域事件走事务性发件箱，进程内总线退场

## 问题

order 服务把「订单完成」的领域事件发布到进程内 `GoEventBus`（in-memory、lock-free 环 + goroutine 池），
而业务写与事件发布是两个独立副作用。2026-11-26 的依赖审计与代码复核暴露了四个窗口：

- **W1**：`SaveOrder()` 提交后、`Publish()` 前崩溃 → 订单已落库，事件**从未存在**，没有任何重放源；
- **W2**：事件只写在内存环里，进程退出即丢；`GoEventBus` 的异步 worker 池没有 `Drain`，进程内也没有
  调用 `Close`；
- **W3**：反序（先发后写）会让下游处理一张不存在的订单；
- **W0**：handler 失败只让内部计数器自增，`Metrics()` 无人读取，投递失败完全不可见。

同一个库的 0.3.9 还把 Pulsar/PubSub/Kafka/NATS/MQTT 全列为依赖（模块图 334→476），并让
`hamba/avro` 的三条无修复 DoS（GO-2026-5046/5047/5048）经 `GoEventBus.init → avro.init`
被 `govulncheck` 判为**可达**——与 `docs/TECH-RADAR.md`「Pulsar 未采用」直接冲突。
所以「升到最新」与「安全基线」在此处互斥，而留在 0.2.5 又保留了 W0–W3 全部缺陷。

## 决策

order 的领域事件改走 `docs/TECH.md` §4.1 与 `docs/TECH-RADAR.md` §1.8 已定的**事务性发件箱**：

1. `SaveOrder()` 在**同一个 PostgreSQL 事务**里做两件事：`UPDATE orders.order_main`，再逐条
   `INSERT orders.outbox`。事件行与状态变更同生共死——提交即双可见，回滚即双消失。
2. 搬运交给 **Debezium Outbox Event Router** 从 WAL 投 Kafka；不自写 relay、不加
   `published_at/attempts/last_error` 簿记列（游标是 WAL 位点，按提交序推进）。
3. 信封按 **CloudEvents binary mode**：`ce_*` 属性与 `traceparent` 走 `headers`，`payload` 是 JSON；
   `id` 用 UUIDv7，`partitionkey` 用聚合标识保证同一订单有序；列同时保留 EventRouter 默认名
   （`aggregatetype`/`aggregateid`/`type`/`payload`）以便 SMT 用默认 `route.by.field`。
4. 删除 `internal/eventbus`、`events.OrderCompletedHandlers` 与 fx 装配；用例层**不再发布**任何事件。
   事件类型从运行时字符串「`OrderCompleted`」收进编译期：`order.Events()` 返回
   `[]events.OrderCompletedPayload`。

实现位置见 `backend/services/order/outbox.md`（含上线前必须完成的外部 checklist）。

## 考虑过的替代方案

- **升 GoEventBus 0.3.9** — 会一次带进 Pulsar/PubSub/Kafka/NATS/MQTT 六种传输与 +142 个模块，
  并让 avro 的三条无修复 DoS 变成 govulncheck 可达（exit 3）；与「Pulsar 未采用」冲突。否决。
- **留 0.2.5 并修它的实现缺陷**（panic recover、丢弃计数、Drain）— 只关掉 W0/W2 的一部分，
  根本的 W1 双写缺口原样存在，且仍要维护一个只有本仓在用的 0.x 库。否决。
- **换成自研 ~60 行 typed dispatcher** — 能修 panic/丢弃/关闭，但仍是进程内、仍是双写；把 W1
  留给未来。否决：正确性优先于「先过渡」。
- **换成 Watermill + gochannel** — 库成熟、接口可换 transport，但同样不提供跨进程持久化，
  只是把过渡态换个更漂亮的壳；新增依赖换不来 W1。否决。
- **同步调用下游服务** — 把跨服务写副作用耦合进请求路径，没有重试与重放语义，且下游不可用
  直接拖垮下单。否决。
- **同事务 outbox + 自写 relay（轮询表 + 标记已发布）** — 自写 relay 已在 `TECH-RADAR` §1.8
  退役；簿记列会引入「已发布但 relay 崩」的新窗口。否决。

## 后果

- **W1/W2/W3 在生产端关闭**：事件不再依赖进程存活，也不会先于业务事实出现；`SaveOrder` 失败即整笔
  事务回滚，调用方拿到错误，不吞。
- **W0 转为外部可观测**：写入侧失败表现为事务失败；投递侧失败表现为 connector task 状态与
  consumer lag（运维告警项），不再是被忽略的内部计数器。
- **生产流量仍不可开**：publication 尚未捕获 `orders.outbox`、connector 未挂
  OutboxEventRouter/CloudEventsConverter、没有按 `occurred_at` 的保留任务、也没有消费者/Inbox。
  这四项作为 blocker 登记在 `TODO.md`（「Outbox 结构与搬运」）。
- **行为变化**：`SaveOrder` 从「只打日志的 stub」变成真正写库（`UPDATE order_main`），
  找不到订单时返回 `ErrOrderNotFound`；这是首个让 order 的写入路径可信的改动。
- **事件契约仍是临时的**：CE type 字符串、payload 字段（`order_id`/`order_no`/`user_id`/
  `total_amount` 十进制字符串）等 proto+buf 事件目录落地时一并收口；金额在领域层是 `float64`，
  转换点写信时记录在 `outbox.md`。
- `GoEventBus` 不再是本仓依赖，`hamba/avro` 等传递依赖随之消失，`govulncheck` 保持零命中。
- 决策文档本身不复制实现细节：列定义与接线以 `docs/TECH-RADAR.md` §1.6/§1.8 与
  `backend/services/order/outbox.md` 为准。
