# eShop 与 ecommerce 架构对比及交易主链目标方案

> 日期：2026-08-12  
> 范围：对比 `eShop` 与 `ecommerce` 的架构、运行时拓扑、订单主链、一致性、工程化与测试体系，并为 `ecommerce` 给出可执行的目标架构和分阶段路线。  
> 方法：基于两个本地仓库指定提交的静态源码、设计文档、部署清单和测试代码分析；未启动服务、未连接基础设施、未执行构建或测试。  
> 文档性质：独立评审报告，不替代 `docs/design/`、`.service-matrix.yaml` 或 `TODO.md` 的真相源地位。

## 1. 结论

`eShop` 和 `ecommerce` 的优势处于不同层面：

- `eShop` 的业务范围较窄，但拥有一条可以通过可执行拓扑拉起并演示的商城主链。它在服务编排、订单聚合、事务行为、集成事件日志和真实依赖功能测试方面更成熟。
- `ecommerce` 的业务边界更广，在 API 校验、网关、配置中心、可观测性、CI/CD、GitOps 和架构知识管理方面更强；但订单、库存和支付的运行时交易内核尚未成立。
- `ecommerce` 当前不是「主链还差少量接线」，而是订单会返回假成功、库存会写伪流水但不扣库存、支付全部显式未实现、跨服务依赖全部未接线。
- 不应把 `eShop` 整体翻译成 Go 后搬入 `ecommerce`。应借用它的工程模式，同时拒绝它面向演示的库存检查、模拟支付、消费失败后 ACK、缺少完整 outbox relay 等设计。
- `ecommerce` 最合适的目标是：order application 层负责 checkout 编排；Postgres 保存请求事实和本域状态；同步副作用使用稳定幂等键加持久化补偿；异步副作用使用 Outbox + Kafka + Inbox；只有 `OrderReadyForFulfillment` 可以触发履约。

建议把工作划分为两个里程碑：

1. P0 先形成「可靠的未支付订单」：服务端报价、请求幂等围栏、全组库存预占、单事务订单落库和补偿自愈。
2. P1 再形成「可支付且可收敛的交易」：支付事实、异步库存确认、晚到退款、超时取消、对账、服务身份和端到端验收。

在 P1 全绿前，不应新增 fulfillment、金融 settlement、marketing 或 analytics 的业务实现。

## 2. 仓库快照与评价口径

| 仓库 | 分析提交 | 提交日期 | 定位 |
|---|---|---|---|
| `eShop` | `9b4f9434f46fdc5c1a6e9e936af2868340cdbc48` | 2026-04-21 | .NET/Aspire 官方参考商城，强调可运行的分布式应用样板 |
| `ecommerce` | `4e68ecc4e2a8c7c03a778f7a8c544ad8a2cbebbb` | 2026-08-12 | Go + ConnectRPC 的 B2B2C 商城平台，强调微服务治理与平台工程 |

本报告从以下维度比较两者：

1. 服务边界与运行时拓扑是否可执行；
2. 订单、库存、支付的领域模型是否表达真实状态；
3. 本地事务与跨服务一致性是否能处理超时、重复和崩溃；
4. 身份、授权和网络边界是否闭合；
5. 测试是否能验证真实数据库、消息系统和浏览器主链；
6. 部署、配置、可观测性和知识真相源是否可持续维护。

## 3. eShop 架构画像

### 3.1 可执行拓扑

[`eShop.AppHost/Program.cs`](../../../eShop/src/eShop.AppHost/Program.cs) 使用 Aspire 代码声明 Redis、RabbitMQ、PostgreSQL 数据库、业务服务、等待条件、健康检查、移动 BFF 和 WebApp 引用。它的核心价值不是使用了某个 .NET 框架，而是「系统拓扑本身可执行」：

- 依赖资源不是 README 中的一张图，而是启动模型的一部分；
- 服务明确等待数据库或消息系统可用后再启动；
- 前端、BFF、服务与外部资源之间的引用关系可被工具解析；
- 开发环境可以从同一入口观察整个系统健康状态。

这让 `eShop` 即使业务正确性不是生产级，也能较容易跑通演示主链。

### 3.2 共享运行时默认值

[`eShop.ServiceDefaults/Extensions.cs`](../../../eShop/src/eShop.ServiceDefaults/Extensions.cs) 集中添加服务发现、标准 HTTP 韧性、OpenTelemetry 和健康端点。每个服务不需要独立拼装同一套横切能力。

这一模式解决的是「服务之间的默认行为必须一致」，包括：

- outbound HTTP 调用的发现、超时和重试；
- tracing、metrics 和 logging；
- liveness/readiness；
- 开发环境的默认服务发现配置。

`ecommerce` 已有类似目标，但当前大量基础设施逻辑复制在 10 个服务的 `internal/pkg` 中，再由 structcheck 棘轮保证同构。短期不必为交易主链发起全仓重构，但新增的 outbound Connect client、eventing 和 worker runtime 应放进共享包，避免继续复制。

### 3.3 订单聚合与状态机

[`Ordering.Domain/Order.cs`](../../../eShop/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs) 把订单状态迁移放在聚合方法里，而不是让 handler 任意写状态字段。状态迁移会产生领域事件，应用层再负责持久化和集成事件。

[`TransactionBehavior.cs`](../../../eShop/src/Ordering.API/Application/Behaviors/TransactionBehavior.cs) 将命令执行、本地数据库事务和提交后的事件发布组织成统一管线。它建立了一个重要约束：命令的业务状态和需要对外传播的事件必须有明确的事务边界。

`ecommerce` 可借鉴这一点，但不应照搬成隐藏所有行为的通用中间件。订单、库存、支付的事务脚本包含不同的 fence、CAS 和 outbox 约束，应用用例应显式表达这些步骤。

### 3.4 集成事件日志

[`IntegrationEventLogService.cs`](../../../eShop/src/IntegrationEventLogEF/Services/IntegrationEventLogService.cs) 将待发布事件和业务事务绑定，避免「业务状态已提交但事件从未记录」。这与 `ecommerce` 目标中的 outbox 一致。

