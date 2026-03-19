# 小镇做题家的电商项目

# 架构设计

B2B2C 平台型电商系统完整架构设计方案
旨在打造高可用、易扩展、符合工程规范的中大型电商分布式架构:

## 技术栈集成架构设计

### 核心技术栈兼容性与落地设计

技术栈:

- Connect-go 通信体系：作为核心 RPC 框架，兼容 gRPC、gRPC-Web 与 Connect 原生协议，通过 Buf 实现 Protobuf 代码的标准化生成，与前端
  Connect-web 无缝对接，无需额外协议转换层，同时支持流式传输，适配订单状态同步、库存实时更新等电商核心场景。
- Casdoor 身份体系集成：基于 OAuth 2.0/OIDC 标准协议，通过 Go SDK 完成全链路认证流程封装，在 Connect-go 中通过拦截器实现
  JWT 令牌统一校验、用户身份解析，全平台用户、角色、权限统一由 Casdoor 管理，无需额外维护用户体系。
- Fx 依赖注入框架：通过fx.Provide注册各微服务的构造函数、依赖组件（数据库连接、Redis 客户端、支付 SDK
  等），通过fx.Invoke完成服务初始化、拦截器注册、生命周期管理，每个微服务封装独立 Fx 模块，实现模块化组装与解耦。
- sqlc 数据库层封装：针对 PostgreSQL 做专属配置，通过sqlc.yaml定义 Schema 与查询规则，生成类型安全的 Go 数据库操作代码，在
  Repository 层实现读写自动路由，完美适配 PostgreSQL 一主多从架构。
- 全链路技术协同：前端 React+TypeScript 通过 Connect-web 实现类型安全的 API 调用，后端微服务通过 Kafka
  实现领域事件通信，Kubernetes+Cilium 实现网络层管控，VictoriaMetrics+Grafana 实现可观测性，形成完整的技术闭环。

### 前后端通信协议规范

采用 Connect 协议作为唯一通信标准，核心设计如下：

- 统一使用 Protobuf 定义服务接口与数据结构，通过 Buf 统一管理 Proto 文件、生成前后端代码，确保前后端类型完全一致，避免联调误差。
- 前端通过 @connectrpc/connect-web 封装 React Hook，实现请求取消、自动重试、错误统一处理，适配电商复杂交互场景。
- 后端通过 Connect-go 拦截器实现统一的认证鉴权、日志记录、限流熔断、链路追踪，无需在业务代码中重复实现通用逻辑。

## 微服务架构核心设计

基于 DDD 领域驱动设计原则，结合 B2B2C 业务模型，完成微服务边界划分、通信规范定义，先完成电商核心微服务后继续扩展更多功能，层层递进。

### 2.1 核心微服务

| 微服务名称                   | 	核心职责                     | 	技术栈                        | 	核心功能详情                                                                          |
|-------------------------|---------------------------|-----------------------------|----------------------------------------------------------------------------------|
| 用户认证服务（Auth Service）    | 	身份认证、会话管理、RBAC 权限适配      | 	Go + Redis + Casdoor       | 	对接 Casdoor 完成登录 / 登出、令牌刷新、用户身份解析；角色权限校验；多端会话管理；第三方登录适配                          |
| 商品服务（Product Service）   | 	SPU/SKU 管理、类目管理、商品生命周期管控 | 	Go + PostgreSQL + Redis    | 	商品 SPU/SKU 的增删改查、上下架管理；商品属性、类目、品牌管理；商品详情缓存管理；对接搜索服务同步数据                         |
| 订单服务（Order Service）     | 	订单生命周期管理、分布式事务协调、订单数据查询  | 	Go + PostgreSQL + Kafka    | 	订单创建 / 取消 / 修改；订单状态机流转（待支付→已支付→已发货→已完成 / 已取消 / 售后）；对接库存、支付服务完成跨服务事务；订单明细、物流信息管理 |
| 支付服务（Payment Service）   | 	支付渠道聚合、支付流程管控、财务对账       | 	Go + PostgreSQL + Redis    | 	支付宝、微信支付 SDK 适配与聚合；支付单创建、支付状态同步、退款申请与处理；平台与商家对账管理；支付流水记录留存                      |
| 库存服务（Inventory Service） | 	库存全生命周期管理、库存操作原子化、库存预警   | 	Go + PostgreSQL            | + Redis + Kafka	分布式库存状态机管控；库存预占、扣减、释放、调整；库存流水记录；库存不足预警事件推送                       |
| 搜索服务（Search Service）    | 	商品全文检索、多维度筛选、排序推荐        | 	Go + Elasticsearch + Redis | 	基于 CQRS 架构实现读写分离；商品数据实时同步至 ES；全文检索、聚合筛选、智能排序；搜索词推荐、热门搜索管理                       |

### 扩展微服务

1. 商家服务（Merchant Service）
    - 职责：商家入驻管理、店铺运营、履约处理、财务结算
    - 技术栈：Go + PostgreSQL + Redis
    - 核心功能：商家入驻审核、店铺信息管理；商品运营权限管控；订单发货、售后审核；店铺运费模板、促销活动配置；商家结算账单管理

2. 履约服务（Fulfillment Service）
    - 职责：订单履约全流程、物流对接、仓储调度
    - 技术栈：Go + PostgreSQL + Kafka
    - 核心功能：订单发货、物流轨迹同步；第三方物流系统对接；履约异常处理；售后退货换货履约流程管控
3. 结算服务（Settlement Service）
    - 职责：平台佣金管理、商家结算、财务对账
    - 技术栈：Go + PostgreSQL + Redis
    - 核心功能：平台佣金比例配置与计算；商家结算周期管理、结算单生成；平台与商家财务对账；资金流水记录与统计
4. 营销服务（Marketing Service）
    - 职责：促销活动管理、优惠券体系、用户权益管理
    - 技术栈：Go + PostgreSQL + Redis
    - 核心功能：满减、折扣、秒杀等促销活动配置；优惠券发放、核销、过期管理；用户会员等级、积分体系管理；活动效果统计
5. 数据分析服务（Data Analytics Service）
    - 职责：业务指标统计、用户行为分析、经营报表生成
    - 技术栈：Go + ClickHouse + Kafka
    - 核心功能：核心业务指标实时计算；用户行为轨迹采集与分析；商家经营报表、平台运营报表生成；数据可视化接口提供

### 微服务通信边界与领域事件设计

采用「RPC 同步调用 + Kafka 事件驱动异步通信」的混合模式，明确服务边界，避免强耦合。

核心通信规则:

- 同步 RPC 调用：仅用于需要立即响应、强一致性的场景，例如下单时查询商品信息、支付前查询订单状态、库存预占校验。
- 异步事件通信：用于跨服务数据同步、异步流程处理、解耦非核心流程，通过 Kafka 实现领域事件的发布与订阅，保证最终一致性。
- 防腐层设计：每个微服务仅暴露对外 API 接口，内部领域模型不对外暴露，通过 DTO 完成数据转换，避免服务间模型耦合。

