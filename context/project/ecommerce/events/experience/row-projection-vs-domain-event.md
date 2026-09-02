---
name: row-projection-vs-domain-event
module: events
description: 搜索投影被当成领域事件平台的首个租户，背上了 outbox/relay/NATS/CloudEvents 整套复杂度，而同期另一仓已用 Debezium + Elasticsearch Sink 零代码做完「PG → ES」；判据是「没有这个事件，业务语义是否丢失」——行派生投影归 CDC 线，领域事实归 Outbox 线；「自写 relay 零新组件」的前提是栈里没有 Kafka Connect，前提变了结论要跟着变
---

# 行投影归 CDC，领域事实归 Outbox；自写 relay 的前提是没有 Connect

**症状**

2026-09-03 复盘搜索切流时发现两仓在做同一件事：

| 仓 | 路径 | 状态 |
|---|---|---|
| ecommerce | `products.outbox` → `tools/outbox-relay` → NATS JetStream → `tools/search-indexer` → Elasticsearch | 代码约 750 行，**生产者不存在**（Product 无写 RPC），增量链空转；同日随决策删除 |
| postgres-kafka-es-streaming-pipeline | PostgreSQL → Debezium → Kafka → Elasticsearch Sink Connector | node3 运行中，六张业务表镜像进 ES，2026-08-28 验收通过，**零自写消费者** |

后者 5 月就建起来了，目的只有一句话：把 PG 同步到 ES。前者是 8 月为「事件平台」设计的四块拼图（原子性 outbox / 搬运 relay / 传输 broker / 信封 CloudEvents），搜索被选作第一个租户来验证平台——因为订单事件还没准备好。

**关键陷阱**

1. **两条正确原则叠在一起仍然错分类。** 2026-08-28 同一天定下「Outbox 表达业务发生了什么，逻辑复制表达哪些行变了」这条对的原则，架构图却把 Search projection 画在 Outbox → Kafka 下面。搜索投影是 `spus`/`skus`/`sale_detail` 三表的纯函数（reindex SQL 本身就承认这一点），它是「哪些行变了」，不是「业务发生了什么」。

2. **「零新组件」是相对于当时的栈说的。** TECH-RADAR §1.8 定稿「outbox + 自写 relay 替 Debezium，约 200 行零新组件」，其前提是 08-21 计划里的「随后退役 Strimzi/Kafka/Debezium」。08-28 Kafka 反转为主干、Kafka Connect + Debezium 成为 CDC 线的生产组件后，账反过来：自写 relay 才是多出来的组件，而且带着自述的缺陷（在 PG 事务与 `FOR UPDATE` 锁内发 broker、sequence id 不等于 commit 序、`published_at` 簿记与清理门禁未建）。定稿没有随前提失效而复审。

3. **「演示链」标签让运行中的能力被无视。** 文档把 node3 的 Debezium 链定性为「独立 CDC 演示链，不拥有策展投影」。这个定性本身没错（Sink 直写裸行确实不是策展投影），但它让人停止追问「差多少」——实际只差一个跨表 join，而 join 可以挪到 PG 侧一张 trigger 维护的投影表。

**判据**

给一条数据流分线时，问一个问题：**没有这个事件，业务语义会不会丢失？**

| 答案 | 归属 | 需要的拼图 | 搬运层 |
|---|---|---|---|
| 会（`OrderPaid`：支付成功是业务事实，行变更表达不了） | Outbox 线 | 四块全要 + 消费端 Inbox | Debezium Outbox Event Router |
| 不会（搜索投影：PG 行的派生物，可随时重建） | CDC 线 | 只要搬运与传输 | Debezium 普通表捕获 + Kafka Connect Sink |

跨表聚合不是选 Outbox 线的理由——把聚合物化成 PG 表（trigger 或同事务 upsert），CDC 线就能搬。

**对自写组件的通用教训**

「自写 X 替代 Y，因为零新组件」这类定稿要写明前提「栈里没有 Y」。前提变化（Y 因别的理由进栈）时，该结论自动进入复审，不等踩坑。

**相关**

- 重新平衡后的选型：[`docs/TECH-RADAR.md`](../../../../../docs/TECH-RADAR.md) §1.8
- 两条线的架构图：[`docs/design/platform/production-scale-goal.md`](../../../../../docs/design/platform/production-scale-goal.md) §四
- Connect 成为生产搬运层后必须盯的告警：[`debezium-idle-slot-wal-retention.md`](debezium-idle-slot-wal-retention.md)