但 eShop 当前实现不应被当作完整生产模板：静态分析未发现一个能在进程崩溃后持续扫描并重放未发布事件的完整后台 relay。`ecommerce` 应把 relay、发布 ACK、重放、滞留指标和 inbox 去重作为一个整体落地。

### 3.5 功能测试

[`OrderingApiFixture.cs`](../../../eShop/tests/Ordering.FunctionalTests/OrderingApiFixture.cs) 使用真实 Aspire PostgreSQL 和 Identity 环境执行 Ordering API 功能测试。仓库还拥有较多领域单元测试和 Playwright 浏览器流程。

这种测试的价值在于验证：

- 真实 schema 与 ORM/查询是否匹配；
- 认证、HTTP、数据库和业务状态是否能组成一条完整路径；
- 测试不是只验证 mock 的调用次数。

### 3.6 不应照搬的设计

1. Catalog 在订单等待校验时只检查库存，没有建立 reservation，存在检查与扣减之间的 TOCTOU 窗口。
2. 库存在订单已支付后才扣减，并明确不阻塞库存，无法保证已收款订单一定有货。
3. PaymentProcessor 使用模拟支付结果，只适合演示，不是支付事实模型。
4. [`RabbitMQEventBus.cs`](../../../eShop/src/EventBusRabbitMQ/RabbitMQEventBus.cs) 的 handler 异常路径会记录错误但继续 ACK，可能造成不可恢复的消息丢失。
5. 没有完整证明 outbox 未发布事件在进程重启后一定被重放。
6. 开发凭据、启动时迁移和可变镜像标签不适合作为生产设计。

此外，[`README.md`](../../../eShop/README.md) 仍写 .NET 9，而 [`global.json`](../../../eShop/global.json) 已固定 .NET 10 SDK，源码和锁定文件应优先于 README 描述。

## 4. ecommerce 架构画像

### 4.1 已有优势

`ecommerce` 已建立多项比 eShop 更完整的平台能力：

| 能力 | 现状 |
|---|---|
| API | ConnectRPC + Proto + buf.validate，同时生成 Go/TypeScript 客户端 |
| 网关 | 服务发现、JWT、RBAC、重试、熔断、日志、追踪和精确 RPC 策略 |
| 配置 | 独立 Config Center SDK、热更新、Consul 仅负责注册发现 |
| 数据访问 | pgx/v5 + sqlc，服务各自拥有 schema 和查询 |
| 可观测性 | OTel、结构化日志、数据库追踪和已有观测设计 |
| 部署 | Compose、Helm、ArgoCD、镜像矩阵和服务清单一致性检查 |
| 架构治理 | `context/`、`docs/design/`、`.service-matrix.yaml`、`TODO.md` 分层真相源 |
| CI | 按服务路径分发 build/vet/test/image，structcheck 检查拓扑和同构漂移 |

这些基础意味着目标不应是替换现有平台，而是让交易内核达到同一成熟度。

### 4.2 运行时拓扑并未形成

服务拓扑真相源 [`.service-matrix.yaml`](../../.service-matrix.yaml) 中，10 个服务的 `depends_on` 全部为空。order 和 payment 只有 planned 依赖，且 order 的 planned 列表仍缺 cart 与 merchant。

当前真实结构是：

```text
Browser -> Gateway -> 每个服务 -> 各自数据库/缓存

order -> 进程内 GoEventBus
order -X-> cart/product/merchant/address/inventory
payment -X-> order
inventory -X-> order
业务服务 -X-> Kafka
```

仓库中的 Kafka Connect 清单用于 PostgreSQL CDC 到 Elasticsearch，不是订单领域事件总线。后端 `go.mod` 中也没有应用层 Kafka client。

### 4.3 订单是假成功

[`order/internal/service/order.go`](../../backend/services/order/internal/service/order.go) 的 `CreateOrder` 丢弃真实请求，构造空 `CartItemIDs`、零值 `AddressID` 和空备注。

[`order/internal/biz/application/order.go`](../../backend/services/order/internal/biz/application/order.go) 随后直接返回空成功响应，没有查询购物车、核价、预占库存或落库。

[`order/internal/data/order.go`](../../backend/services/order/internal/data/order.go) 中：

- `SaveOrderGroup` 和 `SaveOrder` 只打印日志并返回 nil；
- 多个查询和状态更新方法直接 panic；
- `CompleteOrder` 可以在没有真实持久化的情况下继续发布进程内事件。

前端 [`checkout/index.tsx`](../../frontend/apps/consumer/src/routes/checkout/index.tsx) 会调用该 RPC，收到成功后跳到固定支付结果页。因此这不是「尚未实现但安全失败」，而是会对用户撒谎的可达路径。

### 4.4 库存实现不可用

[`inventory/internal/data/inventory.go`](../../backend/services/inventory/internal/data/inventory.go) 的 `Reserve` 同时存在以下问题：

1. SQL 条件要求 `version = 当前版本`，代码却传 `当前版本 + 1`，更新永远命中零行；
2. `:execrows` 返回的影响行数被丢弃，零行不会转成错误；
3. SQL 是 `available = available - quantity`，代码却传 `available - 请求数量`，数量语义写反；
4. 更新失败时错误处理传入之前已经为 nil 的 `err`，而不是 `reserveErr`；
5. 没有调用 `ExecTx`，`FOR UPDATE` 在自动提交查询结束后已经释放；
6. 即使库存未改变，仍可能插入声称预占成功的 change log；
7. `ReleaseReserve` 尚未实现。

[`inventory/schema.sql`](../../backend/services/inventory/internal/data/schema/schema.sql) 也没有 `reserved` 列，现有注释把 `available` 定义为 `on_hand - locked`，无法表达「未支付预占」。`change_log` 的 `UNIQUE(order_no, change_type)` 还会阻止一个订单的多个 SKU 写入同一种流水。

### 4.5 支付是显式桩，数据模型已过期

[`payment/internal/data/payment.go`](../../backend/services/payment/internal/data/payment.go) 的五个方法全部返回 `CodeUnimplemented`。这种失败方式比订单假成功安全，但代表支付闭环不存在。

现有 [`payment.proto`](../../backend/api/payment/v1/payment.proto) 允许客户端提交 amount、currency、consumer_id、freeze_id 和余额版本；支付 schema 仍以旧 balance/consumerOrder 设计为中心。目标设计要求 payment 从 order 获取权威金额，并把「渠道资金事实」与「订单接受哪笔支付」分开，因此这部分应整体重建，而不是恢复注释中的旧实现。