核心领域事件定义

| 事件名称                  | 事件核心内容                       | 发布服务 | 订阅服务           | 核心用途                   |
|-----------------------|------------------------------|------|----------------|------------------------|
| OrderCreatedEvent     | 订单 ID、用户 ID、SKU 列表、下单数量、订单金额 | 订单服务 | 库存服务、支付服务、营销服务 | 触发库存预占、支付单创建、营销优惠核销    |
| OrderPaidEvent        | 订单 ID、支付单号、支付金额、支付时间         | 支付服务 | 订单服务、库存服务、履约服务 | 更新订单状态、确认库存扣减、触发订单履约流程 |
| OrderCancelledEvent   | 订单 ID、取消原因、取消时间              | 订单服务 | 库存服务、支付服务、营销服务 | 触发库存释放、支付退款、优惠回滚       |
| InventoryChangedEvent | SKU_ID、仓库 ID、变更后可用库存、变更类型    | 库存服务 | 商品服务、订单服务 更新商品 | 可售状态、订单库存校验拦截          |
| ProductChangedEvent   | SPU/SKU_ID、变更内容、变更时间         | 商品服务 | 搜索服务           | 实时同步商品数据至 ES，更新搜索索引    |                        |
| PaymentRefundedEvent  | 订单 ID、退款单号、退款金额、退款状态         | 支付服务 | 订单服务、履约服务      | 更新订单退款状态、售后流程推进        |                        |

## 分布式库存状态机设计

库存是电商核心高风险模块，这里设计使用分布式库存状态机，解决超卖、库存不一致、并发冲突等核心问题。

### 库存分层模型

采用「实物库存 + 逻辑库存」双层模型，兼顾数据准确性与业务灵活性：

1. 实物库存（Physical Stock）
    - 核心维度：SKU_ID + 仓库 ID 唯一标识，记录仓库内实物库存的真实数据
    - 核心字段：在手库存（On-hand）、已锁定库存（Locked）、可用库存（Available）
    - 计算公式：可用库存 = 在手库存 - 已锁定库存
    - 用途：仓储实际库存管理，所有库存扣减、调整的最终依据，保证账实一致
2. 逻辑库存（Logic Stock）
    - 核心维度：SKU_ID 维度汇总全渠道可用库存，面向前端展示与下单校验
    - 用途：商品详情页库存展示、下单前置校验，支持预售等特殊业务场景的库存配置，与实物库存实时同步。

### 3.2 库存状态机与流转规则

核心库存状态定义

- 可用：可正常下单销售的库存，对应可用库存字段
- 预占：用户下单未支付，临时锁定的库存，避免超卖
- 已锁定：用户支付成功，等待发货扣减的库存
- 已扣减：订单发货完成，正式从在手库存中扣除的库存
- 已释放：订单取消 / 超时，从预占 / 锁定状态回滚至可用的库存

状态流转核心规则

- 可用 → 预占：用户下单创建订单，触发库存预占
- 预占 → 已锁定：订单支付成功，预占库存转为锁定库存
- 预占 → 可用：订单取消/支付超时，预占库存释放回可用
- 已锁定 → 已扣减：订单发货完成，锁定库存正式扣减，在手库存同步减少
- 已锁定 → 可用：订单全额退款，锁定库存释放回可用

### 高并发库存操作保障

1. 分布式锁机制
    - 基于 Redis 实现可重入分布式锁，以SKU_ID + 仓库ID作为锁粒度，保证单 SKU 库存操作的原子性，避免并发扣减导致的超卖。
    - 锁设计：设置合理的超时时间，支持锁自动续期，避免死锁；通过 Lua 脚本实现锁的加锁、解锁、续期的原子操作。
2. 库存操作原子化
    - 所有库存扣减、预占、释放操作，均通过 PostgreSQL 的事务 + 行锁实现数据库层面的原子性，避免并发更新导致的数据不一致。
    - 核心扣减 SQL 强制添加库存校验条件，例：UPDATE inventory SET locked = locked + ? WHERE sku_id = ? AND
      warehouse_id = ? AND
      available >= ?，从数据库层面杜绝超卖。
3. 库存流水与可追溯
    - 每一次库存变动都生成唯一的库存流水记录，关联订单号、操作类型、变动前后库存、操作人、操作时间，支持全链路库存追溯，方便问题排查与对账。
4. 库存预警机制
    - 通过 Kafka 监听库存变更事件，当 SKU 可用库存低于预设阈值时，触发stock.low_warning事件，通过通知服务推送至商家钉钉 /
      企业微信 / 邮件，提醒商家补货。

## 支付系统与搜索服务设计

### 支付系统设计（适配支付宝 / 微信 SDK）

基于策略模式设计，适配支付宝、微信支付第三方 SDK，实现支付渠道的灵活扩展与统一管理

核心架构设计

1. 支付渠道抽象与策略模式实现
    - 定义统一的Payer接口，封装支付核心能力，所有支付渠道实现该接口，通过 Fx 依赖注入框架完成渠道实例的管理，新增支付渠道无需修改核心业务代码。
    ```go
    // 统一支付接口定义
    type Payer interface {
    // 创建支付单：生成第三方支付所需的支付参数
    CreatePayment(ctx context.Context, req *CreatePaymentRequest) (*CreatePaymentResponse, error)
    // 查询支付状态：同步第三方支付结果
    QueryPayment(ctx context.Context, req *QueryPaymentRequest) (*QueryPaymentResponse, error)
    // 申请退款：发起退款申请
    Refund(ctx context.Context, req *RefundRequest) (*RefundResponse, error)
    // 查询退款状态：同步退款结果
    QueryRefund(ctx context.Context, req *QueryRefundRequest) (*QueryRefundResponse, error)
    }
    ```

    - 基于该接口，分别实现AlipayClient与WechatPayClient，适配支付宝、微信官方 Go SDK，封装签名、验签、请求发送、回调处理等通用逻辑，屏蔽不同渠道的接口差异。

2. 支付核心流程设计
    - 下单支付流程：订单服务创建订单→支付服务生成支付单→根据用户选择的支付渠道调用对应 SDK
      生成支付参数→前端唤起支付→用户支付完成→第三方异步回调支付结果→支付服务验签后更新支付状态→发布OrderPaidEvent事件→订单服务、库存服务同步处理后续流程。
    - 退款流程：用户 / 商家发起退款申请→订单服务校验退款权限→支付服务创建退款单→调用对应支付渠道 SDK
      发起退款→第三方回调退款结果→支付服务更新退款状态→发布PaymentRefundedEvent事件→订单服务、履约服务同步更新订单状态。

