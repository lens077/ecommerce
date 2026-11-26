# order 服务

```shell
make dev CONSUL_ADDR=localhost:8500
```

## 文档导航

本目录只保留一个 `README.md`，其余文档从这里进入。

| 文档 | 内容 | 状态 |
|---|---|---|
| [`docs/design/order/checkout.md`](../../../docs/design/order/checkout.md) | 下单主链设计（v2 基线） | **权威** |
| [`docs/design/order/consistency.md`](../../../docs/design/order/consistency.md) | 跨服务一致性底座（Outbox + Debezium Event Router） | **权威·目标态** |
| [`outbox.md`](outbox.md) | 事务性发件箱：事件与状态同事务写 `orders.outbox`，Debezium 搬去 Kafka | 当前在用（生产接线见文内 checklist） |
| [`kafka-legacy.md`](kafka-legacy.md) | 一版早期 Kafka 直发设计 | **已否决**，仅历史记录 |

## 事件机制现状（读代码前先看这个）

当前跑的是 `consistency.md` 里的 **Outbox + Debezium Outbox Event Router**：

```
uc.repo.SaveOrder()  ── 同一事务 ──┬── UPDATE orders.order_main
                                   └── INSERT orders.outbox（领域事件）
```

事件与业务状态同生共死（提交即双可见、回滚即双消失），不再有进程内缓冲、不再由用例发布。
`GoEventBus` 已随 2026-11-26 的改造整体删除。**生产接线（publication + connector SMT + 保留任务）
仍未做**，见 [`outbox.md`](outbox.md) 的「上线前必须做的两件外部事」。
