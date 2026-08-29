# order 服务

```shell
make dev CONSUL_ADDR=localhost:8500
```

## 文档导航

本目录只保留一个 `README.md`，其余文档从这里进入。

| 文档 | 内容 | 状态 |
|---|---|---|
| [`docs/design/order/checkout.md`](../../../docs/design/order/checkout.md) | 下单主链设计（v2 基线） | **权威** |
| [`docs/design/order/consistency.md`](../../../docs/design/order/consistency.md) | 跨服务一致性底座（Outbox + Relay） | **权威·目标态** |
| [`eventbus.md`](eventbus.md) | 进程内 EventBus 的实际接线与已知缺口 | 当前在用，**过渡态** |
| [`kafka-legacy.md`](kafka-legacy.md) | 一版早期 Kafka 直发设计 | **已否决**，仅历史记录 |

## 事件机制现状（读代码前先看这个）

当前跑的是**进程内 EventBus**，而它和已被否决的 Kafka 直发方案有**同一个缺陷**：

```
uc.repo.SaveOrder()      持久化  ─┐
uc.eventBus.Publish()    发布事件 ─┘ 两步不在同一事务，中间崩溃即丢事件
```

目标态是 `consistency.md` 的 **Outbox + Relay**：事件写入与业务写入进同一个
PostgreSQL 事务，投递交给独立 relay。**新代码不要按 `eventbus.md` 的模式接线**；
迁移进度见 [`docs/todo/数据一致性与事件驱动.md`](../../../docs/todo/数据一致性与事件驱动.md)。