3. 回调与幂等设计
   统一的回调处理入口，针对支付宝、微信支付的回调分别实现验签逻辑，确保回调请求的合法性，避免伪造回调导致的资金风险。
   所有支付、退款操作均通过「支付单号 / 退款单号」实现幂等处理，重复回调、重复请求不会导致重复支付 / 重复退款，保证资金安全。

4. 对账管理
   每日自动拉取支付宝、微信支付的对账单，与系统内的支付流水、退款流水进行自动对账，生成对账差异报表，方便财务核对，保证账账一致。

### 搜索服务设计（CQRS 架构）

采用 CQRS 命令查询职责分离架构，实现高性能、高灵活的商品搜索能力，适配电商海量商品检索场景。

**核心架构设计**

1. CQRS 读写分离

- 命令端（写操作）：商品的创建、更新、上下架等写操作，全部走 PostgreSQL 主库，保证数据一致性；操作完成后发布ProductChangedEvent事件，通过
  Kafka 异步同步数据至 Elasticsearch。

- 查询端（读操作）：所有商品搜索、筛选、排序查询，全部走 Elasticsearch，针对查询场景做极致优化，支持高并发查询请求，避免查询压力影响主业务数据库。
  Elasticsearch 索引设计
  商品索引核心 Mapping 设计，适配电商搜索核心场景：

```json
{
  "mappings": {
    "properties": {
      "spu_id": {
        "type": "keyword"
      },
      "sku_id": {
        "type": "keyword"
      },
      "merchant_id": {
        "type": "keyword"
      },
      "name": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart"
      },
      "description": {
        "type": "text",
        "analyzer": "ik_max_word"
      },
      "category_id": {
        "type": "keyword"
      },
      "category_path": {
        "type": "keyword"
      },
      "brand_id": {
        "type": "keyword"
      },
      "price": {
        "type": "scaled_float",
        "scaling_factor": 100
      },
      "sale_count": {
        "type": "integer"
      },
      "attributes": {
        "type": "nested"
      },
      "status": {
        "type": "integer"
      },
      "created_at": {
        "type": "date"
      }
    }
  }
}
```

**核心搜索能力**

- 全文检索：基于 IK 分词器实现中文分词，支持商品名称、描述的模糊匹配、精准匹配，支持同义词、纠错词配置。
- 多维度聚合筛选：实现类目、品牌、价格区间、商品属性（颜色、尺寸、存储等）的多条件组合筛选，通过 ES 聚合能力实现侧边栏筛选选项动态生成。
- 智能排序：支持相关度排序、销量排序、价格升降序、新品排序，支持自定义综合排序权重（销量、评价、价格等多维度加权）。
- 搜索推荐：基于 ES Completion Suggester 实现输入框搜索词自动补全、热门搜索词推荐、相关搜索推荐。

**性能优化**

- 热门搜索结果缓存至 Redis，设置合理的过期时间，降低 ES 查询压力；
- 商品数据增量同步，仅同步变更字段，避免全量更新导致的性能损耗；
- 针对深分页场景，采用 search_after 优化，避免 from+size 深分页导致的性能问题。

## 性能与高可用架构设计

性能目标: 100 万 DAU、50000+ QPS、5000+ TPS

### 整体分层架构设计

采用四层架构，接入层基于 Kubernetes Cilium 实现，全链路高可用、可扩展：

1. 接入层：基于 Kubernetes Cilium 实现，替代传统 Nginx 接入层，提供高性能的 4 层 / 7 层负载均衡、流量管控、接入认证、TLS 终结，支持
   Kubernetes 原生服务发现，完美适配容器化部署架构，同时提供网络层安全隔离、限流能力。
2. 网关层：基于 Connect-go 实现 API 网关，统一处理请求路由、协议转换、认证鉴权、限流熔断、日志链路追踪，所有前端请求、第三方回调均通过网关层统一接入，避免微服务直接暴露。
3. 服务层：微服务集群，每个微服务独立部署、独立扩缩容，基于 Kubernetes 实现 Pod 多副本部署，跨可用区调度，避免单点故障；服务间通过
   RPC + 事件驱动通信，解耦依赖。
4. 数据层：PostgreSQL 一主多从集群、Redis 集群、Elasticsearch 集群、Kafka 集群，均采用高可用部署架构，保障数据可靠性与服务可用性。

### 核心性能优化方案

**多级缓存架构**

- 一级缓存：Go 进程本地缓存，缓存不常变更的静态数据（类目、品牌、基础配置），无网络开销，响应延迟最低。
- 二级缓存：Redis 集群分布式缓存，缓存商品详情、热门搜索结果、用户会话、库存预占信息等高频访问数据，缓存命中率目标≥95%。
- 三级缓存：CDN 缓存，缓存商品图片、静态资源、前端打包文件，降低源站访问压力，提升用户访问速度。

**异步化削峰填谷**

- 所有非核心流程全部异步化处理，例如下单成功后的短信通知、消息推送、数据统计、商品销量更新等，通过 Kafka 异步处理，避免阻塞主流程。
- 秒杀、大促等峰值场景，通过 Kafka 实现请求削峰，将同步下单转为异步排队处理，避免峰值流量直接打穿数据库，保障系统稳定性。

**数据库性能优化**

- 读写分离架构：PostgreSQL 采用一主多从部署，主库负责所有写操作与强一致性读操作，多个从库负责普通查询操作；通过 Sqlc 在
  Repository 层实现读写自动路由，根据方法类型自动分配主库 / 从库，无需业务代码感知。
- 索引优化：针对高频查询场景设计精准索引，避免无效索引、联合索引顺序不合理等问题；定期执行索引分析，优化慢查询，保障数据库查询性能。
- 行锁优化：所有更新操作均基于主键 / 唯一索引，避免表锁、间隙锁导致的并发性能问题，提升数据库并发处理能力。

### 高可用保障机制

1. 弹性扩缩容
    - 基于 Kubernetes HPA 实现 Pod 自动扩缩容，根据 CPU 使用率、内存使用率、P99
      请求延迟等指标，自动调整副本数量，应对流量波动；支持按时间段预设扩缩容策略，适配大促、高峰期流量。
2. 熔断与限流
    - 基于 Connect-go 拦截器集成 Uber-ratelimit 实现全局限流，针对每个 API 接口设置 QPS 阈值，避免流量过载；
    - 集成熔断组件，针对服务间调用实现熔断机制，当下游服务错误率超过阈值时，自动熔断，快速失败，避免级联故障，保护系统整体稳定性。
3. 数据高可用
    - PostgreSQL 集群采用主从复制，实现实时数据同步，主库故障时可快速切换至从库，保障服务不中断。

## 可观测性体系设计

使用Loki、OpenTelemetry、VictoriaMetrics、Jaeger、Grafana 技术栈，构建全链路可观测性体系，实现问题快速定位、性能瓶颈分析、业务指标监控。

### 分布式链路追踪

基于 OpenTelemetry 构建全链路追踪体系，覆盖前端→网关→微服务→数据库 / 缓存的全链路请求追踪：