### 4.6 订单前置服务仍有阻断缺陷

- Address 的 Create 接口信任请求体 user_id；Get/Update/Delete/SetDefault 只按 address_id 查询，形成 BOLA。相关 SQL 见 [`address/queries/query.sql`](../../backend/services/address/internal/data/queries/query.sql)。
- Merchant 的 Approve SQL 没有 WHERE，批准一份申请会更新全表，见 [`merchant/queries/merchant.sql`](../../backend/services/merchant/internal/data/queries/merchant.sql)。
- Cart 没有按 ID 和认证用户批量反查的内部 RPC，也没有成交后按报价数量核销的接口。
- Product 只有按 `spu_code` 单查详情，没有交易用的批量 SKU 快照接口。
- Merchant 没有批量返回可交易状态的 RPC。

在这些接口完成前，order 无法安全地相信 cart item、地址、商品价格或商家状态。

### 4.7 安全边界没有闭合

[`STACK.md`](../../STACK.md) 将认证授权描述为「集中在网关，微服务零重复」，但 [`helm/values.yaml`](../../helm/values.yaml) 把所有业务服务覆盖为 `LoadBalancer`。这意味着「请求一定经过网关」不是由网络策略保证的事实。

同时，网关只是在 JWT 成功后写入 `x-md-global-user-id`，没有先删除所有客户端自带的 `x-md-global-*` 头。匿名路由或缺失覆盖的头存在伪造风险。

Inventory 的内部 RPC 当前在网关 RBAC 中授权给 `admin`，见 [`policies.csv`](../../gateway/configs/policies/policies.csv)。用户角色不是服务身份，不能用 admin RBAC 代替 order workload 的身份认证。

### 4.8 测试无法证明交易正确性

项目测试规范已经明确要求 data 层使用 PostgreSQL 18 Testcontainers，见 [`docs/TESTING.md`](../TESTING.md)，但共享 `backend/pkg/testutil` 尚不存在，order、inventory、payment 也没有业务或数据库集成测试。

因此当前 `go test -short ./...` 即使全绿，也只说明基础设施样板和少量服务可编译，不能证明下单、预占、支付、退款或并发正确性。

## 5. 总体对比

| 维度 | eShop | ecommerce | 判断 |
|---|---|---|---|
| 可执行拓扑 | Aspire AppHost 明确资源和依赖 | matrix/compose/helm 很丰富，但服务间依赖为空 | eShop 当前更完整 |
| 业务覆盖 | 核心商城主链较窄 | B2B2C 边界更广 | ecommerce 目标更大 |
| 订单领域模型 | 聚合和状态迁移清晰 | 有领域结构，但创建与持久化是桩 | eShop 当前更成熟 |
| 库存正确性 | 能演示，但只有检查和支付后扣减 | 目标设计更严谨，当前实现错误 | ecommerce 目标更强、现状更弱 |
| 支付正确性 | 模拟处理 | 显式未实现，目标包含回调事实与退款 | 两者当前都非生产级 |
| 事件一致性 | RabbitMQ + 事务内事件日志，relay/ACK 有缺口 | 只有进程内 EventBus，目标为 Outbox/Kafka/Inbox | ecommerce 需从零落地应用事件链 |
| API 与校验 | REST/gRPC 组合 | Proto + ConnectRPC + validate + 双端生成 | ecommerce 更强 |
| 网关与 RBAC | BFF/YARP 为主 | 集中式 JWT/RBAC/服务发现 | ecommerce 更强，但网络边界需修 |
| 配置治理 | Aspire 配置与环境变量 | 独立配置中心、热更新、真相源 | ecommerce 更强 |
| 可观测性 | ServiceDefaults 标准化 | OTel 与治理设计更丰富 | 各有优势，ecommerce 目标更完整 |
| 功能测试 | 有真实依赖 fixture 和浏览器流程 | 核心交易路径零覆盖 | eShop 明显更强 |
| 数据库迁移 | EF migration 流程可用 | 仍是手工 schema.sql | eShop 更成熟 |
| 部署治理 | 适合示例与云原生演示 | Helm/ArgoCD/矩阵 CI 更丰富 | ecommerce 更强，但运行时尚未验证 |

## 6. 目标架构原则

### 6.1 Checkout 属于 order，不新建服务

Checkout 是短生命周期报价和订单提交编排，没有独立、长期、权威业务事实。它应位于 order application 层，而不是新建 checkout/settlement 微服务。

`settlement` 名称保留给佣金、商家结算单和财务对账，避免同名服务承担两种完全不同的职责。

### 6.2 正确性由多个事实源和收敛机制共同保证

系统不存在一个覆盖全部交易的单一真相源：

- order DB 保存下单请求和订单接受结果；
- inventory DB 保存库存与 reservation；
- payment DB 保存支付尝试、回调和退款；
- 支付渠道保存外部资金事实。

每个域依靠唯一约束、条件更新和状态机守住本域；跨域依靠可靠事件和对账收敛。

### 6.3 Redis 只保存允许丢失的数据

Redis 中只保存 15 分钟报价。报价丢失会让用户重新报价，但不会重复扣款、重复建单或破坏库存。

`processing`、幂等结果、业务错误、fence 和支付状态都必须在 Postgres 中。

### 6.4 所有状态变更都有稳定幂等键

| 操作 | 稳定键 | 效果侧防线 |
|---|---|---|
| CreateOrder | `client_token` | `order_request.client_token UNIQUE` + fence 条件更新 |
| ReserveGroup | `reservation_id` | reservation 唯一键 + payload hash + 吸收态状态机 |
| CreatePayment | `payment_request_id` | payment attempt 唯一键 |
| 事件消费 | `event_id + consumer` | inbox 唯一约束 |
| Refund | `pay_no` | refund task 唯一约束 |

### 6.5 同步链和异步链使用不同可靠性模型

- 用户响应前必须知道结果的动作使用同步 RPC；若 RPC 已产生副作用，调用方必须持久化补偿任务。
- 用户响应后可以独立推进的动作使用 outbox 至少一次投递和 inbox 幂等消费。
- 不追求 Kafka 端到端 exactly-once；目标是允许重复但不允许确认后的事件不可追踪地丢失。

