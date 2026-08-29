# Order 服务 — 进程内领域事件（EventBus）

> ⚠️ **这是过渡态，不是目标态**（2026-08-29 加横幅）：
> 本文描述的进程内 EventBus **是 order 服务当前真正在用的机制**（`go.mod` 无 Kafka 依赖，
> 服务内无 Outbox 代码），但它带着和 [`README-Kafka.md`](README-Kafka.md) **同一个缺陷**——
> 先 `SaveOrder()` 再 `Publish()` 的**双写**：两步之间进程崩溃，事件就永久丢失，
> 而订单已经落库。
>
> [`docs/TECH.md`](../../../docs/TECH.md) §4.1 定稿的是 **Transactional Outbox + Relay**：
> 业务写和事件写进同一个 PostgreSQL 事务，由独立 relay 投递。
> 设计细节见 [`docs/design/order/consistency.md`](../../../docs/design/order/consistency.md)。
> **新代码不要照本文的模式接线**；改造进度见
> [`docs/todo/数据一致性与事件驱动.md`](../../../docs/todo/数据一致性与事件驱动.md)。

## 实际接线（2026-08-29 核对代码）

整套机制只有四个文件、共约 380 行，**以代码为准，本文不复制代码**：

| 文件 | 行数 | 职责 |
|---|---:|---|
| [`internal/eventbus/eventbus.go`](internal/eventbus/eventbus.go) | 53 | GoEventBus 的薄封装，提供 `Publish` / `Subscribe` |
| [`internal/biz/domain/events/handles.go`](internal/biz/domain/events/handles.go) | 25 | 事件 payload 定义与处理器注册 |
| [`internal/biz/application/order.go`](internal/biz/application/order.go) | 124 | 应用层：加载聚合 → 领域方法 → 持久化 → **发布事件** |
| [`cmd/server/main.go`](cmd/server/main.go) | 176 | fx 装配，把 EventBus 注入应用层 |

⚠️ **文档曾经的描述与代码不符，已订正**：旧版本列举了 `OrderPaidPayload`、
`OrderShippedPayload` 等多种事件，**代码里都不存在**。实际只有一个事件类型
和一个发布点：

- 事件：`OrderCompletedPayload`
- 发布点：`internal/biz/application/order.go:116`
  `uc.eventBus.Publish("OrderCompleted", evt)`

## 在 DDD 分层里的位置

```
Application Layer  OrderCommandUseCase.CompleteOrder()
                     1. uc.repo.GetOrderByNo()    加载聚合根
                     2. order.Complete()          调用领域方法（产生事件）
                     3. uc.repo.SaveOrder()       持久化  ─┐
                     4. uc.eventBus.Publish()     发布事件 ─┘ ⚠️ 双写缺口在这里
                            │
Domain Layer         OrderRoot（聚合根）→ OrderCompletedPayload（领域事件）
                            │
Handler              events/handles.go 注册的处理器（进程内同步/异步消费）
```

**第 3 步和第 4 步不在同一个事务里**——这正是目标态要用 Outbox 消除的。
Outbox 模型下，第 4 步变成「往同一事务的 outbox 表插一行」，投递交给独立 relay。

## 为什么当初选进程内 EventBus

单进程、零外部依赖、无运行时开销，适合把「订单完成 → 通知/积分/库存」这类副作用
从聚合根里解耦出去，避免模块循环依赖。**在跨服务、要求不丢事件的场景下它不够用**
——这是它被 §4.1 取代的原因，不是它当初的选择错了。

选型对照见 [`docs/TECH.md`](../../../docs/TECH.md) §4，不在本文重复。

## 故障排除

| 症状 | 排查方向 |
|---|---|
| 事件未被处理 | 处理器是否在 `handles.go` 注册；事件名字符串是否与 `Publish` 的第一参数一致（当前是 `"OrderCompleted"`，硬编码字符串，拼错不会编译报错） |
| 事件重复消费 | 进程内总线不保证幂等，处理器需自己去重；跨副本时**每个副本都会各自消费一次**（当前 order 单副本，扩副本前必须先解决） |
| 事件丢失 | 检查是否发生在 `SaveOrder()` 与 `Publish()` 之间的崩溃——这是已知缺陷，不是 bug，需靠 Outbox 改造根治 |
| 内存增长 | GoEventBus 用 channel 内存队列，异步模式下消费慢于生产会堆积；确认分发策略（DropOldest/DropNewest）与队列容量 |

## 相关文档

- [`README-Kafka.md`](README-Kafka.md) — Kafka 方案存档，**同样已被 Outbox 取代**，仅配置结构与 fx 装配可参考
- [`docs/design/order/consistency.md`](../../../docs/design/order/consistency.md) — Outbox + Relay 的权威设计
- [`docs/design/order/checkout.md`](../../../docs/design/order/checkout.md) §9 — 下单链路里的事件时序
- [`docs/TECH.md`](../../../docs/TECH.md) §4.1 — 技术定稿