- 网关层统一注入 TraceID，跨服务、跨进程传递追踪上下文，每个请求具备唯一 TraceID，串联全链路调用节点。
- 采集每个服务节点的 Span 信息，记录请求处理时间、错误信息、请求参数、返回结果，通过 Jaeger 实现链路可视化展示。
- 支持慢请求追踪、错误链路自动标记，快速定位性能瓶颈与异常根因。

### 日志收集与分析

基于 Loki 构建统一日志平台，实现全平台日志的集中采集、存储、查询、分析：

- 采用 Fluent Bit 采集 Kubernetes 容器日志、服务节点日志，统一结构化处理后推送至 Loki 集群，自动添加服务名、环境、Pod
  名称、TraceID 等标签，实现日志与链路追踪的关联。
- 基于 Grafana 实现日志可视化查询，支持复杂的 LogQL 查询语法，支持实时日志流查看、日志关键词告警、错误日志统计。
- 日志按服务、级别做分级存储，设置合理的留存周期，兼顾查询性能与存储成本。

### 指标监控与告警

基于 VictoriaMetrics 构建全维度指标监控体系，覆盖系统、服务、业务全维度指标：

监控架构设计:

- 指标采集：使用 VictoriaMetrics 采集指标，通过 OpenTelemetry 实现服务自定义指标埋点，通过 VM Agent
  采集主机、容器、数据库、中间件的基础设施指标，采集频率可配置。
- 指标存储：VictoriaMetrics 作为时序数据存储，支持高并发写入、高性能查询，具备优秀的压缩比，降低存储成本。
- 可视化展示：基于 Grafana 构建统一监控大盘，预定义基础设施、中间件、服务性能、业务指标四大类仪表盘，支持自定义图表、下钻分析。

核心监控指标:

- 基础设施指标：CPU、内存、磁盘、网络、节点状态；
- 中间件指标：PostgreSQL 连接数、慢查询占比、缓存命中率；Redis QPS、内存使用率、大 key 占比；Kafka 消息积压、生产 / 消费延迟；
- 服务性能指标：接口 QPS、P50/P90/P99 请求延迟、错误率、请求成功率；
- 业务指标：订单创建量、支付成功率、退款率、商品上下架量、DAU/MAU。
  告警体系设计
- 多级告警规则：严重告警（服务不可用、数据库宕机、订单支付异常）、重要告警（接口错误率超标、请求延迟过高、消息积压）、一般告警（资源使用率超标、库存预警）。
- 通知渠道：邮件通知、钉钉 / 企业微信机器人通知，支持告警分级、分组通知，不同级别告警推送至不同通知组，避免告警风暴。
- 告警抑制与静默：支持重复告警抑制、故障根因告警优先，支持告警静默配置，避免无效告警打扰。

## 数据库设计方案

基于 PostgreSQL 构建统一存储架构

### PostgreSQL 集群架构

采用一主多从高可用架构：
主节点：负责所有写操作、强一致性读操作，保障数据一致性；
多个从节点：负责非核心查询操作，分摊读压力，同时作为主节点的热备，主库故障时可快速切换；
采用 PgBouncer 作为连接池，管理数据库连接，避免连接数过多导致的数据库性能问题；
基于 Sqlc 实现数据库操作代码生成，避免手写 SQL 导致的 SQL 注入风险，同时提升开发效率。

### 核心业务表设计

1. 商品 SPU 表

    ```sql
    CREATE TABLE IF NOT EXISTS products.spu
    (
        id             BIGSERIAL PRIMARY KEY,
        spu_code       VARCHAR(64)  NOT NULL UNIQUE,
        name           VARCHAR(255) NOT NULL,
        description    TEXT         NOT NULL DEFAULT '',
        category_id    BIGINT       NOT NULL,
        brand_id       BIGINT       NOT NULL,
        merchant_id    BIGINT       NOT NULL,
        main_image_url VARCHAR(500) NOT NULL,
        banner_urls    JSONB        NOT NULL DEFAULT '[]',
        status         VARCHAR(32)  NOT NULL DEFAULT 'draft', -- draft/on_sale/off_sale/deleted
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now()
    );
    COMMENT ON TABLE products.spu IS '商品SPU表';
    ```

商品 SKU 表（基于您提供的初始表结构优化）

    ```sql
    CREATE TYPE products.skus_status_enum AS ENUM ('active','inactive','deleted');
    
    CREATE TABLE IF NOT EXISTS products.skus
    (
        id            BIGSERIAL PRIMARY KEY,
        sku_code      VARCHAR(64)               NOT NULL UNIQUE,
        spu_id        BIGINT                    NOT NULL REFERENCES products.spu (id),
        merchant_id   BIGINT                    NOT NULL,
        price         DECIMAL(10, 2)            NOT NULL,
        cost_price    DECIMAL(10, 2)            NOT NULL,
        bar_code      VARCHAR(128)              NOT NULL,
        thumbnail_url VARCHAR(500)              NOT NULL,
        attributes    JSONB                     NOT NULL DEFAULT '{}',
        status        products.skus_status_enum NOT NULL DEFAULT 'active',
        created_at    timestamptz               NOT NULL DEFAULT now(),
        updated_at    timestamptz               NOT NULL DEFAULT now()
    );
    COMMENT ON TABLE products.skus IS '商品SKU表';
    ```

3. 库存表

    ```sql
       CREATE TABLE IF NOT EXISTS products.inventory
       (
           id         BIGSERIAL PRIMARY KEY,
           sku_id     BIGINT      NOT NULL REFERENCES products.skus (id) UNIQUE,
           on_hand    INTEGER     NOT NULL DEFAULT 0,
           locked     INTEGER     NOT NULL DEFAULT 0,
           created_at timestamptz NOT NULL DEFAULT now(),
           updated_at timestamptz NOT NULL DEFAULT now(),
           CONSTRAINT inventory_sku_unique UNIQUE (sku_id)
       );
    COMMENT ON TABLE products.inventory IS '库存表';
    ```

4. 订单表

    ```sql
    CREATE TYPE orders.order_status_enum AS ENUM ('pending_payment','paid','shipped','completed','cancelled','
       refunding','refunded');
    
    CREATE TABLE IF NOT EXISTS orders.main
    (
        id              BIGSERIAL PRIMARY KEY,
        order_no        VARCHAR(64)              NOT NULL UNIQUE,
        user_id         VARCHAR(64)              NOT NULL,
        merchant_id     BIGINT                   NOT NULL,
        total_amount    DECIMAL(10, 2)           NOT NULL,
        pay_amount      DECIMAL(10, 2)           NOT NULL,
        freight_amount  DECIMAL(10, 2)           NOT NULL DEFAULT 0,
        discount_amount DECIMAL(10, 2)           NOT NULL DEFAULT 0,
        status          orders.order_status_enum NOT NULL DEFAULT 'pending_payment',
        address_info    JSONB                    NOT NULL,
        pay_deadline    timestamptz              NOT NULL,
        created_at      timestamptz              NOT NULL DEFAULT now(),
        updated_at      timestamptz              NOT NULL DEFAULT now()
    );
    COMMENT ON TABLE orders.main IS '订单主表';
    ```