### 6.6 远程调用不进入本地数据库事务

正确顺序是：

1. 在事务外完成下游读取和有稳定幂等键的 ReserveGroup；
2. 收集需要落库的不可变快照；
3. 开启短本地事务；
4. 原子写业务状态、日志、fence 条件更新和 outbox；
5. 提交后返回。

任何数据库事务都不应持锁等待 address、product、merchant、inventory 或 Kafka。

### 6.7 金额全链路使用整数分

新交易路径禁止 `float64`。使用 `int64 amount_minor`，提供 checked add/mul 和 PostgreSQL Numeric 无损转换；币种 v1 固定 CNY，但请求和响应仍显式携带 currency。

## 7. 目标运行时拓扑

### 7.1 当前与目标

```text
当前
Browser ─> Gateway ─> 10 个互不调用的服务 ─> 各自存储
                       └─ order 进程内 EventBus

目标
Browser ─> Gateway ─> order-api
                       ├─> cart-api       批量反查
                       ├─> product-api    核价/状态
                       ├─> merchant-api   可交易状态
                       ├─> address-api    属主地址快照
                       └─> inventory-api  全组原子预占

Browser ─> Gateway ─> payment-api ─> order-api 获取权威应付事实
Payment channel ─────> payment-api

order/payment/inventory DB
    └─> outbox relay ─> Kafka ─> inbox consumers
                               ├─ order-worker
                               ├─ inventory-worker
                               ├─ payment-worker
                               └─ cart-worker
```

### 7.2 建议的进程角色

不新增业务边界，但允许同一镜像运行不同角色：

| 角色 | 职责 | 是否注册 RPC |
|---|---|---|
| `order-api` | CreateQuote/CreateOrder/查询接口 | 是 |
| `order-worker` | outbox relay、支付/库存消费者、补偿任务 | 否 |
| `inventory-api` | BatchGetStock 和 reservation RPC | 是，仅内部可达 |
| `inventory-worker` | 确认/释放消费者、过期与对账 | 否 |
| `payment-api` | CreatePayment、状态查询、渠道回调 | 是 |
| `payment-worker` | refund task、对账、outbox relay | 否 |
| `cart-worker` | 消费 OrderCreated，按数量核销 | 否 |

周期扫描使用相同镜像的 Kubernetes CronJob，配合 `concurrencyPolicy: Forbid`、`FOR UPDATE SKIP LOCKED` 和 CAS，而不是每个 API 副本各自启动无协调 ticker。

### 7.3 拓扑真相源需要表达事件关系

建议 `.service-matrix.yaml` 至少增加以下概念：

```yaml
services:
  order:
    rpc_depends_on: [cart, product, merchant, address, inventory]
    publishes:
      - OrderCreated.v1
      - InventoryConfirmRequested.v1
      - OrderCancelled.v1
      - PaymentRefundRequested.v1
      - OrderReadyForFulfillment.v1
    subscribes:
      - PaymentCaptured.v1
      - InventoryConfirmed.v1
      - InventoryConfirmationFailed.v1
```

structcheck 应验证 matrix、Go outbound clients、Kafka consumer 注册、compose 和 Helm worker 角色之间的基本一致性。

## 8. 数据所有权

| 上下文 | 权威数据 | 其他上下文只能获得 |
|---|---|---|
| order | quote、order_request、订单组/子单/明细快照、订单日志、接受的支付单号 | 查询 DTO 和领域事件 |
| inventory | stock、reservation、reservation item、库存流水 | 查询库存展示、幂等 reservation 命令 |
| payment | payment attempt、回调原文、capture/refund 状态、refund task | 支付状态 DTO 和资金事件 |
| cart | 当前购物车行、数量、选中状态 | 属主约束的批量读取、幂等数量核销 |
| product | SKU 价格、在售状态、商家归属和商品快照 | 交易只读 DTO |
| merchant | 商家可交易状态、店铺身份 | 批量可交易 DTO |
| address | 用户当前地址 | 属主校验后的地址快照 DTO |

Order 保存商品、店铺和地址的成交时快照，历史订单不再回查可变主数据。

## 9. 同步 RPC 边界

| 调用 | 使用阶段 | 为什么同步 | 重试语义 |
|---|---|---|---|
| order -> cart `BatchGetCartItems` | CreateQuote | 必须验证 cart item 属于认证用户 | 只读，可自动重试 1 次 |
| order -> product `BatchGetSkuForTrade` | Quote + 提交复验 | 服务端权威价格、状态和商家归属 | 只读，可自动重试 1 次 |
| order -> merchant `BatchGetTradeStatus` | Quote + 提交复验 | 禁止向停用商家下单 | 只读，可自动重试 1 次 |
| order -> inventory `BatchGetStock` | CreateQuote | 只用于「仅剩 N 件」展示 | 只读，可自动重试 1 次，不作为准入依据 |
| order -> address `GetOwnedAddress` | CreateOrder | 生成不可变快照并验证属主 | 事务外调用；超时为系统失败 |
| order -> inventory `ReserveGroup` | CreateOrder | 不拿到 reservation 就不能建单 | 禁止基础设施自动重试；同 reservation_id 显式重试 |
| payment -> order `GetPayableOrderGroup` | CreatePayment | 金额、币种、属主、状态和期限来自 order | 只读，可短重试 1 次 |
| inventory -> order `GetOrderRequestState` | 库存对账 | 只有明确终态才能释放疑似泄漏预占 | UNAVAILABLE 不等于 NOT_FOUND，本轮跳过 |
| compensation worker -> inventory `ReleaseGroup` | 建单失败自愈 | 释放已成功但无人认领的 reservation | 稳定 reservation_id，可持续重试 |

内部 client 直接走服务发现，不经过 edge gateway。通用 client 包统一处理 tracing、deadline、服务发现和只读重试；ReserveGroup 等命令显式关闭自动重试。

## 10. 异步事件目录

### 10.1 统一事件信封

每个事件至少包含：

