# 微服务架构核心设计 — 服务边界与领域事件

> 从根 `DESIGN.md` 拆出（2026-08-08）。本文包含目标态，阅读时遵守三条边界：
> - 实际存在的 10 个服务及其注册名/依赖关系，一律以 [`.service-matrix.yaml`](../../../.service-matrix.yaml) 为准；它们是迁移起点。目标边界以 [TECH.md](../../TECH.md) §5 为准：user + merchant → Identity、product → Catalog，并独立建设 Fulfillment 与 Notification；search-projection、analytics 为编舞消费者。
> - 领域事件表是目标态。当前已运行 NATS JetStream、outbox relay 与 search indexer，但业务事务生产者尚未完整接线；2026-08-27 已决策迁往 Kafka 主干，路线见 [生产目标与 Kafka 路线](production-scale-goal.md)。
> - 登录、会话与授权入口已迁入同级仓 control-tower gateway。存量 Casbin/legacy JWT 仍可能运行，但目标完全废弃 JWT：Casdoor 有状态 Session 承担认证与粗粒度角色，OpenFGA 承担对象级关系授权；user 服务仍存在，但不再是浏览器 token 代理或 session owner。

### 前后端通信协议规范

采用 Connect 协议作为唯一通信标准，核心设计如下：

- 统一使用 Protobuf 定义服务接口与数据结构，通过 Buf 统一管理 Proto 文件、生成前后端代码，确保前后端类型完全一致，避免联调误差。
- 前端使用 `@connectrpc/connect-web` 与 Protobuf-ES 生成物，通过共享 transport/interceptor 统一错误、BFF session header 与观测上下文；重试必须按 RPC 幂等语义显式决定。
- 生产入口固定为 CDN/WAF → Pangolin → Cilium Gateway API（TLS 终止、KPR 严格模式）→ control-tower gateway。网关负责 Casdoor 有状态 Session、OpenFGA 对象授权、租户路由、超时和可信身份头；目标完全废弃 JWT。网关到后端及服务间强制使用 ConnectRPC over HTTP/2（H2C），严禁降级 HTTP/1.1。后端拦截器负责日志、链路与 Protovalidate，不重复入口鉴权。


基于 DDD 领域驱动设计原则，结合 B2B2C 业务模型，完成微服务边界划分、通信规范定义。

### 2.1 核心微服务

| 微服务名称                   | 	核心职责                     | 	技术栈                        | 	核心功能详情                                                                          |
|-------------------------|---------------------------|-----------------------------|----------------------------------------------------------------------------------|
| 身份与组织域（Identity，目标；user + merchant 迁移合并） | UserProfile、Merchant、Store、MerchantMember | Go + PostgreSQL；Casdoor + OpenFGA | Casdoor 管认证、Session 与 admin/merchant/customer 粗粒度角色；Identity 管业务身份和组织关系；OpenFGA 管 merchant/store/order 对象关系授权                          |
| 商品目录域（Catalog，目标；product 迁移）   | 	Product（SPU）、SKU、Listing、Category | 	Go + PostgreSQL + Dragonfly（可丢缓存） | 	商品本体与店铺售卖信息分离；发布 Catalog 领域事件驱动 Elasticsearch 搜索投影，库存不属于 Catalog                         |
| 订单服务（Order Service）     | 	OrderGroup/MerchantOrder/OrderLine、订单状态机、内置 Saga Process Manager  | 	Go + PostgreSQL + Kafka（目标态；NATS 迁移中） | 	订单创建 / 取消 / 修改；同步编排 Catalog 价格快照、Inventory 预占与 PaymentIntent 创建，失败自动逆向补偿；阶段性终态经 Outbox 发布 Kafka 事件；`OrderReadyForFulfillment` 触发独立 Fulfillment 域 |
| 支付服务（Payment Service）   | 	PaymentIntent/Attempt/Authorization/Capture/Refund 与 PaymentPort 渠道抽象       | 	Go + PostgreSQL + Redis    | 	支付宝、微信支付 SDK 适配与聚合；支付单创建、支付状态同步、退款申请与处理；平台与商家对账管理；支付流水记录留存                      |
| 库存服务（Inventory Service） | 	库存全生命周期管理、库存操作原子化、库存预警   | 	Go + PostgreSQL + Kafka（目标态；NATS 迁移中）            | 	分布式库存状态机管控；库存预占、扣减、释放、调整；库存流水记录；库存不足预警事件推送（正确性锚定 PG 行锁/CAS，缓存仅可丢数据）                       |
| 搜索投影（search-projection） | 商品全文检索、多维度筛选、排序推荐 | 目标 Elasticsearch；存量 Meilisearch 迁移中 | CQRS 只读投影隐藏于 `SearchCatalog` 接口后，由 Catalog 领域事件更新，支持从 PostgreSQL 全量重建              |

### 支撑微服务