5. 订单明细表

    ```sql
       CREATE TABLE IF NOT EXISTS orders.item
       (
           id             BIGSERIAL PRIMARY KEY,
           order_id       BIGINT         NOT NULL REFERENCES orders.main (id),
           order_no       VARCHAR(64)    NOT NULL,
           spu_id         BIGINT         NOT NULL,
           sku_id         BIGINT         NOT NULL REFERENCES products.skus (id),
           sku_name       VARCHAR(255)   NOT NULL,
           sku_attributes JSONB          NOT NULL,
           price          DECIMAL(10, 2) NOT NULL,
           quantity       INTEGER        NOT NULL,
           total_amount   DECIMAL(10, 2) NOT NULL,
           created_at     timestamptz    NOT NULL DEFAULT now()
       );
    COMMENT ON TABLE orders.item IS '订单明细表';
    ```

6. 支付单表

    ```sql
       CREATE TYPE payment.pay_status_enum AS ENUM ('pending','success','failed','closed','refunding','refunded');
    
    CREATE TABLE IF NOT EXISTS payment.main
    (
        id           BIGSERIAL PRIMARY KEY,
        pay_no       VARCHAR(64)             NOT NULL UNIQUE,
        order_no     VARCHAR(64)             NOT NULL,
        user_id      VARCHAR(64)             NOT NULL,
        merchant_id  BIGINT                  NOT NULL,
        pay_amount   DECIMAL(10, 2)          NOT NULL,
        pay_channel  VARCHAR(32)             NOT NULL, -- alipay/wechat
        status       payment.pay_status_enum NOT NULL DEFAULT 'pending',
        third_pay_no VARCHAR(64),
        paid_at      timestamptz,
        created_at   timestamptz             NOT NULL DEFAULT now(),
        updated_at   timestamptz             NOT NULL DEFAULT now()
    );
    COMMENT ON TABLE payment.main IS '支付单主表';
    ```

7. 退款单表

    ```sql
       CREATE TABLE IF NOT EXISTS payment.refund
       (
           id              BIGSERIAL PRIMARY KEY,
           refund_no       VARCHAR(64)    NOT NULL UNIQUE,
           order_no        VARCHAR(64)    NOT NULL,
           pay_no          VARCHAR(64)    NOT NULL REFERENCES payment.main (pay_no),
           refund_amount   DECIMAL(10, 2) NOT NULL,
           refund_reason   TEXT           NOT NULL,
           status          VARCHAR(32)    NOT NULL DEFAULT 'pending',
           third_refund_no VARCHAR(64),
           refunded_at     timestamptz,
           created_at      timestamptz    NOT NULL DEFAULT now(),
           updated_at      timestamptz    NOT NULL DEFAULT now()
       );
    COMMENT ON TABLE payment.refund IS '退款单表';
    ```

## Redis 缓存设计

采用 Redis 集群作为分布式缓存，核心缓存设计如下：

- 商品缓存：缓存热门 SPU/SKU 详情、商品类目信息，key 格式：product:spu:{spu_id}、product:sku:{sku_id}，过期时间 1-24
  小时，商品变更时主动更新。
- 库存缓存：缓存 SKU 可用库存，key 格式：inventory:available:{sku_id}，下单前置校验使用，库存变更时实时同步。
- 会话缓存：缓存用户登录令牌、用户身份信息，key 格式：auth:token:{token}，过期时间与会话有效期一致。
- 分布式锁：用于库存操作、订单创建、支付处理等并发场景，key 格式：lock:{biz_type}:{biz_id}，设置合理的超时时间，避免死锁。
- 限流缓存：用于接口限流、IP 限流，基于 Redis 实现滑动窗口、令牌桶限流算法。

## 容器化与编排设计

基于 Docker、Kubernetes 构建容器化部署架构，采用 Cilium 作为网络层与接入层，ArgoCD 实现 GitOps 持续部署，完美适配您的技术栈要求。

### 容器镜像最佳实践

采用多阶段构建，打造最小化、安全的容器镜像，示例 Dockerfile 如下：

```dockerfile
# 构建阶段

FROM golang:1.22-alpine AS builder
WORKDIR /app

# 安装依赖

COPY go.mod go.sum ./
RUN go mod download

# 复制源码

COPY . .

# 编译，禁用CGO，保证静态编译

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o app ./cmd/main.go

# 运行阶段

FROM alpine:latest

# 安装基础工具

RUN apk --no-cache add ca-certificates tzdata

# 设置时区

ENV TZ=Asia/Shanghai

# 复制编译产物

COPY --from=builder /app/app /usr/local/bin/app

# 非root用户运行，提升安全性

RUN adduser -D appuser
USER appuser

# 暴露端口

EXPOSE 8080

# 启动命令

ENTRYPOINT ["app"]
```

### Kubernetes 核心部署配置

1. 命名空间规划
   按环境、业务域划分命名空间，实现资源隔离：
    - ecommerce-gateway：网关层资源
    - ecommerce-core：核心微服务资源
    - ecommerce-extension：扩展微服务资源
    - ecommerce-middleware：中间件资源
    - ecommerce-monitoring：可观测性组件资源

2. 微服务 Deployment 示例（商品服务）

    ```yaml
       apiVersion: apps/v1
       kind: Deployment
       metadata:
       name: product-service
       namespace: ecommerce-core
       labels:
       app: product-service
       spec:
       replicas: 3
       selector:
       matchLabels:
       app: product-service
       strategy:
       rollingUpdate:
       maxSurge: 1
       maxUnavailable: 0
       type: RollingUpdate
       template:
       metadata:
       labels:
       app: product-service
       spec:
       containers:
         - name: product-service
           image: registry.example.com/ecommerce/product-service:v1.0.0
           imagePullPolicy: IfNotPresent
           ports:
             - name: http
               containerPort: 8080
               protocol: TCP
           # 资源限制与请求
           resources:
           limits:
           cpu: "1000m"
           memory: "1Gi"
           requests:
           cpu: "500m"
           memory: "512Mi"
           # 健康检查
           livenessProbe:
           httpGet:
           path: /health/live
           port: http
           initialDelaySeconds: 10
           periodSeconds: 30
           readinessProbe:
           httpGet:
           path: /health/ready
           port: http
           initialDelaySeconds: 5
           periodSeconds: 10
           # 环境变量与配置
           envFrom:
             - configMapRef:
               name: product-service-config
             - secretRef:
               name: product-service-secret
               imagePullSecrets:
         - name: registry-auth
    ```