- `event_id`：全局 UUID；
- `event_type` 和 `schema_version`；
- `producer`；
- `aggregate_id` / `group_no`；
- `occurred_at`；
- `correlation_id` 和 `causation_id`；
- `traceparent`；
- 版本化 payload。

Kafka partition key 固定为 `group_no`，保证同一订单组事件有序。事件不携带完整地址、支付回调原文、证件或其他敏感信息。

### 10.2 事件清单

| 事件 | 发布者 | 消费者 | 业务效果 |
|---|---|---|---|
| `OrderCreated.v1` | order | cart | 按 `(cart_item_id, quoted_quantity)` 核销购物车 |
| `PaymentCaptured.v1` | payment | order | CAS 接受首笔支付；取消订单则发起退款 |
| `InventoryConfirmRequested.v1` | order | inventory | reservation 从 reserved 迁移到 locked |
| `InventoryConfirmed.v1` | inventory | order | 设置 inventory_status=confirmed，产生 Ready 事件 |
| `InventoryConfirmationFailed.v1` | inventory | order | 补占一次；再次失败则退款并告警 |
| `OrderCancelled.v1` | order | inventory | ReleaseGroup，reserved 回到 available |
| `PaymentRefundRequested.v1` | order | payment | 幂等创建 refund task |
| `PaymentRefunded.v1` | payment | order | 更新订单退款事实和审计状态 |
| `OrderReadyForFulfillment.v1` | order | 未来 fulfillment | 唯一履约入口；本阶段允许无消费者 |

`OrderPaid` 可以保留为 order 内部状态，但不能直接触发履约。只有库存确认成功后的 `OrderReadyForFulfillment` 才允许发货。

### 10.3 消费事务

每个消费者必须在同一个本地事务中完成：

1. 插入 `processed_event(consumer, event_id)`；
2. 执行业务状态迁移；
3. 写入由该迁移产生的下游 outbox；
4. 提交。

唯一约束冲突表示已经处理，直接 ACK。基础设施错误返回失败重投。确定性业务失败不能依赖「返回 error 一直重试」，必须发布显式失败事件。

## 11. 数据模型目标

### 11.1 Order

新增 `order_request`：

| 字段 | 用途 |
|---|---|
| `client_token UNIQUE` | quote token 与永久幂等键 |
| `user_id` | 认证属主 |
| `request_hash` | 防止同 token 被用于不同地址/备注 |
| `quote_hash` | 报价审计 |
| `state` | processing/succeeded/failed |
| `business_error` | 终态业务失败的可重放结果 |
| `group_no` / `order_nos` | 第一次认领时生成，所有重试复用 |
| `attempt_no` | fenced 接管代次 |
| `fence_token` / `lease_until` | 阻止旧执行者提交 |

`order_group` 增加：

- status；
- pay_deadline；
- currency；
- client_token UNIQUE；
- accepted_pay_no；
- inventory_status。

新增：

- outbox；
- processed_event；
- compensation_task；
- job_run。

金额字段在 Go 中使用整数分，在 PostgreSQL 中保持精确 Numeric/Decimal，不再经过 float64。

### 11.2 Inventory

库存不变量：

```text
available = on_hand - reserved - locked

Reserve: available -= q, reserved += q
Confirm: reserved  -= q, locked   += q
Release: reserved  -= q, available += q
Deduct:  locked    -= q, on_hand  -= q
```

新增 reservation 头表和明细表：

- 头表唯一键为 `reservation_id`；
- 保存 client_token、attempt_no、payload_hash、state、expire_at；
- 状态为 reserved/confirmed/released/aborted；
- 明细唯一键为 `(reservation_id, sku_id, warehouse_id)`；
- order_no 只用于审计，不承担幂等。

`ReleaseGroup` 对不存在的 reservation 写 aborted 墓碑，以拒绝旧执行者晚到的 ReserveGroup。

撤销 `change_log` 的 `UNIQUE(order_no, change_type)`；只有真实状态迁移才写流水，幂等重放不重复写。

### 11.3 Payment

旧 payments 表整体替换为 `payment_attempt`：

- pay_no；
- group_no；
- payment_request_id UNIQUE；
- channel；
- amount_minor / currency；
- capture_status；
- refund_status；
- channel_trade_no；
- 回调摘要、验签结果和审计时间。

Capture 和 Refund 是两个独立状态轴。captured 是不可逆资金事实，不因订单拒绝该笔支付而改回失败。

双渠道都真实扣款时必须保存两条 captured；由 `order_group.accepted_pay_no` CAS 只接受一笔，其余进入退款。

新增 refund_task、outbox 和 processed_event。

## 12. 核心流程

### 12.1 CreateQuote

```text
购物车入口：cart_item_ids
直接购买入口：sku_id + quantity
        │
        ├─ 并行查询 cart/product/merchant/inventory
        ├─ 校验认证属主、在售状态、商家状态和数量上限
        ├─ 使用整数分计算总价
        └─ Redis 写 order:quote:{token}，TTL 15 分钟
```

单次下单限制：最多 10 个商家、50 个明细行、单行数量不超过 999。

Cart 中的价格只用于展示；quote 和提交复验都以 product 返回的权威价格为准。库存查询只展示，不作为准入依据。

### 12.2 CreateOrder

```text
1. 先查 order_request
   ├─ succeeded/failed：校验属主和 request_hash 后重放原结果
   ├─ processing 且租约有效：ALREADY_IN_PROGRESS
   └─ processing 且租约过期：CAS 接管，attempt+1，写旧 reservation 补偿任务

2. 未终态才读取 quote
3. 事务外复验 product/merchant/address
4. ReserveGroup(reservation_id, payload_hash, items)
5. 开启 order 本地事务
   ├─ order_group/order_main/order_item/order_log
   ├─ OrderCreated outbox
   └─ order_request -> succeeded WHERE fence_token 匹配且租约有效
6. fence 更新零行则整笔回滚
7. 订单事务失败则写 release_required 补偿任务
8. 返回 group_no、子单、金额和 pay_deadline
```

业务失败才把 order_request 置为 failed 并保存可重放错误；超时、下游不可用和数据库异常属于系统失败，不消费 token。

### 12.3 支付与库存确认

