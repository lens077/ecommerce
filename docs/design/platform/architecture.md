# 微服务架构核心设计 — 服务边界与领域事件

> 从根 `DESIGN.md` 拆出（2026-08-08）。本文包含目标态，阅读时遵守三条边界：
> - 实际存在的 10 个服务及其注册名/依赖关系，一律以 [`.service-matrix.yaml`](../../../.service-matrix.yaml) 为准。履约并入 order；结算、营销、数据分析不再预设独立服务。
> - 领域事件表是目标态。当前已运行 NATS JetStream、outbox relay 与 search indexer，但业务事务生产者尚未完整接线；2026-08-27 已决策迁往 Kafka 主干，路线见 [生产目标与 Kafka 路线](production-scale-goal.md)。
> - 登录、会话与 RBAC 已迁入同级仓 control-tower gateway。user 服务仍存在，但不再是浏览器 token 代理或 session owner。

### 前后端通信协议规范

采用 Connect 协议作为唯一通信标准，核心设计如下：

- 统一使用 Protobuf 定义服务接口与数据结构，通过 Buf 统一管理 Proto 文件、生成前后端代码，确保前后端类型完全一致，避免联调误差。
- 前端使用 `@connectrpc/connect-web` 与 Protobuf-ES 生成物，通过共享 transport/interceptor 统一错误、BFF session header 与观测上下文；重试必须按 RPC 幂等语义显式决定。
- control-tower gateway 负责 BFF session/legacy JWT、Casbin RBAC、路由、超时和可信身份头。后端 ConnectRPC 拦截器负责日志、链路与 Protovalidate，不重复鉴权，也没有通用限流熔断。


基于 DDD 领域驱动设计原则，结合 B2B2C 业务模型，完成微服务边界划分、通信规范定义。

### 2.1 核心微服务

| 微服务名称                   | 	核心职责                     | 	技术栈                        | 	核心功能详情                                                                          |
|-------------------------|---------------------------|-----------------------------|----------------------------------------------------------------------------------|
| 用户服务（User Service）    | 	用户资料与存量身份兼容 API      | 	Go + PostgreSQL + Casdoor SDK       | 	BFF 登录、session、令牌刷新与 Casbin RBAC 已由 control-tower gateway 承担；user 服务不再作为浏览器 token 代理                          |
| 商品服务（Product Service）   | 	SPU/SKU 管理、类目管理、商品生命周期管控 | 	Go + PostgreSQL + Redis    | 	商品 SPU/SKU 的增删改查、上下架管理；商品属性、类目、品牌管理；商品详情缓存管理；对接搜索服务同步数据                         |
| 订单服务（Order Service）     | 	订单生命周期管理、分布式事务协调、订单数据查询、**履约（并入本域）**  | 	Go + PostgreSQL + Kafka（目标态；NATS 迁移中） | 	订单创建 / 取消 / 修改；订单状态机流转（待支付→已支付→已发货→已完成 / 已取消 / 售后）；对接库存、支付服务完成跨服务事务；订单明细、物流信息管理；履约触发唯一门禁 = `OrderReadyForFulfillment`（checkout v2） |
| 支付服务（Payment Service）   | 	支付渠道聚合、支付流程管控、财务对账       | 	Go + PostgreSQL + Redis    | 	支付宝、微信支付 SDK 适配与聚合；支付单创建、支付状态同步、退款申请与处理；平台与商家对账管理；支付流水记录留存                      |
| 库存服务（Inventory Service） | 	库存全生命周期管理、库存操作原子化、库存预警   | 	Go + PostgreSQL + Kafka（目标态；NATS 迁移中）            | 	分布式库存状态机管控；库存预占、扣减、释放、调整；库存流水记录；库存不足预警事件推送（正确性锚定 PG 行锁/CAS，缓存仅可丢数据）                       |
| 搜索服务（Search Service）    | 	商品全文检索、多维度筛选、排序推荐        | 	Go + Meilisearch + Redis   | 	基于 CQRS 架构实现读写分离；商品事件异步同步至 Meilisearch；当前已实现全文检索，筛选、排序和推荐仍按 `TODO.md` 推进              |

### 支撑微服务

1. 商家服务（Merchant Service）
    - 职责：商家入驻管理、店铺运营、履约处理、财务结算
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

### 微服务通信边界与领域事件设计

采用「RPC 同步调用 + 持久事件主干（经 PostgreSQL outbox）」的混合模式，明确服务边界，避免强耦合。当前实现是 NATS JetStream，目标态是 Apache Kafka；迁移期间不得把两者同时当成唯一主干。

核心通信规则:

- 同步 RPC 调用：仅用于需要立即响应、强一致性的场景，例如下单时查询商品信息、支付前查询订单状态、库存预占校验。
- 异步事件通信：目标形态使用 PostgreSQL outbox、relay 和 Kafka 发布领域事件，消费者以 Inbox/幂等处理实现最终一致性。当前只有 NATS 商品索引 worker 与基础设施完成部署，Kafka 尚未接线，不能把下表其他事件视为已实现。
- 防腐层设计：每个微服务仅暴露对外 API 接口，内部领域模型不对外暴露，通过 DTO 完成数据转换，避免服务间模型耦合。

核心领域事件定义

> 2026-08-26 按 [order/checkout.md](../order/checkout.md) v2 决议修订（该文自注的
> 「需修订本表」至此闭环）：**`OrderPaid` 不再触发履约**，履约唯一门禁是库存确认成功后
> 发出的 `OrderReadyForFulfillment`；营销/履约作为独立服务已裁决不立项，订阅方相应收敛。

| 事件名称                  | 事件核心内容                       | 发布服务 | 订阅服务           | 核心用途                   |
|-----------------------|------------------------------|------|----------------|------------------------|
| OrderCreatedEvent     | 订单 ID、用户 ID、SKU 列表、下单数量、订单金额 | 订单服务 | 库存服务、支付服务 | 触发库存预占、支付单创建    |
| OrderPaidEvent        | 订单 ID、支付单号、支付金额、支付时间         | 支付服务 | 订单服务、库存服务 | 更新订单状态、触发库存确认扣减（**不触发履约**） |
| OrderReadyForFulfillment | 订单 ID、订单组号、库存确认凭据 | 订单服务（库存确认成功后） | order 域履约模块 | **履约的唯一触发门禁**（checkout v2 §履约门禁） |
| OrderCancelledEvent   | 订单 ID、取消原因、取消时间              | 订单服务 | 库存服务、支付服务 | 触发库存释放、支付退款       |
| InventoryChangedEvent | SKU_ID、仓库 ID、变更后可用库存、变更类型    | 库存服务 | 商品服务、订单服务 更新商品 | 可售状态、订单库存校验拦截          |
| ProductChangedEvent   | SPU/SKU_ID、完整搜索投影、变更时间         | 商品服务 | search indexer           | 通过 outbox 同步商品投影；当前 NATS indexer 已部署、生产者未接，目标先迁 Kafka shadow index 再切流 |
| PaymentRefundedEvent  | 订单 ID、退款单号、退款金额、退款状态         | 支付服务 | 订单服务（含履约/售后模块）      | 更新订单退款状态、售后流程推进        |