3. 服务 Service 配置

    ```yaml
       apiVersion: v1
       kind: Service
       metadata:
       name: product-service
       namespace: ecommerce-core
       labels:
       app: product-service
       spec:
       selector:
       app: product-service
       ports:
    
         - name: http
           port: 80
           targetPort: http
           protocol: TCP
           type: ClusterIP
    ```

4. Cilium Gateway API 网关配置
   基于 Cilium Gateway API 实现 7 层网关，替代传统 Ingress，提供更强大的流量管控能力：

    ```yaml
       apiVersion: gateway.networking.k8s.io/v1
       kind: Gateway
       metadata:
       name: ecommerce-gateway
       namespace: ecommerce-gateway
       spec:
       gatewayClassName: cilium
       listeners:
    
         - name: http
           protocol: HTTP
           port: 80
           hostname: "*.ecommerce.example.com"
         - name: https
           protocol: HTTPS
           port: 443
           hostname: "*.ecommerce.example.com"
           tls:
           mode: Terminate
           certificateRefs:
             - kind: Secret
               name: ecommerce-tls-cert
    
         ---
       apiVersion: gateway.networking.k8s.io/v1
       kind: HTTPRoute
       metadata:
       name: product-service-route
       namespace: ecommerce-core
       spec:
       parentRefs:
    
         - name: ecommerce-gateway
           namespace: ecommerce-gateway
           hostnames:
         - "api.ecommerce.example.com"
           rules:
         - matches:
             - path:
               type: PathPrefix
               value: /api.v1.ProductService
               backendRefs:
             - name: product-service
               port: 80
    
         ---
       apiVersion: gateway.networking.k8s.io/v1
       kind: HTTPRoute
       metadata:
       name: order-service-route
       namespace: ecommerce-core
       spec:
       parentRefs:
    
         - name: ecommerce-gateway
           namespace: ecommerce-gateway
           hostnames:
         - "api.ecommerce.example.com"
           rules:
         - matches:
             - path:
               type: PathPrefix
               value: /api.v1.OrderService
               backendRefs:
             - name: order-service
               port: 80
               8.3 持续部署与流量管理
               基于 ArgoCD 实现 GitOps 持续部署，结合 Cilium 实现蓝绿部署、灰度发布、流量镜像、故障注入，替代传统服务网格方案。
    ```

5. ArgoCD 应用部署配置

    ```yaml
    apiVersion: argoproj.io/v1alpha1
    kind: Application
    metadata:
        name: product-service
        namespace: argocd
    spec:
        project: ecommerce
    source:
        repoURL: https://github.com/your-org/ecommerce-gitops.git
        targetRevision: main
        path: services/product-service/overlays/prod
        destination:
        server: https://kubernetes.default.svc
        namespace: ecommerce-core
    syncPolicy:
        automated:
        prune: true
        selfHeal: true
        syncOptions:
          - CreateNamespace=true
               revisionHistoryLimit: 10
    ```

6. 基于 Cilium 的灰度发布 / 蓝绿部署
   通过 Cilium HTTPRoute 实现流量切分，支持按权重、请求头、Cookie 等条件实现灰度发布，示例如下：

    ```yaml
    apiVersion: gateway.networking.k8s.io/v1
    kind: HTTPRoute
    metadata:
    name: product-service-canary
    namespace: ecommerce-core
    spec:
    parentRefs:
    
      - name: ecommerce-gateway
        namespace: ecommerce-gateway
        hostnames:
      - "api.ecommerce.example.com"
        rules:
      - matches:
          - path:
            type: PathPrefix
            value: /api.v1.ProductService
        # 权重流量切分：90%流量到稳定版，10%到灰度版
        backendRefs:
          - name: product-service-stable
            port: 80
            weight: 90
          - name: product-service-canary
            port: 80
            weight: 10
    ```

7. 流量镜像与故障注入
    - 流量镜像：通过 Cilium 实现生产流量镜像至测试环境，用于新版本验证、压测，不影响线上业务。
    - 故障注入：通过 Cilium 实现 HTTP 故障注入，支持延迟注入、错误码注入，用于混沌测试，验证系统容错能力。
    - 全链路流量管控：基于 Cilium 实现服务间的网络策略、流量限流、访问控制，实现零信任网络架构。

## RBAC 权限模型实现

基于 Casdoor 构建统一的 RBAC 权限体系，适配消费者、商家、管理员三个核心角色，实现细粒度的权限管控。

### 核心角色与权限定义

基于 B2B2C 业务模型，定义三个核心角色，明确每个角色的权限边界：

| 角色名称          | 角色描述         | 核心权限范围                                                    |
|---------------|--------------|-----------------------------------------------------------|
| 消费者（Consumer） | 平台普通用户，商品购买者 | 商品浏览、搜索、收藏；订单创建、支付、取消；售后申请、评价管理；个人信息、收货地址管理               |
| 商家（Merchant）  | 平台入驻商家，商品提供者 | 店铺信息管理；SPU/SKU 商品管理、上下架；订单发货、售后审核；运费模板、促销活动配置；财务结算、经营数据查看 |
| 平台管理员（Admin）  | 平台运营管理者      | 商家入驻审核、资质管理；平台类目、品牌管理；订单争议仲裁；平台佣金配置、财务对账；平台运营数据统计、系统配置管理  |

### 权限模型设计

采用「用户 - 角色 - 权限」三级 RBAC 模型，基于 Casdoor 实现全生命周期管理：

1. 权限粒度设计
    - 资源级权限：按微服务、API 接口维度定义权限点，例：product:spu:create、order:list:read、payment:refund:create，每个 API
      接口对应唯一的权限点。
    - 数据级权限：通过 merchant_id 实现数据权限隔离，商家仅能操作自己店铺的商品、订单、结算数据，管理员可操作全平台数据，消费者仅能操作自己的订单、个人数据。

2. 角色与权限绑定
    - 在 Casdoor 中创建三个核心角色，为每个角色绑定对应的权限点，支持角色权限的灵活配置、动态更新，无需修改代码。
    - 支持自定义角色，例如商家可创建店铺子账号，分配商品管理、订单管理等细分权限，适配商家多人员运营场景。

3. 权限校验流程
    - 用户登录：通过 Casdoor 完成身份认证，获取包含用户角色、权限信息的 JWT 令牌。
    - 请求拦截：前端请求携带 JWT 令牌，网关层 / Connect-go 拦截器解析令牌，验证用户身份有效性。
    - 权限校验：根据请求的 API 接口，匹配对应的权限点，校验用户角色是否具备该权限，无权限则直接返回 403。
    - 数据权限过滤：在 Repository 层，根据用户角色、用户 ID/merchant_id，自动添加数据过滤条件，确保用户仅能访问有权限的数据。

### Casdoor 集成适配