```text
CreatePayment(group_no, channel, payment_request_id)
  └─ payment 同步向 order 取权威金额/属主/状态/截止时间

渠道回调
  └─ payment 本地事务：回调审计 + capture CAS + PaymentCaptured outbox

PaymentCaptured
  └─ order inbox + pending_payment -> paid CAS
       ├─ 首笔：accepted_pay_no + InventoryConfirmRequested
       ├─ 订单已取消：PaymentRefundRequested
       └─ 其他已接受支付：PaymentRefundRequested

InventoryConfirmRequested
  └─ inventory ConfirmReservationGroup
       ├─ 成功：InventoryConfirmed
       └─ 终态失败：InventoryConfirmationFailed

InventoryConfirmed
  └─ order inventory_status=confirmed + OrderReadyForFulfillment
```

### 12.4 超时与晚到支付

订单超时任务只在 order 本地事务内执行：

1. CAS `pending_payment -> cancelled`；
2. 写 order_log；
3. 写 `OrderCancelled` outbox；
4. 提交。

ReleaseGroup 由 inventory consumer 异步执行。支付回调与取消任务竞争同一条件状态，先提交者获胜：

- 支付先成功：取消 CAS 零行；
- 取消先成功：支付事实仍保存 captured，但 order 发布退款请求，订单不复活。

## 13. 身份与网络边界

### 13.1 用户身份

- 网关转发前删除全部入站 `x-md-global-*` 头；
- JWT 验证成功后重新注入 user id/name/role；
- 服务永远不信任请求体中的 user_id；
- cart、address、order_request 和 order_group 在数据查询层带属主条件；
- 属主不符返回 PermissionDenied，不通过 NotFound/响应内容泄露资源存在性。

### 13.2 服务身份

内部 RPC 需要可验证的 workload identity。可选实现是 mTLS/workload identity 或签名 service token，但必须满足：

- order 才能调用 inventory reservation 命令；
- payment 才能调用内部 payable order 查询；
- inventory 才能调用 order request 对账查询；
- 用户的 admin/merchant/consumer 角色不能代替服务身份。

### 13.3 Kubernetes 网络

- 10 个业务服务使用 ClusterIP；
- 仅 gateway/ingress 对外；
- NetworkPolicy 精确允许 gateway -> public API；
- order -> cart/product/merchant/address/inventory；
- payment -> order；
- inventory -> order；
- worker -> Kafka/Postgres/必要外部渠道；
- payment 以外的服务默认禁止任意公网 egress。

内部管理接口和 reservation RPC 不应挂到 edge gateway；如确需管理库存，建立独立 InventoryAdminService，而不是把整个 InventoryService 通配授权给 admin。

## 14. 运行时可靠性与观测

### 14.1 Outbox relay

- 使用 `FOR UPDATE SKIP LOCKED` 分批领取；
- Kafka 返回 ACK 后才设置 `published_at`；
- ACK 后、标记前崩溃允许重复发布；
- 记录最老未发布事件年龄，而不只记录行数；
- poison event 进入按 consumer 区分的 DLQ，并立即告警。

### 14.2 Worker 与定时任务指标

至少包括：

- outbox oldest age；
- consumer lag；
- inbox duplicate count；
- DLQ count；
- compensation pending/oldest age；
- reserved reservation oldest age；
- pending payment overdue oldest age；
- refund task pending/oldest age；
- payment amount/signature mismatch 告警；
- order/inventory/payment 对账差异数。

指标标签不能包含 client_token、group_no、pay_no、sku_id 等高基数字段；这些信息进入结构化日志并通过 trace id 检索。

### 14.3 eShop AppHost 思路在本项目的落法

不需要引入 Aspire。应提供一个仓库原生的可执行拓扑入口：

- Compose profile 启动 PostgreSQL 18、Dragonfly、Kafka、服务 API/worker 和假支付渠道；
- `.service-matrix.yaml` 描述 RPC 与事件依赖；
- health/readiness 明确区分 API、worker、relay 和 consumer；
- 启动脚本等待资源可用，而不是只检查容器已创建；
- 一条 smoke 命令完成 quote -> order -> payment -> ready。

## 15. API 兼容策略

现有协议规则禁止删除字段、复用字段号、改变字段类型或改变字段语义。当前 order 和 payment 目标契约与 v1 差异过大，建议：

- 新增 `order.v2.OrderService`；
- 新增 `inventory.v2.InventoryService`；
- 新增 `payment.v2.PaymentService`；
- cart/product/merchant/address 的内部批量查询可使用新增服务或新增 v1 RPC，但不得改变旧方法语义；
- 旧 order v1 CreateOrder 在迁移期保持显式 Unimplemented；
- 旧 inventory Reserve/ReleaseReserve 和 payment v1 标记 deprecated，不映射到新语义；
- CI 加 `buf lint`、生成物一致性和 `buf breaking --against main`。

建议的核心新 RPC：

```text
order.v2.OrderService
  CreateQuote
  CreateOrder
  GetOrder
  ListOrders
  CancelOrder

order.v2.OrderInternalService
  GetOrderRequestState
  GetPayableOrderGroup

inventory.v2.InventoryInternalService
  BatchGetStock
  ReserveGroup
  ConfirmReservationGroup
  ReleaseGroup

payment.v2.PaymentService
  CreatePayment
  GetPaymentStatus
  HandleChannelNotify

cart.v1.CartInternalService
  BatchGetCartItems
  BatchConsumeCartItems

product.v1.ProductInternalService
  BatchGetSkuForTrade

merchant.v1.MerchantInternalService
  BatchGetTradeStatus

address.v1.AddressInternalService
  GetOwnedAddress
```

所有字段在落 proto 前按 `context/team/proto-design.md` 建立校验矩阵：ID 格式、字符串长度、数组上限、数量上限、枚举 defined_only、金额符号和 oneof 互斥条件都必须有来源。

## 16. 分阶段实施路线

### Phase 0：基线收敛与止血（P0）

交付：

- 指定唯一订单设计基线；
- 解决 checkout/settlement 命名冲突；
- 更新进度项中旧 requestId、同步清购物车和 OrderPaid 语义；
- 旧 CreateOrder 返回 CodeUnimplemented；
- 前端不再把空响应解释为成功；
- 确定 API v2 和 migration 工具；
- buf breaking 进入 CI。

主要影响面：

