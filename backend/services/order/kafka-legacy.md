# Kafka 直发方案（已否决的历史记录）

> ⚠️ **不要照本文实施。** 它记录的是一版早期 Kafka 接入设计，已被
> [`docs/design/order/consistency.md`](../../../docs/design/order/consistency.md)（2026-08-08 定稿）的
> **Transactional Outbox + Relay** 取代。保留它只为回答「当初试过什么、为什么不用」，
> 不作为任何实现的参考。
>
> 2026-08-29 由 457 行教程修剪为本记录，同时从 `README-Kafka.md` 改名——
> 一个目录只留一个 `README.md`，其余文档由它链接。**原文没有任何一段可直接复用**，理由见下。

## 它提出的方案

在订单创建流程里直接调用 `producer.Publish()` 把 `OrderCreatedEvent` 发给库存服务；
客户端库用 `github.com/segmentio/kafka-go`，配置项为 `brokers` / `topic` /
`batch_size` / `batch_timeout_ms` / `async`，经 fx 装配注入应用层。

## 为什么被否决

**① 双写会丢事件。** 落库与发消息是两个独立操作，两步之间进程崩溃就会出现
「订单已存在、事件永远不来」。这正是 `consistency.md` 要根除的问题——Outbox 模型把
事件写入放进**同一个 PostgreSQL 事务**，投递交给独立 relay，崩溃后 relay 重启继续投。

**② 客户端库选型也已改变。** [`docs/TECH.md`](../../../docs/TECH.md) §4 定稿为 **franz-go**
（自写消费者 + Inbox 幂等），不是 `segmentio/kafka-go`。所以连原文「配置结构、FX 装配可参考」
这句话都不再成立——`batch_size` / `batch_timeout_ms` / `async` 是 segmentio 库的专属字段，
franz-go 没有对应概念，照抄会得到一份对不上的配置 schema。

**③ 从未落地。** `go.mod` 里没有过任何 Kafka 依赖，全文自始至终是纸面设计。

## 现在该看哪里

| 想知道 | 看哪 |
|---|---|
| 目标态的事件一致性模型 | [`docs/design/order/consistency.md`](../../../docs/design/order/consistency.md) |
| 下单链路里的事件时序 | [`docs/design/order/checkout.md`](../../../docs/design/order/checkout.md) §9 |
| 技术定稿（Kafka / franz-go / 部署形态） | [`docs/TECH.md`](../../../docs/TECH.md) §4 |
| **当前**真正在跑的机制 | [`eventbus.md`](eventbus.md)（进程内 EventBus，同样是过渡态） |
| 迁移进度 | [`docs/todo/数据一致性与事件驱动.md`](../../../docs/todo/数据一致性与事件驱动.md) |