- 所有用户账号、角色、权限统一在 Casdoor 中管理，无需在业务系统中维护用户表，保证用户体系的一致性。
- 基于 Casdoor Go SDK 封装认证客户端，通过 Fx 注入到各微服务中，实现统一的令牌校验、用户信息解析。
- 支持 Casdoor 的单点登录（SSO），适配商家后台、管理后台、用户端多端统一登录。
- 支持第三方登录（微信、支付宝等），由 Casdoor 统一适配，业务系统无需单独对接。

## 实施路线图

### 分阶段迭代实施策略

采用敏捷迭代模式，先核心后扩展，分四个阶段落地，保障业务快速闭环，同时控制技术风险：

第一阶段：核心业务 MVP（2-3 个月）

- 核心目标：完成电商核心交易闭环，实现可上线的最小可用版本
- 核心工作：
    1. 完成基础设施搭建：Kubernetes 集群、PostgreSQL 集群、Redis 集群、Kafka、可观测性组件部署
    2. 落地 6 个核心微服务：认证服务、商品服务、订单服务、支付服务、库存服务、搜索服务
    3. 完成核心交易流程：商品浏览→下单→支付→订单状态同步全流程打通
    4. 前端用户端核心页面开发：商品详情、购物车、下单、支付、订单列表
- 交付成果：可上线的 MVP 版本，支持用户完成完整的购物流程

第二阶段：商家与平台能力落地（3 个月）

- 核心目标：完成 B2B2C 平台核心能力，支持商家入驻、运营，平台管理
- 核心工作：
    1. 落地商家服务、履约服务、结算服务三个扩展微服务
    2. 完成商家后台开发：商品管理、订单履约、售后处理、财务结算
    3. 完成平台管理后台开发：商家审核、类目管理、订单仲裁、平台配置
    4. 完善 RBAC 权限体系，实现商家、管理员的细粒度权限管控
- 交付成果：完整的 B2B2C 平台版本，支持商家入驻运营，平台统一管理

第三阶段：性能优化与高可用加固（2 个月）

- 核心目标：优化系统性能，完善高可用架构，支撑高并发流量
- 核心工作：
    1. 全链路压测，优化慢查询、性能瓶颈，达到预设的 QPS/TPS 目标
    2. 完善多级缓存架构，提升缓存命中率，降低数据库压力
    3. 完善限流熔断、弹性扩缩容机制，应对流量波动
    4. 完善可观测性体系，补全监控指标、告警规则、链路追踪
- 交付成果：高性能、高可用的生产级版本，可支撑大促峰值流量

第四阶段：营销与扩展能力落地（3 个月）

- 核心目标：完善平台营销能力、数据分析能力，提升平台竞争力
- 核心工作：
    1. 落地营销服务、数据分析服务两个扩展微服务
    2. 实现优惠券、满减、秒杀等营销活动能力
    3. 完成数据分析平台搭建，实现商家经营报表、平台运营报表
    4. 完善搜索推荐能力，实现个性化推荐、智能搜索
- 交付成果：具备完整营销能力、数据分析能力的全功能平台版本

### 技术风险与应对方案

| 风险类型       | 风险描述                         | 应对方案                                                                                                 |
|------------|------------------------------|------------------------------------------------------------------------------------------------------|
| 库存超卖与数据不一致 | 高并发下单场景下，库存扣减异常，导致超卖、库存数据不一致 | 1. 采用 Redis 分布式锁 + PostgreSQL事务行锁双重保障；2. 所有库存扣减 SQL 添加库存校验条件；3. 库存操作全链路流水记录，支持对账与补偿；4. 定期库存对账，修复数据差异 |
| 支付状态不一致    | 支付回调异常，导致订单支付状态与第三方支付状态不一致   | 1. 支付回调验签 + 幂等处理，避免重复回调异常；2.主动轮询查询支付状态，作为回调的兜底方案；3. 每日自动对账，修复状态差异；4. 支付状态变更通过事件驱动，保证各服务数据同步          |
| 大促峰值流量过载   | 秒杀、大促场景下，流量突增导致系统响应慢、甚至宕机    | 1. 采用 Kafka 实现请求削峰，同步转异步；2.多级缓存架构，热点数据全缓存，避免请求打穿到数据库；3. 全链路限流熔断，保护核心服务；4. 基于 K8s 实现弹性扩缩容，快速应对流量增长    |
| 微服务复杂度失控   | 微服务数量过多，服务间依赖复杂，导致运维、迭代难度提升  | 1. 严格遵循 DDD 领域边界划分，避免微服务过度拆分；2.采用事件驱动架构，解耦服务间依赖；3. 统一的代码规范、工程结构，降低维护成本；4. 完善的可观测性体系，快速定位问题           |

## 建议

1. 代码规范与工程化：统一前后端代码规范、工程结构，通过 CI/CD 流水线实现代码门禁、单元测试、自动部署，保障代码质量，避免技术债务累积。
2. 先闭环后优化：优先完成核心交易闭环，再逐步优化性能、扩展功能，避免过早优化导致的开发周期延长，快速验证业务模式。
3. 全链路压测前置：每个阶段上线前，都需要进行全链路压测，提前发现性能瓶颈、隐藏 bug，避免线上故障。
4. 数据备份与灾备：核心数据定期备份，制定完善的故障恢复预案，定期进行故障演练，保障数据安全与系统可用性。
5. 文档同步维护：维护完善的架构文档、API 文档、数据库设计文档，同步更新，避免文档与代码脱节，降低团队协作成本。

# Frontend stack

- React
- TypeScript
- Connect-web
- Buf

# Protocols

- RPC

# Infrastructure

## Scheduling

- Docker
- Kubernetes

## Streaming

- kafka

## Observability

- loki
- opentelemetry
- victoria-metrics
- jaeger
- grafana

## Databases

- Postgres
- Redis
  这些技术栈来编写一个中大型的电商项目,预计代码量会超过5w,甚至10w以上代码,我需要通过RBAC权限模型来给电商的三个角色进行划分,目前是消费者,商家,管理员,
  微服务划分包括但不限商品,搜索(ES),订单,支付,库存等常见功能,请你扮演一个专业的软件工程思想,10年经验的前端,后端,基础设施架构师和用户体验优先的产品经理,给我设计出这个电商的模型,
  包括数据库, 后端架构设计, 微服务划分, 微服务之间的通信边界(领域事件),先给出电商最核心微服务,之后层层递进扩展

# 技术设计

1. 语言： Golang + React TypeScript
2. API：使用google protobuf定义API来规范前后端的交互，@bufbuild/buf负责生成
3. 通信：前后端使用connectrpc/connect(兼容gRPC)来进行RPC协议通信
4. 数据库：编写SQL，使用工具生成go代码来调用
5.

后端：后端架构参考go-kratos的template来划分，biz层是定义结构体，data层负责与数据库/MQ/Search等中间件交互，service层负责转换proto，server则是应用本身的服务(
uber/fx)和第三方服务，例如注册发现(consul)