- `docs/design/README.md`；
- `docs/design/order.md`；
- `docs/design/order/checkout.md`；
- `TODO.md`；
- order service；
- consumer checkout；
- backend CI。

退出门槛：

- 仓库中只有一个被索引为当前基线的订单设计；
- 调旧 CreateOrder 必定得到 code 12；
- 前端不会跳转支付页；
- `buf lint` 和 `buf breaking` 真实执行并全绿。

### Phase 1：身份、属主与交易只读前置（P0）

交付：

- 网关剥离伪造身份头；
- address 全 CRUD 带 user_id 条件；
- merchant Approve 带 application_id 和状态条件；
- cart/product/merchant/address 内部批量 RPC；
- 共享整数分 money 包。

退出门槛：

- 他人 token、cart item、address 全部 PermissionDenied 且不泄露内容；
- 批量查询少一条或多一条都整单失败；
- merchant 审批只更新目标行；
- money checked add/mul、溢出和 Numeric 往返测试全绿。

### Phase 2：库存原子内核（P0）

交付：

- 版本化 inventory migration；
- reserved 列和库存不变量；
- reservation 头/明细、状态机、墓碑；
- BatchGetStock、ReserveGroup、ConfirmReservationGroup、ReleaseGroup；
- 对应 sqlc 生成物和真实 PostgreSQL 集成测试。

退出门槛：

- 同 reservation_id 同 hash 重放不重复扣；
- 同 ID 不同 hash 返回 InvalidArgument；
- Release 不存在 reservation 会留下墓碑；
- 晚到 Reserve 不能复活；
- 并发锁顺序稳定；
- 任意操作序列后 `available + reserved + locked == on_hand`。

### Phase 3：Quote 与 order_request（P0）

交付：

- order v2 CreateQuote；
- Redis quote repository；
- order_request migration；
- claim/replay/fenced takeover；
- 下游只读 client 和预算；
- checkout 改为展示服务端报价。

退出门槛：

- Redis 报价全丢时，未成单请求重新报价；
- 已终态 token 不依赖 Redis 仍返回原结果；
- 同 token 不同 request_hash 明确 Conflict；
- processing 租约未过返回 AlreadyInProgress；
- 失约接管只允许一个新执行者成功。

### Phase 4：可靠的未支付订单（P0）

交付：

- CreateOrder 主链；
- 事务外地址/商品/商家复验；
- ReserveGroup；
- order group/main/item/log/outbox/request 单事务；
- compensation_task；
- 真实 CreateOrderResponse。

退出门槛：

- 并发重复提交只产生一单；
- Reserve 成功但响应超时后重试只扣一份；
- 订单事务失败最终释放预占；
- 旧执行者被 fence 拒绝落库；
- 业务失败不产生 group/order；
- 前端只使用服务端金额与真实 group_no。

### Phase 5：Outbox、Kafka、Inbox 与购物车核销（P1）

交付：

- 共享 event envelope 和 eventing 包；
- order/cart/inventory/payment outbox/inbox；
- relay 和 worker runtime；
- Kafka topics、consumer groups 和 DLQ；
- OrderCreated -> cart 数量核销；
- compose/helm/matrix/config 接线。

退出门槛：

- Kafka ACK 后、标记 published 前强制崩溃会重复投递但不重复业务效果；
- consumer 业务状态、inbox、下游 outbox 同事务；
- worker 重启后继续处理积压；
- outbox oldest age 和 DLQ 告警可观察。

### Phase 6：支付事实与 Ready Saga（P1）

交付：

- payment_attempt/refund_task migration；
- CreatePayment 从 order 获取权威金额；
- 渠道验签、回调原文、金额逐分校验；
- PaymentCaptured -> order；
- InventoryConfirmRequested -> inventory；
- InventoryConfirmed/Failed -> order；
- PaymentRefundRequested/Refunded；
- 收银台和支付结果页。

退出门槛：

- 重复和乱序回调被状态机吸收；
- 金额、app_id、seller_id 或签名不符不 ACK 并触发资损告警；
- 双渠道双扣款保留两条 captured，只接受一笔，另一笔退款；
- 取消后晚到支付不复活订单；
- Confirm 失败只补占一次，再失败确定性退款；
- Ready 只在库存确认后产生。

### Phase 7：超时、自愈、对账与生产安全（P1）

交付：

- 订单超时取消 CronJob；
- compensation worker；
- inventory reservation 对账与过期回收；
- payment refund worker 和资金对账；
- ClusterIP、NetworkPolicy 和服务身份；
- 关键指标、看板和告警。

退出门槛：

- 多实例任务并跑无重复取消或释放；
- order 不可达时 inventory 不会错误释放；
- 超龄 reservation、outbox、refund task 均有告警和自愈；
- 业务服务不能从集群外直接访问；
- 内部命令缺合法服务身份时被拒绝。

### Phase 8：可执行拓扑与端到端放行（P1）

交付：

- 本地一键拓扑；
- PostgreSQL 18、Dragonfly、Kafka 和假支付渠道 fixture；
- API/worker 健康检查；
- 浏览器 checkout/payment 流；
- 冻结核心验收集。

退出门槛：

- 14 个正确性用例全部真实执行；
- 浏览器完成「报价 -> 下单 -> 支付 -> Ready」；
- outbox 无超龄积压、补偿/退款任务收敛；
- `go build`、`go vet`、short test、integration test、structcheck、frontend ready 全绿。

## 17. 验收矩阵

以下用例是交易主链的定稿门槛：

1. 同 token 并发重复提交：恰好一单，输家拿到相同响应；
2. 同 token 不同 request_hash：一单成功，另一请求明确 Conflict；
3. ReserveGroup 成功但 RPC 超时：重试返回首次结果，库存只扣一份；
4. 订单事务失败：补偿释放，同 token 新 attempt 可成功；
5. 租约过期后旧执行者复活：落库被 fence 拒绝，晚到 Reserve 被墓碑拒绝；
6. 重复支付回调和 captured 后 close：状态不回退，正常幂等 ACK；
7. 双渠道双扣款：两条 captured、一条 accepted、另一笔自动退款；
8. 取消后晚到成功回调：订单不复活，可靠产生退款请求；
9. Confirm 遇 reservation expired：补占一次，再失败则退款和告警；
10. 多实例定时任务并跑：无重复取消、释放或退款；
11. Relay 在 Kafka ACK 后、标记前崩溃：重复事件由 inbox 去重；
12. Redis quote 全丢：终态重放不受影响，未成单重新报价，无重复订单；
13. 他人 token/cart item/address：全部 PermissionDenied，不泄露资源内容；
14. 任意库存操作序列后：`available + reserved + locked == on_hand`。