1. 商家服务（Merchant Service）
    - 职责：存量商家入驻与店铺运营；目标迁入 Identity 域，履约由独立 Fulfillment 域承担
    - 技术栈：Go + PostgreSQL + Redis
    - 核心功能：商家入驻审核、店铺信息管理；商品运营权限管控；订单发货、售后审核；店铺运费模板、促销活动配置；商家结算账单管理

> **2026-08-26 裁决（消除拓扑口径分叉）**：原第 2–5 项「履约 / 结算 / 营销 / 数据分析」
> 四个支撑服务**不再作为独立服务规划**——履约并入 order 域（唯一触发事件
> `OrderReadyForFulfillment`，见 [order/checkout.md](../order/checkout.md) 与
> [merchant/roadmap.md](../merchant/roadmap.md)，二者口径一致）；结算 / 营销 / 数据分析
> 待真实需求成立后按「新增服务须 ADR 论证独立伸缩或故障域」的门槛重新立项。
> 其详细职责清单已删（历史见 git）。**服务拓扑唯一事实表是
> [`.service-matrix.yaml`](../../../.service-matrix.yaml)**：实存 10 服务
> （含本表未列出的 cart / address / behavior / user），规划中的服务一律不入拓扑表。
>
> **后续决策覆盖（2026-08-28）**：本节「履约并入 order、无独立通知中心」的结论已被 [TECH.md](../../TECH.md) 覆盖：目标态独立建设 Fulfillment 与 Notification 限界上下文；Order 仅编排交易并通过事件触发履约，analytics 保持编舞消费者。

### 微服务通信边界与领域事件设计

采用「Order 内置 Saga Process Manager 同步编排 + 持久事件主干去中心化编舞（经 PostgreSQL Outbox）」的混合模式，明确服务边界，避免强耦合。当前实现是 NATS JetStream，目标态是 Apache Kafka；迁移期间不得把两者同时当成唯一主干。

核心通信规则:

- 同步 RPC 调用：仅用于需要立即响应、强一致性的场景，例如下单时查询商品信息、支付前查询订单状态、库存预占校验。
- 异步事件通信：目标形态使用 PostgreSQL Outbox + Relay 发布 Kafka 领域事件：仅在 `acks=all` 后标记 `published`；消费者以 `(consumer_group, event_id)` 唯一键的 Inbox 幂等处理，连续失败超过 5 次转投 DLQ 并告警。Topic 按限界上下文划分，`aggregate_id` 为 partition key；Protobuf 事件 envelope 含 `event_id`、`aggregate_id`、`tenant_id`、`trace_id`、`schema_version`、`occurred_at`，由 Buf Schema Registry 管理。当前只有 NATS 商品索引 worker 与基础设施完成部署，Kafka 尚未接线，不能把下表其他事件视为已实现。
- 防腐层设计：每个微服务仅暴露对外 API 接口，内部领域模型不对外暴露，通过 DTO 完成数据转换，避免服务间模型耦合。

核心领域事件定义

> 2026-08-26 按 [order/checkout.md](../order/checkout.md) v2 决议修订（该文自注的
> 「需修订本表」至此闭环）：**`OrderPaid` 不再触发履约**，履约唯一门禁是库存确认成功后
> 发出的 `OrderReadyForFulfillment`；旧裁决曾不设独立营销/履约服务，订阅方据此收敛。
> **后续决策覆盖（2026-08-28）**：该履约结论已被 [TECH.md](../../TECH.md) 覆盖：`OrderReadyForFulfillment` 由独立 Fulfillment Service 消费；Notification Service 作为纯事件驱动的独立通知域。

| 事件名称                  | 事件核心内容                       | 发布服务 | 订阅服务           | 核心用途                   |
|-----------------------|------------------------------|------|----------------|------------------------|
| OrderCreatedEvent     | 订单 ID、用户 ID、SKU 列表、下单数量、订单金额 | 订单服务 | 库存服务、支付服务 | 触发库存预占、支付单创建    |
| OrderPaidEvent        | 订单 ID、支付单号、支付金额、支付时间         | 支付服务 | 订单服务、库存服务 | 更新订单状态、触发库存确认扣减（**不触发履约**） |
| OrderReadyForFulfillment | 订单 ID、订单组号、库存确认凭据 | 订单服务（库存确认成功后） | Fulfillment Service | **履约的唯一触发门禁**（checkout v2 §履约门禁） |
| OrderCancelledEvent   | 订单 ID、取消原因、取消时间              | 订单服务 | 库存服务、支付服务 | 触发库存释放、支付退款       |
| InventoryChangedEvent | SKU_ID、仓库 ID、变更后可用库存、变更类型    | 库存服务 | 商品服务、订单服务 更新商品 | 可售状态、订单库存校验拦截          |
| ProductChangedEvent   | SPU/SKU_ID、完整搜索投影、变更时间         | 商品服务 | search indexer           | 通过 outbox 同步商品投影；当前 NATS indexer 已部署、生产者未接，目标先迁 Kafka shadow index 再切流 |
| PaymentRefundedEvent  | 订单 ID、退款单号、退款金额、退款状态         | 支付服务 | Order Service、Fulfillment Service      | 更新订单退款状态、履约/售后流程推进        |
