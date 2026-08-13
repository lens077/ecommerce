# order 服务

```shell
make dev CONSUL_ADDR=localhost:8500
```

文档导航：

- 下单主链设计（v2 基线）：`docs/design/order/checkout.md`；跨服务一致性底座：`docs/design/order/consistency.md`
- [README-EventBus.md](README-EventBus.md) — 进程内 EventBus 使用说明（现行事件机制）
- [README-Kafka.md](README-Kafka.md) — ⚠️ 已被 consistency.md 的 Outbox 方案取代，仅存档