还应增加一条浏览器业务流：

```text
选择购物车商品
  -> 服务端报价
  -> 选择属主地址
  -> 创建订单
  -> 跳真实 group_no 收银台
  -> 假渠道支付
  -> 查询支付与订单状态
  -> 最终看到 paid + inventory confirmed
```

## 18. 验证命令与门禁

### 18.1 后端公共门禁

```bash
cd backend
go build ./...
go vet ./...
go test -short ./...
go test -count=1 ./structcheck/...
```

### 18.2 Proto

```bash
cd backend
buf lint
buf generate --template buf.gen.yaml
buf generate --template buf.gen.ts.yaml
buf breaking --against '.git#branch=main'
```

生成后必须检查 Go/TypeScript 生成物一同更新，不能手改生成代码。

### 18.3 SQL 与迁移

每个受影响服务至少执行：

```bash
cd backend/services/<service>
sqlc generate
```

随后用 PostgreSQL 18 Testcontainers 执行不带 `-short` 的 data integration tests，验证 migration、schema、约束、状态机和并发，而不是使用 pgx mock。

### 18.4 网关、拓扑与前端

```bash
cd gateway && go test ./...
cd backend && go test -count=1 ./structcheck/...
cd frontend && pnpm ready
```

最终增加 checkout Playwright 流程并冻结核心验收测试；放行依据是命令真实全绿，不是模型或评审报告自报。

## 19. 从 eShop 借用与拒绝清单

| eShop 模式 | ecommerce 落法 | 是否采用 |
|---|---|---|
| AppHost 可执行拓扑 | matrix + compose profile + health/wait + smoke flow | 采用思想，不引入 Aspire |
| ServiceDefaults | 共享 outbound client/eventing/runtime 默认值 | 采用 |
| Order aggregate 状态迁移 | order/inventory/payment 显式状态机 | 采用 |
| TransactionBehavior | 本域状态 + 日志 + outbox 单事务 | 采用，但用例显式表达 |
| Integration event log | Outbox + relay + Kafka ACK + Inbox | 采用并补完整 |
| 真实依赖 functional fixture | PG18/Kafka/Dragonfly/fake payment 测试拓扑 | 采用 |
| 仅检查库存 | ReserveGroup 全组原子预占 | 拒绝 |
| 支付后才非阻塞扣库存 | 支付后确认 reservation，失败补占或退款 | 拒绝 |
| 模拟支付作为业务实现 | 独立假渠道仅用于测试，生产实现保存资金事实 | 拒绝 |
| handler 失败后 ACK Rabbit 消息 | 基础设施错误重投，确定业务失败发事件 | 拒绝 |
| 无完整 outbox replay worker | relay/积压/重放/DLQ 是首期硬门槛 | 拒绝 |

## 20. 优先级与明确延期

### P0：先让订单不撒谎

- 设计和 API 版本收敛；
- CreateOrder 止血；
- address/merchant 安全修复；
- 批量交易查询；
- money；
- inventory reservation；
- quote/order_request/fence；
- 可靠未支付订单。

### P1：形成可支付且可收敛的交易

- Outbox/Kafka/Inbox；
- payment attempt 与回调；
- paid -> inventory confirmed -> ready；
- late capture refund；
- timeout/compensation/reconciliation；
- 网络和服务身份；
- executable topology 与 E2E。

### P2：交易内核稳定后再扩展

- fulfillment 消费 OrderReadyForFulfillment；
- 金融 settlement；
- marketing/优惠；
- 售后和 ReleaseLocked；
- analytics；
- 更大范围的基础设施代码去复制和共享 runtime 重构。

P2 功能不得通过订阅 `OrderPaid` 绕过库存 Ready 门禁。

## 21. 首条可交付主链的完成定义

一次成功交易最终必须同时满足：

```text
order_request.state = succeeded
order_group.status = paid
order_group.inventory_status = confirmed
order_group.accepted_pay_no != empty
reservation.state = confirmed
payment_attempt.capture_status = captured
购物车按成交数量核销
关键 outbox 无超龄未发布事件
相关 inbox 每个事件只有一个业务效果
OrderReadyForFulfillment 已可靠产生
```

系统还必须证明失败路径能收敛：

- 无订单时不会保留无限期 reservation；
- 已取消订单的 captured payment 最终退款；
- 已付款但库存无法确认时最终补占成功或退款；
- Redis、服务实例或 worker 重启不会改变幂等结果；
- Kafka 重复消息不会产生重复业务效果；
- 对账可以发现并修复漏建补偿/退款任务。

只有同时满足成功事实和失败收敛，才能把交易主链标记为可用。

## 22. 待决策项

以下事项必须在对应阶段编码前定稿，但不阻塞当前路线方向：

1. API 采用统一 v2 package，还是在 v1 中新增不同名称的 RPC；推荐统一 v2，避免旧语义污染。
2. migration 采用 golang-migrate 还是 Atlas；基于现有手写 SQL，golang-migrate 的引入成本更低。
3. Kafka client 与序列化格式；无论选型如何，事件 envelope、版本和 inbox 语义必须先定。
4. worker 是同二进制 role 还是独立 command；推荐同镜像不同 role，部署独立扩缩。
5. 服务身份采用 mTLS/workload identity 还是签名 service token；NetworkPolicy 单独不足以证明调用者身份。
6. Kafka topic 按领域拆分还是按事件拆分；推荐按领域事件流拆分、以 group_no 分区，避免 topic 数量随事件类型失控。
7. 支付渠道第一版使用支付宝 sandbox 还是仅假渠道；推荐先用确定性假渠道完成全部故障测试，再接 sandbox。

这些决策都不改变核心原则：请求事实入库、全组库存原子、资金事实不可篡改、跨域事件可靠传播、失败由补偿和对账收敛。