6. 网关：身份验证和授权， 路由守卫，安全功能等集成到网关，将通用功能集成到网关层，后端每个微服务无需重复集成
7. 前端：采用Vite+React TypeScript和husky+cz-git+biome来规范化，playwright+vitest用于测试
8. CI/CD：通过GitHub Actions将前后端项目构建/打包推送到容器注册表并更新清单仓库的版本号，由Argo CD监听清单仓库的变更并更新部署
9. 可观测性：由fluent-bit采集日志（Info，Warn，Error），应用通过OpenTelemetry
   sdk发送应用指标，由Jaeger展示链路（微服务调用情况），来使用Grafana进行追踪，监控，优化

# Backend stack

- golang
- connect-go
- Buf
- Protobuf
- sqlc
- fx
- casdoor

# Frontend stack

- React
- TypeScript
- Connect-web
- Buf

# Protocols

- RPC

# Infrastructure

## Scheduling

- Docker
- Kubernetes

## Streaming

- kafka

## Observability

- loki
- opentelemetry
- victoria-metrics
- jaeger
- grafana

## Databases

- Postgres
- Redis

# 先决条件

1. 前端：Node.js >= 22
2. 后端：Golang >= go1.13
3. 网关: Golang >= go1.13
4. 数据库：Postgres >= 12
5. 缓存：Redis >= 6
6. 注册/发现：Consul

如果想体验完整项目，你还需安装:

1. Docker
2. Kubernetes
3. ArgoCD
4. Consul
5. cert-manager
6. OpenTelemetry
7. Victoria metrics
8. Grafana
9. Loki
10. Jaeger
11. fluent-bit

# 运行

## backend

```bash
docker compose -f backend/infrastructure/postgres up -d
docker compose -f backend/infrastructure/redis up -d
docker compose -f backend/infrastructure/consul up -d
```

修改`configs/config.yaml`为你的host地址:

```yaml
data:
  database:
    host: "192.168.3.105"
  redis:
    host: "192.168.3.114"
```

启动后端微服务

```bash
cd application/<service>

go run cmd/server/main.go \
-config-center=http://<consul-addr> \
-config-path=<consul-service-config-file>
```

## 网关：

```shell
OWNER=OWNER \
CASDOOR_URL=https://CASDOOR_URL \
DISCOVERY_DSN=consul://<consul-addr> \
DISCOVERY_CONFIG_PATH=<consul-service-config-file> \
POLICIES_FILE_PATH=./dynamic-config/policies/policies.csv \
MODEL_FILE_PATH=./dynamic-config/policies/model.conf \
USE_TLS=false \
USE_HTTP3=false \
HTTP_PORT=8080 \
go run cmd/gateway/main.go
```

测试：

- 直接访问后端:

```bash
curl -v -X POST http://localhost:4000/greet.v1.GreetService/SubmitAuth \
--header 'Content-Type: application/json' \
--data-raw '{}'
```

- 经过网关:

```shell
curl -v -X POST http://localhost:8080/user.v1.UserService/UserProfile \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImVjb21tZXJjZSIsInR5cCI6IkpXVCJ9.eyJhdWQiOlsiMDI5MWFiMjFmNTZmZmE2NWY5ODQiXSwiYXZhdGFyIjoiaHR0cHM6Ly9jZG4uY2FzYmluLm9yZy9pbWcvY2FzYmluLnN2ZyIsImF6cCI6IjAyOTFhYjIxZjU2ZmZhNjVmOTg0IiwiZGlzcGxheU5hbWUiOiJ0ZXN0IiwiZW1haWwiOiJ4aWNvbnlAcXEuY29tIiwiZXhwIjoxNzY1OTUyNjc3LCJpYXQiOjE3NjU5NDkwNzcsImlkIjoiZTMzZTEyYmEtZmIyNS00ZmI1LWFhNGMtOTNmZWUyN2IxODQxIiwiaXNzIjoiaHR0cHM6Ly9hcGlrdi5jb206ODA4MSIsImp0aSI6ImFkbWluLzQ1Y2RmNmExLTUxYTItNDJhMi04MDFmLTM1MjI1NWY1NGI1NiIsIm5hbWUiOiJ0ZXN0IiwibmJmIjoxNzY1OTQ5MDc3LCJzdWIiOiJlMzNlMTJiYS1mYjI1LTRmYjUtYWE0Yy05M2ZlZTI3YjE4NDEiLCJ0YWciOiIiLCJ0b2tlblR5cGUiOiJhY2Nlc3MtdG9rZW4ifQ.uI2JOg2efTKUojBp5TbAPCDd27d08R66uLubOy084tDllPCp21me36gVrtdJJ5KKPQlsEd8vqxBK8gBUsy9vJOTeFjqm0GtwiGqsxemJc1rYV7-25rIeiiDz0JUnKEN0GMa6rmXesiWbM02pIC4WRnXisv1s8wPkYgvag_CJo8-RxjuwC54JQfcbt2u33TWKBUvlwNUlx7_jLDfrhMZmmyabCAFcVKOZkQBh2fbqjP4uIiVOM_oBvqF9tapRDq0ZWtI136LiZmqtDBzubTfC2X1QvHQNE6J_w93-LLpX1i-yooC7oXBNNNSh4379U_ZjcbFJYENd1-Ie_fUL6KJrmrC20SJK2Pby78NMYkaOpHNYSGzxKi25ULlbBEdmNTsHsQKPlLM3O3zWTWC04WZ2uXlEwD5j7nHJbiMuXqBeudvIFo_RMTwrJyU_u2FeHrHGmMxcFxERwOKO8vC-4u0JxUTL7BghgcJPg776wU4VJ5ayMVGTQIEOhVONlGZg3wzqJHPZ1WPkYncweZrD6LTlP3L-YarO2mLoa6r6fS5s2UtTIQXEri-zhzqegDEeGgPVIWlVs4PEK-xnH3JluWMUCNCd-AykD11YRqI_iwYqFOSjQpm2WLywGYiL7YVYufqfxsUEXzXRphHR1Q9mXb8IET0n4aTY_F0rtlf2sd9QucU' \
--data-raw '{}'
```

- CI:
  ![img_3.png](images/img_3.png)

- CD:
  ![img_2.png](images/img_2.png)

- Register/discover:
  ![img.png](images/img.png)

- Trace:
  ![img_1.png](images/img_1.png)

- Log:
  ![img_4.png](images/img_4.png)

- Metrics
  ![img_5.png](images/img_5.png)

## Frontend

```bash
pnpm i
pnpm dev
```

测试：

```bash
curl -v http://localhost:3000
```

## 前端设计
### 地址页
“智能推荐/默认”：当用户进入“新增地址”页面时，通过 IP 定位自动选中“省、市、区”，用户只需要手动输入“详细地址（门牌号）”。

# 数据来源
1. IP: https://developer.aliyun.com/article/1638991
2. 中国省，市，区, 街道四级SQL数据: https://github.com/gaohuazi/china_regions
