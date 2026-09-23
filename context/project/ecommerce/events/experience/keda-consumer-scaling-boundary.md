---
name: keda-consumer-scaling-boundary
module: events
description: KEDA 在本项目只按 Kafka 领域事实消费者的 lag 扩缩容；控制器已验收不等于业务 ScaledObject 已启用，Debezium/ Kafka Connect sink 不纳入 KEDA
---

# KEDA 消费者扩缩容边界

## 结论

KEDA 2.20.2 已部署并完成控制器级验收，但当前 ecommerce namespace 没有生产 `ScaledObject`。隔离 Cron 示例只能证明 KEDA 能根据外部信号调整 Deployment 副本数，不能证明业务扩缩容已经接线。

KEDA 的正式接入对象是独立的 Kafka **领域事实消费者**（franz-go consumer Deployment），不是 Debezium source，也不是 Kafka Connect Elasticsearch sink。

## 症状

KEDA 控制器、operator 和 metrics API 都是 Running，隔离 Cron 示例也能把 Deployment 从 0 扩到 2，但 ecommerce 没有生产 `ScaledObject`。如果只看控制器状态或 Cron 示例，很容易把「KEDA 已安装」误报成「业务已经自动扩缩」。

## 关键陷阱

- Kafka Connect 的 Debezium source 和 Elasticsearch sink 也是 Kafka 相关组件，但它们的并发、task、分区和 worker 生命周期由 Connect 管理，不能把 KEDA Kafka scaler 直接套到它们上面。
- 没有真实 topic、consumer group、分区、lag 阈值、PDB 和容量预算时，预建业务 `ScaledObject` 会把示例配置误当生产策略。
- KEDA 的 Cron 示例只验证控制面行为；正式验收必须使用真实消费者 lag，并验证扩容、缩容、重试、死信和下游承载能力。

## 为什么不能把 Connect 链路直接交给 KEDA

本项目有两条 Kafka 数据线：

- 领域事实线：Outbox → Kafka → franz-go 业务消费者。消费者副本数可以根据 consumer group lag 调整，这是 KEDA 的目标场景。
- 行投影线：PostgreSQL → Debezium → Kafka → Kafka Connect Elasticsearch Sink。source 和 sink 的并发、task 数、分区和 Connect worker 生命周期由 Kafka Connect 管理，不能把普通 Deployment 的 KEDA 示例直接套上去。

## 正式接入前置条件

第一个业务 `ScaledObject` 必须同时确认：

1. 独立 Deployment、topic、consumer group 和分区数已确定；
2. `minReplicaCount`、`maxReplicaCount`、`lagThreshold` 与 `activationLagThreshold` 有容量依据；
3. 消费失败、重试、死信队列和幂等语义已定义；
4. Pod 有经过验证的 `resources.requests`，并配有 PDB；
5. 缩容不会破坏处理中的消息，扩容不会造成下游 PG 或外部 API 过载；
6. 有压测或真实 lag 窗口，能验证扩容速度、消费恢复和缩容安全性；
7. `ScaledObject` 进入 GitOps，不能只用一次性 `kubectl apply` 留在集群里。

## 已完成验收

`kubernetes/components/keda/examples/cron-demo.yaml` 是隔离示例：Deployment 从 0 扩到 2，`ScaledObject` 为 Ready/Active，KEDA 生成 HPA；测试资源已清理。这个示例不触碰 ecommerce，也不代表已有业务消费者。

## 触发条件

当第一个需要跨服务副作用的 Kafka 消费者落地时，按本经验创建 Kafka scaler，并记录 topic 分区、消费组 lag、PDB、资源请求、最大副本和回滚结果。没有真实消费者时，只保留 KEDA 控制器和 Cron 验收，不预建业务 `ScaledObject`。

相关设计见 [`docs/TECH.md`](../../../../../docs/TECH.md) §4.4 和 §7.3。
更通用的 KEDA 控制器安装资产见 `kubernetes/components/keda/`。
