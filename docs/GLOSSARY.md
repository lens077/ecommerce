# 项目术语表

> **用途**：统一项目文档、代码评审和需求讨论中的专业术语，帮助开发者快速理解电商领域、系统架构与工程约束。
> **边界**：本文件只解释概念及其在本项目中的语义，不是事实或进度真相源。技术选型看 [`STACK.md`](../STACK.md)，服务拓扑看 [`.service-matrix.yaml`](../.service-matrix.yaml)，设计依据看 [`docs/design/`](design/README.md)，实现进度看 [`TODO.md`](../TODO.md)。
> **维护**：保留产品和技术的官方拼写。状态发生变化时更新对应真相源；只有术语含义或项目语义变化时才更新本文件。

---

## 电商与商品

### UserProfile

- **含义**：用户的通用业务属性，例如头像和昵称，独立于 IAM 账号认证信息。
- **本项目**：归属 Identity Service，并通过 Casdoor `user_id` 关联认证主体。

### Merchant

- **含义**：签署入驻协议的商家法律主体，包含经营信息与结算账户。
- **本项目**：归属 Identity Service；一个 Merchant 可以拥有多个 Store。

### Store

- **含义**：Merchant 开设的实体或线上店铺。
- **本项目**：归属 Identity Service，是 Listing、MerchantOrder 和成员授权关系的重要业务边界。

### MerchantMember

- **含义**：用户在某个 Merchant 或 Store 中的成员关系和职务。
- **本项目**：归属 Identity Service，并作为 OpenFGA 关系授权的业务上下文。

### B2B2C

- **含义**：Business-to-Business-to-Consumer，平台连接商家与消费者的电商模式。平台提供交易、支付和治理能力，商家负责供给商品并履约。
- **本项目**：系统包含消费者、商家和管理员三类角色，并以 `consumer`、`merchant`、`admin` 三个前端应用承载主要操作入口。

### SPU

- **含义**：Standard Product Unit，标准化产品单元。它描述一组共享名称、品牌、类目和介绍的商品。
- **本项目**：SPU 是商品信息的聚合层；可购买的具体规格由 SKU 表示。商品模型设计见 [`docs/design/product/schema.md`](design/product/schema.md)。

### SKU

- **含义**：Stock Keeping Unit，库存量单位。它是可定价、可计数和可交易的最小商品规格，例如某款手机的特定颜色与容量组合。
- **本项目**：价格、库存和订单明细都落到 SKU 粒度；库存通常以 `sku_id + warehouse_id` 唯一定位。

### Product（SPU）

- **含义**：标准商品单元，定义商品名称、描述、品牌和类目等通用属性。
- **本项目**：归属 Catalog Service；可购买的具体规格由 SKU 表示。

### Listing

- **含义**：店铺上架项，绑定 Store 与 SKU，包含特定店铺的售价和上下架状态。
- **本项目**：归属 Catalog Service；库存由 Inventory Service 管理，不属于 Listing。

### 商品快照

- **含义**：交易发生时复制并固定商品名称、价格、规格等信息，避免后续商品修改改变历史交易含义。
- **本项目**：跨服务数据只保存 ID 与必要快照，不做跨库 JOIN；订单以报价快照作为用户本次确认的交易内容。

### 报价（quote）

- **含义**：结算页由服务端实时计算的商品明细、单价、总价和币种快照。
- **本项目**：报价短期存于 Redis，并由 `client_token` 标识。提交订单时服务端重新校验商品价格与状态；报价丢失只要求重新报价，不得导致订单事实丢失。

### 拆单

- **含义**：把一次结算请求按商家、仓库或履约条件拆成多个业务子单，同时保留一个聚合单号统一支付和展示。
- **本项目**：订单按 `merchant_id` 分组生成子单，由 `group_no` 聚合；当前设计采用「整单成功或整单失败」，不允许部分商家成交。

### 履约（fulfillment）

- **含义**：订单支付后，从备货、出库、发货到交付完成的业务过程。
- **本项目**：库存确认成功后的 `OrderReadyForFulfillment` 才是履约入口，不能仅凭支付成功事件启动履约。

### 对账

- **含义**：比较两个权威记录或业务记录，发现状态、金额或数量不一致，并触发修复或告警。
- **本项目**：支付、订单和库存分别保存本域事实，跨域异常依靠事件重试与定时对账收敛。

## 库存与交易一致性

### OrderGroup

- **含义**：用户一次 Checkout 产生的总订单，包含一个或多个 MerchantOrder。
- **本项目**：归属 Order Service，是跨商家拆单后的展示与支付聚合根。

### MerchantOrder

- **含义**：归属于单一 Merchant 的子订单，是履约和结算的基本单元。
- **本项目**：归属 Order Service，并关联 Merchant 与 Store。

### OrderLine

- **含义**：订单明细行，固化下单时刻的 SKU 信息、快照单价与分摊优惠。
- **本项目**：归属 Order Service，创建后作为历史交易快照保存。

### Saga Manager

- **含义**：Order Service 内置的分布式事务编排器，显式调度主流程、状态迁移和补偿动作。
- **本项目**：负责 Checkout、价格快照、库存预占和支付意图创建等核心交易链路；派生与副作用链路通过 Kafka 编舞。

### PaymentIntent

- **含义**：一次交易支付的声明，跟踪整个支付生命周期。
- **本项目**：归属 Payment Service，并关联订单、金额、币种和支付状态。

### PaymentAttempt

- **含义**：针对某个 PaymentIntent 发起的一次具体支付尝试。
- **本项目**：归属 Payment Service；通道失败后可以产生新的 PaymentAttempt，但幂等回调只处理一次。

### Authorization

- **含义**：支付预授权，记录获准冻结或后续捕获的金额。
- **本项目**：归属 Payment Service；Capture 总额不得超过 Authorization 总额。

### Capture

- **含义**：对已授权款项执行实际扣款。
- **本项目**：归属 Payment Service；Refund 总额不得超过已 Capture 金额。

### Refund

- **含义**：把已 Capture 的款项退还给付款方。
- **本项目**：归属 Payment Service，并受支付幂等与金额不变量约束。

### StockItem

- **含义**：某个 SKU 在特定仓库或店铺的库存汇总记录。
- **本项目**：归属 Inventory Service，维护 `available`、`reserved` 和 `on_hand` 等数量。

### StockLedger

- **含义**：记录每次预占、扣减与释放的库存变动流水。
- **本项目**：归属 Inventory Service，是库存变动的绝对真相源。

### Reservation

- **含义**：关联订单与 SKU 的库存预占记录，包含预占数量和到期时间戳。
- **本项目**：归属 Inventory Service；防超卖依靠数据库单条原子语句与状态机不变量，不依赖先查后改。

### FulfillmentOrder

- **含义**：对应已支付 MerchantOrder 的履约任务。
- **本项目**：归属独立的 Fulfillment Service，管理备货、发货与交付状态。

### Shipment

- **含义**：物流发货单，包含物流单号、承运商和包裹明细。
- **本项目**：归属 Fulfillment Service，发货数量不得超过订单中对应 SKU 的数量。

### TrackingEvent

- **含义**：物流供应商回调或主动查询产生的跟踪事件。
- **本项目**：归属 Fulfillment Service，用于推进 Shipment 与 FulfillmentOrder 状态。

### 在手库存（on-hand）

- **含义**：仓库实际持有、尚未正式扣减的商品数量。
- **本项目**：库存不变量为 `available + reserved + locked = on_hand`；发货完成后才同时减少 `locked` 与 `on_hand`。

### 可用库存（available）

- **含义**：当前仍可被新订单预占的库存数量。
- **本项目**：查询结果只用于展示，是否允许下单以数据库事务中的原子预占结果为准，避免检查与扣减之间发生竞态。

### 库存预占（reservation）

- **含义**：订单创建后、支付完成前暂时占用库存，防止同一库存被其他订单售出。
- **本项目**：`ReserveGroup` 在一个库存事务中原子预占整组 SKU；相同 `reservation_id` 的重试必须返回首次结果。

### 已锁定库存（locked）

- **含义**：订单已支付、等待发货扣减的库存。
- **本项目**：`ConfirmReservationGroup` 把库存从 `reserved` 转为 `locked`；发货完成时再转为已扣减。

### 墓碑（tombstone）

- **含义**：用终态记录表示某个资源已经被取消或禁止创建，防止迟到请求重新建立它。
- **本项目**：`ReleaseGroup` 对尚不存在的库存预占写入 `aborted` 记录，使迟到的 `ReserveGroup` 无法复活旧预占。

### 幂等

- **含义**：同一业务请求执行一次或重复执行多次，最终业务效果一致。
- **本项目**：改变状态的调用都应携带稳定幂等键，并由唯一约束、条件更新或吸收终态保证。幂等重放通常返回首次结果，而不是简单拒绝重复请求。

### CAS

- **含义**：Compare-And-Swap，先比较当前值或状态是否符合预期，再执行更新；不符合时更新失败。
- **本项目**：订单状态迁移、支付接受和租约接管使用数据库条件更新实现 CAS，解决取消、支付回调和多执行者之间的竞态。

### 围栏令牌（fencing token）

- **含义**：每次资源租约被认领或接管时生成的单调新凭证。旧执行者即使稍后恢复，也不能提交结果。
- **本项目**：`order_request.fence_token` 参与订单最终事务的条件更新，阻止失去租约的旧下单执行者落库。

### 租约（lease）

- **含义**：在有限时间内授予执行者处理资源的权利；过期后其他执行者可以接管。
- **本项目**：下单请求处于 `processing` 时携带 `lease_until`。只有租约过期后才能以新 attempt 和新围栏令牌接管。

### 补偿

- **含义**：分布式流程的前序步骤已成功、后续步骤失败时，通过反向业务动作恢复可接受状态。
- **本项目**：例如订单落库失败但库存已预占时，由持久化 `compensation_task` 重试释放库存，而不是依赖进程内回调。

### TCC

- **含义**：Try-Confirm-Cancel，一种分布式事务模式。Try 预留资源，Confirm 确认使用，Cancel 释放资源。
- **本项目**：库存的 `ReserveGroup`、`ConfirmReservationGroup`、`ReleaseGroup` 分别对应 Try、Confirm、Cancel。

### Saga

- **含义**：把跨服务长事务拆成一系列本地事务，通过事件推进，并在失败时执行补偿。
- **本项目**：采用中心化编排与去中心化编舞的混合模型。Order Service 内置 Saga Manager，显式编排 Checkout、价格快照、库存预占与支付意图创建等核心链路；搜索投影、通知、分析和对账等副作用由 Kafka 领域事件驱动。

### 编舞式 Saga（choreography）

- **含义**：参与服务根据事件自主决定下一步，不由中央编排器逐步调用。
- **本项目**：编舞用于搜索投影、通知、分析和对账等可延迟的副作用链路；服务通过 Kafka 领域事件推进本地处理，并具备 Inbox 幂等消费、显式补偿、超时任务、DLQ 和链路追踪。核心交易链路由 Order Service 内置 Saga Manager 编排。

### 最终一致性

- **含义**：跨服务状态允许短暂不一致，但在没有新变更且重试、补偿和对账正常运行时，最终收敛到一致结果。
- **本项目**：本地事务保证单服务内一致，Outbox、至少一次投递、Inbox 和对账负责跨服务收敛。

### TOCTOU

- **含义**：Time-of-check to time-of-use，检查条件与实际使用资源之间存在时间窗口，条件可能在窗口内失效。
- **本项目**：下单前查询到「有库存」不代表预占时仍有库存，因此库存查询只用于展示，准入结果以 `ReserveGroup` 的原子更新为准。

## 事件与消息

### 领域事件

- **含义**：描述领域内已经发生且值得其他组件感知的事实，例如订单已创建、支付已捕获或库存已确认。
- **本项目**：事件用于跨服务异步协作。设计文档中的事件不等于已落地能力，当前状态以 [`TODO.md`](../TODO.md) 和 [`.service-matrix.yaml`](../.service-matrix.yaml) 为准。

### Inbox / Outbox

- **含义**：基于数据库事务的消息收发记录表，用于保证事件至少一次投递和幂等消费。
- **本项目**：Outbox 与业务变更写入同一 PostgreSQL 本地事务，由 Relay 投递到外部非 K8s Kafka 集群；Inbox 以 `(consumer_group, event_id)` 唯一约束识别重复事件，并与本地业务更新放在同一事务中。

### Outbox

- **含义**：在业务数据库中保存待发布事件的表。业务变更与事件写入同一本地事务，再由 relay 异步投递。
- **本项目**：Outbox 解决「业务落库成功但消息未发送」的双写问题；Kafka Broker 返回 `acks=all` 后才标记 `published_at`。

### Inbox

- **含义**：消费者记录已处理消息的表或等价机制，用于识别重复投递。
- **本项目**：`inbox_events` 以 `(consumer_group, event_id)` 唯一约束去重，并与业务更新、下游 Outbox 写入放在同一本地事务中。

### Relay

- **含义**：扫描 Outbox、发布事件并回写发布状态的独立进程或任务。
- **本项目**：Relay 收到 Kafka Broker 的 `acks=all` 确认后再标记事件已发布；确认后、标记前崩溃会导致重复投递，因此消费者必须通过 Inbox 保证幂等。连续失败超过规定次数的事件转入 DLQ 并触发告警。

### 至少一次投递（at-least-once delivery）

- **含义**：已确认事件不会无声丢失，但同一事件可能被投递多次。
- **本项目**：Outbox 与 relay 采用该语义，重复消息由 Inbox 和业务幂等规则吸收。

### 消费滞后（consumer lag）

- **含义**：消费者当前处理位置落后于消息生产位置的程度，可用消息数或时间表示。
- **本项目**：消费 lag、Outbox 未发布事件的最老年龄和死信数量都应纳入告警。

### 死信（dead letter）

- **含义**：消息经过规定次数重试仍无法成功处理后，被转移到独立存储或队列，等待人工或专门任务处理。
- **本项目**：死信用于暴露无法自动恢复的事件，不能作为静默丢弃消息的出口。

## 架构与服务边界

### 单仓（single-repo）

- **含义**：多个组件或服务的源代码存放在同一个 Git 仓库中。
- **本项目**：存量 10 个后端服务（user、search、behavior、product、cart、address、order、inventory、merchant、payment）、前端 workspace 和部署清单位于同仓；网关与配置中心已拆至独立仓库。存量服务是迁移起点，目标限界上下文为 identity、catalog、cart、order、payment、inventory、fulfillment、notification，另有 search-projection、analytics 编舞消费者。

### Monorepo

- **含义**：在一个仓库或工作区内管理多个应用与共享包，并统一依赖和工具链。
- **本项目**：`frontend/` 是 pnpm workspace，包含 4 个应用和 9 个共享包。

### DDD

- **含义**：Domain-Driven Design，领域驱动设计。它以业务领域模型、限界上下文和统一语言指导系统边界划分。
- **本项目**：微服务边界按电商领域职责划分；服务内部由 biz 层承载领域模型和 UseCase。

### 限界上下文（bounded context）

- **含义**：一套领域模型和术语保持一致的明确边界。同一词在不同上下文中可以具有不同模型和约束。
- **本项目**：订单、支付、库存等服务各自维护本域事实，不跨 schema 建外键或跨库 JOIN。

### 防腐层（anti-corruption layer）

- **含义**：在系统边界转换外部模型与内部领域模型，避免外部结构直接污染本域设计。
- **本项目**：service 层负责 Proto 与 biz 模型转换；前端 `api/` 层负责 RPC DTO 与页面领域模型转换。

### CQRS

- **含义**：Command Query Responsibility Segregation，命令查询职责分离。写模型负责改变事实，读模型针对查询优化。
- **本项目**：PostgreSQL 保存商品权威数据，搜索引擎保存可重建的查询视图；商品变更应异步更新搜索索引。

### BFF

- **含义**：Backend for Frontend，为特定前端形态提供聚合、裁剪和协议适配的后端层。
- **本项目**：自建网关目前集中处理鉴权、路由和服务发现；转向 BFF 属架构演进规划，不应表述为已完成。

### API 网关

- **含义**：客户端访问后端服务的统一入口，集中处理路由、认证、授权、限流和协议转换等横切能力。
- **本项目**：网关执行 Casdoor 有状态 Session 校验与 OpenFGA 关系授权，并向下游注入可信身份元数据。Session 存储于独立的 Dragonfly Session Store，登出即删除并立即失效；完全废弃 JWT，不保留 JWT 兼容或双重鉴权路径。

### 服务发现

- **含义**：调用方按逻辑服务名查找当前可用实例地址的机制。
- **本项目**：服务注册名与依赖关系以 [`.service-matrix.yaml`](../.service-matrix.yaml) 为准；`depends_on` 表示已接线，`depends_on_planned` 表示仅有设计要求。

### Bootstrap 配置

- **含义**：服务启动和运行所需的完整业务配置对象。
- **本项目**：10 个业务服务的 `Bootstrap` schema 由 `conf.proto` 定义，并从 Config Center 获取；Consul KV 不再保存 Bootstrap。

### 配置自举（bootstrap problem）

- **含义**：系统需要先获得一小部分定位信息，才能连接配置中心并加载完整配置。
- **本项目**：`CONFIG_SOURCE_FILE` 指向本地 selector；selector 只包含 Config Center 的地址、命名空间、环境、键和访问令牌。

### 热更新

- **含义**：进程不重启即可加载并应用新配置。
- **本项目**：数据连接池、Redis 客户端和日志级别可按设计热更新；`server`、`discovery`、`observability` 变更明确要求重启。

### 控制面与数据面

- **含义**：控制面负责配置、策略和资源编排；数据面负责承载真实业务请求或数据流量。
- **本项目**：Config Center 是配置控制面；网关和业务服务承载请求数据面。

## API 与后端工程

### IDL

- **含义**：Interface Definition Language，接口定义语言，用机器可读格式描述服务、消息和字段。
- **本项目**：使用 Protobuf 定义前后端 API 契约，并通过 Buf 生成 Go 与 TypeScript 代码。

### Protobuf

- **含义**：Protocol Buffers，结构化数据的接口定义与序列化格式。
- **本项目**：Proto 是 API 契约真相源；字段必须具备 `buf.validate` 结构约束，兼容性变更不得复用字段号或改变既有语义。

### Buf

- **含义**：围绕 Protobuf 提供 lint、代码生成、依赖管理和破坏性变更检查的工具链。
- **本项目**：Buf 统一生成 Go 与 TypeScript 契约代码；配置见 `backend/buf.yaml` 和 `backend/buf.gen*.yaml`。

### Connect RPC

- **含义**：基于 HTTP 的 RPC 协议和框架，可兼容 Connect、gRPC 与 gRPC-Web 客户端。
- **本项目**：浏览器通过 Connect-Web 调用网关，后端通过 Connect-go 暴露服务；开发环境支持 HTTP/2 h2c。

### DTO

- **含义**：Data Transfer Object，用于跨进程或分层边界传递数据的结构，不等同于领域模型。
- **本项目**：Proto 消息属于 RPC DTO，只能在 service 边界转换，不能直接进入 biz 模型或前端 store。

### UseCase

- **含义**：封装一个业务用例的应用服务，负责组织领域规则和仓储接口。
- **本项目**：UseCase 位于 `internal/biz`，依赖由 biz 定义的 Repo 接口，不直接依赖 data 或 Proto 生成代码。

### Repo（Repository）

- **含义**：隔离领域逻辑与持久化实现的仓储接口。
- **本项目**：biz 定义 Repo 接口，data 实现 PostgreSQL、Redis、搜索引擎或第三方服务访问。

### 依赖注入（dependency injection）

- **含义**：由外部容器构造对象并提供其依赖，而不是对象内部自行创建依赖。
- **本项目**：后端使用 `go.uber.org/fx` 装配模块，并用 `fx.ValidateApp` 静态检查依赖图。

### 拦截器（interceptor）

- **含义**：在 RPC 调用前后统一执行验证、日志、追踪和错误处理的中间件。
- **本项目**：服务端拦截器链包含 OpenTelemetry、日志和 Protovalidate；认证授权主要集中在网关。

### h2c

- **含义**：HTTP/2 Cleartext，在不启用 TLS 的连接上使用 HTTP/2。
- **本项目**：后端服务通过 `h2c.NewHandler` 同时接受 HTTP/1.1 与明文 HTTP/2；生产入口的 TLS 由网关或基础设施终止。

### sqlc

- **含义**：根据 SQL 查询和 schema 生成类型安全 Go 数据访问代码的工具。
- **本项目**：DDL 和查询 SQL 是输入，`internal/data/models` 是生成物，禁止手工修改。

### 游标分页（keyset pagination）

- **含义**：使用上一页最后一条记录的排序键继续查询，而不是使用 `OFFSET` 跳过记录。
- **本项目**：商品列表采用游标分页，以降低深分页成本，并减少翻页期间重复或漏项。

### Upsert

- **含义**：记录不存在时插入，已存在时更新的单次数据库操作。
- **本项目**：PostgreSQL 使用 `INSERT ... ON CONFLICT ... DO UPDATE`，冲突目标必须有明确的 `UNIQUE` 约束。

### 业务不变量

- **含义**：任何合法状态和操作序列都必须始终满足的业务约束。
- **本项目**：例如库存必须满足 `available + reserved + locked = on_hand`。结构校验由 Protovalidate 执行，业务不变量必须由 biz 和数据库事务共同保证。

## 身份与权限

### 认证（authentication）

- **含义**：确认调用者是谁。
- **本项目**：Casdoor 作为身份提供方并管理有状态 Session；网关通过独立的 Dragonfly Session Store 校验 Session，认证通过后把可信用户身份注入下游元数据。登出时删除 Session，使其立即失效。

### 授权（authorization）

- **含义**：判断已确认身份是否允许执行某个操作。
- **本项目**：网关通过 OpenFGA 按「主体—关系—资源」执行对象级授权，默认拒绝未显式允许的操作；存量 Casbin RBAC 仅在迁移期保留。

### IdP

- **含义**：Identity Provider，身份提供方，负责登录、用户身份和令牌签发。
- **本项目**：Casdoor 是 IdP，提供 OAuth 2.0/OIDC 登录并管理有状态 Session；业务访问不使用 JWT 鉴权。

### OAuth 2.0

- **含义**：授权框架，允许客户端在用户授权后获取访问资源的令牌。
- **本项目**：前端通过 Casdoor 完成登录授权；OAuth 2.0 不等同于身份认证，身份层语义由 OIDC 补充。

### OIDC

- **含义**：OpenID Connect，建立在 OAuth 2.0 之上的身份层协议，提供标准化用户身份信息。
- **本项目**：Casdoor 通过 OIDC 为前端提供登录与身份声明。

### JWT

- **含义**：JSON Web Token，一种带签名的紧凑令牌格式，常用于传递身份和授权声明。
- **本项目**：JWT 鉴权已被 [`TECH.md`](TECH.md) 明确废弃；网关只允许 Casdoor 有状态 Session 鉴权，不保留 JWT 兼容或双重鉴权路径。

### RBAC

- **含义**：Role-Based Access Control，基于角色分配权限的访问控制模型。
- **本项目**：RBAC 仅用于 Casdoor 的粗粒度角色（admin、merchant、customer）；对象级业务授权统一由 OpenFGA 关系模型判定。存量 Casbin RBAC 处于迁移期，不作为目标授权路径。

### Casbin

- **含义**：通用访问控制策略引擎，可按模型和策略文件执行权限判断。
- **本项目**：Casbin 是存量迁移期组件；目标授权路径为 OpenFGA 关系授权，不保留 Casbin 与 OpenFGA 的双重鉴权路径。

### Casdoor

- **含义**：Go 编写的开源身份提供方（IdP），提供登录界面、用户目录、OAuth 2.0/OIDC 协议端点与 JWT 签发。
- **本项目**：唯一 IdP（`casdoor.apikv.com`，RS256、`kid=lens`）；2026-08-20 定稿收编进集群，迁移方案与 JWKS diff==0 门禁见 [`docs/技术栈选型对抗/对抗审阅表-第3轮.md`](技术栈选型对抗/对抗审阅表-第3轮.md) R3-A。

**后续决策覆盖（2026-08-28）**：本条已被 [`TECH.md`](TECH.md) 覆盖：Casdoor 作为 IAM 管理有状态 Session，Session 存储于独立的 Dragonfly Session Store；系统完全废弃 JWT 鉴权，不保留兼容路径。

### ReBAC 与 Zanzibar

- **含义**：Relationship-Based Access Control，把授权表达为「主体—关系—资源」元组构成的图，判定即图上的可达性查询；源自 Google Zanzibar 论文（Drive/Docs 的全局授权系统）。相比 RBAC 的「角色 → 权限包」，ReBAC 能回答**资源实例级**问题（「这个用户对这一件资源是否有这一种关系」）。
- **本项目**：OpenFGA 是对象级授权的唯一真相源，统一建模用户、商家、店铺、订单等资源关系；网关在 Session 校验后调用 OpenFGA Check API 判定访问权限。

### OpenFGA

- **含义**：CNCF incubating 的细粒度授权服务（Go，Zanzibar 系）：应用把关系写成元组存入，运行时以 `check(主体, 关系, 资源)` 查询判定。
- **本项目**：OpenFGA 是对象级授权真相源；网关在 Casdoor 有状态 Session 校验后调用 Check API，按用户、商家、店铺和订单等资源关系判定权限。授权异常时默认拒绝，不得扩大授权集。落地进度见 [`TODO.md`](../TODO.md) ⑪。

### 影子双跑（shadow dual-run）

- **含义**：新旧两套判定逻辑并行执行同一真实流量：旧逻辑继续拍板生效，新逻辑只记录结果并与旧逻辑比对差异；差异收敛到零后才让新逻辑转为强制。目的：用真实流量验证新系统的正确性，验证期零用户风险。
- **本项目**：影子双跑仅用于存量 Casbin 向 OpenFGA 迁移期间验证判定差异；目标态只保留 Casdoor 有状态 Session 与 OpenFGA 授权，不形成长期双重鉴权路径。

### fail-open 与 fail-close

- **含义**：依赖组件故障时的两种默认姿态：fail-open=放行（可用性优先），fail-close=拒绝（安全优先）。授权系统的失败策略必须逐接口显式选择，不能全局一刀切。
- **本项目**：T5 条款化为「**降级只准缩小授权集，不准扩大**」：写/资金/管理操作 fail-close；读单资源 owner==subject 本地短路、其余 fail-close；列表/推荐 fail-open 但降为「仅本人+公开」；公开读 fail-open（对抗第 2 轮 T5）。

### JWKS（JSON Web Key Set）

- **含义**：以 JSON 发布的公钥集合端点（常见路径 `/.well-known/…` 或 `/api/certs`），每把键带 `kid`（key id）；验签方按 JWT 头部的 `kid` 取对应公钥。它是「签发方换钥/多钥并存」与「验签方自动跟上」之间的标准接口。
- **本项目**：Casdoor 的 JWKS 在 `/api/certs`（`kid=lens`）；网关验签公钥另存 Config Center `gateway` ns 的 `secrets/public.pem`。casdoor 收编迁移以「迁移前后 JWKS **diff==0**」为硬门禁——公钥逐字节不变，存量 token 与网关验签才能双双存活（R3-A）。

### trust-manager

- **含义**：cert-manager 的配套项目：把 CA 证书打包为 Bundle 资源并自动分发到各命名空间的 ConfigMap/Secret——cert-manager 负责「签发」那一半，trust-manager 标准化「信任分发」这一半。
- **本项目**：用户拍板采纳，正面解决 library chart 整卷挂载 `/etc/ssl/certs` 遮蔽系统 CA 的坑；⓪ 部署测试已实测 Bundle 自动分发到新命名空间。

### OpenBao

- **含义**：秘密管理服务器——HashiCorp Vault 改 BSL 许可后的 Linux 基金会延续分叉（MPL-2.0）：集中存取密码/密钥/令牌，带访问控制与审计；重启后需解封（unseal）才可用。
- **本项目**：替代 Vault 的定稿选型，与 ESO 组合；⓪ 已测 init→unseal→kv-v2→只读 token 全链路，**每次重启需手工解封**为已知运维点。属延续型社区分叉（判例见「社区分叉」条）。

### 密封与解封（seal / unseal）

- **含义**：Vault/OpenBao 共同的核心安全设计：磁盘数据用数据密钥加密，数据密钥又被根密钥加密（信封加密），而根密钥**只存在于内存**。进程启动或重启后内存为空，服务处于「密封」态——能连上存储但解不开任何数据，此时除 status/unseal 等极少数端点外 **API 读写全部拒绝**（既取不出值，也写不进新值）；解封 = 重建根密钥。默认走 Shamir 秘密分片：init 时把解封材料拆成 N 份（默认 5），凑齐阈值 K 份（默认 3）才能解封。设计目的：偷走磁盘、快照或备份拿不到明文，重启即回到保险箱锁死状态。
- **免手工方案**：两家同样支持 auto-unseal——云 KMS（AWS/GCP/Azure）托管解封密钥，或 transit 模式由另一个 Vault/OpenBao 实例代管；代价是引入一个必须先活着的外部依赖。
- **本项目**：手工解封（`examples/unseal.sh`）是当前形态。爆炸半径有限：ESO 已物化进 K8s Secret 的值不受密封影响，密封期只是无法同步新值/轮换；应急路径走 SOPS。宿主 Mac 睡眠致节点重启的历史意味着密封事件必然发生，sealed 状态需纳入监控。

- **含义**：Kubernetes operator：按 ExternalSecret 声明把外部秘密源（OpenBao、云 KMS 等）中的值同步为集群内 Secret，并负责刷新。
- **本项目**：与 OpenBao 组成凭据链（仓库只存引用不存明文，AGENTS 硬规则 4）；2025 维护者危机已收尾，部署锁 digest 防再发。整改次序见 [`TODO.md`](../TODO.md) ②。

### SOPS

- **含义**：文件级加密工具：只加密 YAML/JSON 的值部分（键名保持可读），密文可安全入 Git；用 age 或 KMS 解密，ksops 供 GitOps 渲染时解密。
- **本项目**：管 bootstrap 静态密文——解决「金库还没起来时，金库的钥匙放哪」的自举问题；兼作 ESO/OpenBao 故障时的应急路径。

### 匿名路径

- **含义**：不要求登录即可访问的接口路径。
- **本项目**：登录、公开搜索、商品详情、支付回调和匿名行为采集等路径由网关显式列为免 Session 鉴权路径；其余路径统一执行 Casdoor 有状态 Session 校验与 OpenFGA 授权。

## 数据、缓存与搜索

### 真相源与派生视图（source of truth / derived view）

- **含义**：真相源是权威数据落点；派生视图是从真相源计算出的副本，可丢弃并重建。
- **本项目**：PostgreSQL 是 OLTP 唯一真相源；订单、支付、库存等限界上下文分别维护本域事实。Elasticsearch 搜索索引、Dragonfly 缓存和分析数据均为可丢弃、可重建的派生视图。

### Cache-Aside

- **含义**：应用先读缓存，未命中时读数据库并回填；写入时更新或删除缓存。
- **本项目**：Dragonfly 按故障域分为 Session、业务 Cache 和限流实例，严禁混用；Session 实例启用 `noeviction` 与持久化，业务 Cache 实例启用 `allkeys-lru`，限流实例独立。缓存不能承载唯一业务事实，删除或驱逐后必须能够恢复或安全降级。

### TTL

- **含义**：Time to Live，数据在自动过期前的存活时长。
- **本项目**：报价、缓存、租约和库存预占分别具有不同 TTL 或截止时间，不能混用同一生命周期。

### 缓存穿透

- **含义**：大量查询不存在的数据，导致缓存持续未命中并把压力传到数据库。
- **本项目**：可根据数据特征使用空值缓存、参数校验或布隆过滤器；是否采用应以具体服务设计为准。

### 缓存击穿

- **含义**：热点键失效时大量并发请求同时访问后端存储。
- **本项目**：可使用单飞、互斥重建或逻辑过期等方式控制回源并发。

### 缓存雪崩

- **含义**：大量缓存键在相近时间失效或缓存服务整体不可用，造成后端流量骤增。
- **本项目**：通过过期时间抖动、限流、降级和容量隔离降低风险。

### OLTP 与 OLAP

- **含义**：OLTP（联机事务处理）指高频小事务的行级读写，如下单、扣库存；OLAP（联机分析处理）指对大量历史数据的扫描聚合，如漏斗、留存、报表。两者访问模式相反，引擎设计也相反；大数据量下同库混跑会互相干扰（分析扫描抢走事务库的缓存与 IO）。
- **本项目**：PG 承载 OLTP；OLAP 位规划给 ClickHouse（TECH-RADAR §3.2），当前量级下埋点分析由 PG 兼任，落地状态以 [`TODO.md`](../TODO.md) ⑫ 为准。

### 列存（columnar storage）

- **含义**：按列而非按行组织数据。聚合查询只读涉及的列，同列数据同质因此压缩率高，大表扫描比行存快一到两个数量级；代价是单行点查与频繁更新变差。是 OLAP 引擎的基础设计。
- **本项目**：ClickHouse 即列存；PG 是行存，分工见「OLTP 与 OLAP」条。

### ClickHouse

- **含义**：C++ 编写的开源列存 OLAP 数据库（Apache-2.0），擅长海量事件与日志的实时聚合分析；单机即可用，官方建议内存充裕（低配运行需手动压各类缓存上限）。
- **本项目**：§3.2 用户拍板单节点，定位=埋点分析存储（断代可重放故单点可接受）；2026-08-20 部署测试验证过（SQL 通、内存帽 1.2G）；2026-08-20 复审改判「触发式缓上」——不常驻，触发条件与拉起形态见 [`TODO.md`](../TODO.md) ⑫。

### 倒排索引（inverted index）

- **含义**：保存「词项 → 文档列表」映射的检索结构，查询时无需逐篇扫描文档。
- **本项目**：Elasticsearch 与 Meilisearch 的关键词检索都使用倒排索引族结构；项目通过 searchable、filterable 和 sortable 属性影响索引构建。

### 全文检索

- **含义**：对文本分词、建立索引，并按关键词、相关度和语言规则查找文档。
- **本项目**：商品名称和描述由搜索服务查询；搜索引擎索引是 PostgreSQL 商品数据的派生视图。

### 分词器（analyzer）

- **含义**：把文本标准化并切分为可索引词项的组件，通常包含字符过滤、分词和词项过滤步骤。
- **本项目**：存量搜索使用 Meilisearch；按 [`TECH.md`](TECH.md) 定稿迁回 Elasticsearch 后，中文分词行为以 Elasticsearch 索引配置和验收结果为准。

### Facet 过滤（faceted search）

- **含义**：按类目、品牌、价格或属性等维度筛选，并同时返回各取值的命中计数。
- **本项目**：商品搜索页的筛选栏依赖该能力；存量 Meilisearch 通过 `filterableAttributes` 与 facets 查询提供支持，目标 Elasticsearch 只读投影通过聚合查询提供支持。

### typo 容错（typo tolerance）

- **含义**：查询词存在少量插入、删除、替换或相邻字符错误时，仍能召回预期结果。
- **本项目**：主要服务于英文品牌、型号和拼音混输场景；容错阈值由搜索索引配置控制。

### Embedding

- **含义**：模型把文本、图片等内容映射为高维数字向量，使语义相近的内容在向量空间中距离更近。
- **本项目**：Embedding 计划以 pgvector 为权威存储，并可提供给混合搜索使用；生成方案与落地状态看相关设计和 `TODO.md`。

### 混合搜索（hybrid search）

- **含义**：融合关键词检索与向量语义检索的召回或排序方式。
- **本项目**：存量 Meilisearch 作为召回展示层，向量由外部生成；按 [`TECH.md`](TECH.md) 定稿迁回 Elasticsearch 后，混合搜索隐藏于 `SearchCatalog` 接口后。该能力的实际启用状态以 `TODO.md` 为准。

### HNSW

- **含义**：Hierarchical Navigable Small World，一种基于分层图的近似最近邻索引，查询快但内存和构建成本较高。
- **本项目**：pgvector 支持 HNSW；当向量索引明显挤压交易数据库资源时，才考虑迁移到独立向量数据库。

### pgvector

- **含义**：PostgreSQL 的向量类型与相似度检索扩展，支持余弦距离、内积、欧氏距离和近似索引。
- **本项目**：作为权威 Embedding 存储的既定方向；是否已经启用以 `STACK.md` 和 `TODO.md` 为准。

## 可观测性与可靠性

### 可观测性

- **含义**：通过系统输出推断其内部状态的能力，通常由指标、日志和链路追踪组成。
- **本项目**：应用经 OpenTelemetry 输出遥测数据，统一通过外置 OTel Collector 管道处理，再分流至 VictoriaMetrics、VictoriaLogs 和 VictoriaTraces；Grafana 用于统一查看。方法论与指标基线见 [`docs/observability/OBSERVABILITY.md`](observability/OBSERVABILITY.md)。

### OpenTelemetry（OTel）

- **含义**：统一生成、传播和导出 trace、metric 与 log 的开放标准及 SDK 生态。
- **本项目**：后端通过 OTLP-HTTP 导出遥测数据；前端 Web Vitals 经 `telemetry.v1` 转为 OTel 指标。

### Trace

- **含义**：一次请求跨进程、跨服务执行路径的完整记录，由多个 Span 组成。
- **本项目**：同步 RPC 与 Kafka 异步事件都应传播 `trace_id`，经外置 OTel Collector 管道处理后写入 VictoriaTraces，以关联下单、支付和库存处理。

### Span

- **含义**：Trace 中一个有起止时间的操作单元，例如一次 RPC、SQL 查询或消息消费。
- **本项目**：服务停止时必须 flush OTel，避免尚未导出的 Span 丢失。

### Metric

- **含义**：随时间聚合的数值观测，例如请求数、错误率、延迟和队列长度。
- **本项目**：VictoriaMetrics 保存指标；服务至少应覆盖请求 RED 指标和关键业务滞留年龄。

### Log

- **含义**：带时间戳的离散事件记录，通常包含级别、消息和结构化字段。
- **本项目**：日志应包含 RPC procedure、错误码、`trace_id` 等关联字段，避免记录凭据和敏感数据。K8s 内由 Vector 采集，经外置 OTel Collector 管道处理后写入 VictoriaLogs。

### RED

- **含义**：Rate、Errors、Duration，面向请求型服务的三类核心指标。
- **本项目**：用于监控 RPC 和网关流量，分别观察请求速率、错误率和延迟分布。

### USE

- **含义**：Utilization、Saturation、Errors，面向资源的三类核心指标。
- **本项目**：用于数据库连接池、CPU、内存、磁盘和消息消费者等资源监控。

### SLI、SLO 与 SLA

- **含义**：SLI 是服务水平指标；SLO 是该指标的内部目标；SLA 是与用户或客户约定并可能包含违约责任的协议。
- **本项目**：监控告警应以明确 SLI 和 SLO 为依据；没有正式约定时，不应把内部目标写成 SLA。

### HA

- **含义**：High Availability，高可用。通过冗余、复制和故障切换减少单实例故障导致的中断。
- **本项目**：组件多副本不等于跨故障域容灾；可重建的派生视图可采用与交易数据库不同的可用性策略。

### 熔断

- **含义**：下游持续失败时暂时停止调用，避免资源耗尽和级联故障；经过冷却后再试探恢复。
- **本项目**：网关和服务调用可按下游服务粒度熔断，业务失败不能误算为基础设施故障。

### 限流

- **含义**：限制单位时间内的请求或并发数量，保护服务和下游资源。
- **本项目**：网关提供 BBR 自适应限流；具体阈值应来自容量测试和 SLO，而不是随意设定。

### 降级

- **含义**：依赖不可用或系统过载时，关闭非核心能力或返回简化结果，保留核心流程。
- **本项目**：降级必须明确触发条件、返回语义和恢复方式，不能通过 nil-safe getter 静默关闭必需能力。

### 优雅关闭

- **含义**：停止接收新请求，等待在途操作完成，注销实例并刷新缓冲数据后退出进程。
- **本项目**：服务停止顺序包括注销发现、HTTP Shutdown、关闭空闲连接和 OTel flush。

### 自愈

- **含义**：系统检测到异常后通过重试、补偿、重建或调度自动恢复到可接受状态。
- **本项目**：库存泄漏、迟到支付和事件滞留分别依靠持久任务、对账和告警处理；自愈不表示可以省略错误可见性。

## 云原生与交付

### Kubernetes

- **含义**：声明式容器编排平台，负责部署、调度、服务发现和资源管理。
- **本项目**：后端服务通过 Helm 和 Argo CD 部署；集群内服务与外部基础设施事实看 [`.service-matrix.yaml`](../.service-matrix.yaml)。

### Helm

- **含义**：Kubernetes 应用的模板化打包和发布工具，Chart 描述一组相关资源。
- **本项目**：每个后端服务有独立 Chart，并复用 library chart；部署覆盖由结构测试校验。

### GitOps

- **含义**：以 Git 中的声明式配置作为期望状态，由控制器持续同步到运行环境。
- **本项目**：Argo CD 监听清单仓库，自动同步并自愈漂移；实现进度与例外看 DevOps 文档和 `TODO.md`。

### Argo CD

- **含义**：面向 Kubernetes 的 GitOps 持续交付控制器。
- **本项目**：ApplicationSet 生成服务应用并开启 `prune` 与 `selfHeal`。进行 Okteto 内环开发前必须按项目 Runbook 暂停对应自动同步窗口。

### CI/CD

- **含义**：Continuous Integration / Continuous Delivery，持续集成与持续交付。CI 自动验证变更，CD 自动生成并推进可部署制品。
- **本项目**：GitHub Actions 执行测试、镜像构建和 Helm 打包，再更新清单仓库触发 Argo CD。

### OCI

- **含义**：Open Container Initiative 制定的容器镜像与运行时标准；OCI Registry 也可存储 Helm Chart 等制品。
- **本项目**：服务镜像和打包后的 Helm Chart 作为版本化制品发布。

### Operator

- **含义**：把特定系统的运维知识编码为 Kubernetes 控制器，通过自定义资源执行部署、升级和恢复。
- **本项目**：CloudNativePG Operator 管理存量 PostgreSQL 集群；目标 OLTP 数据库迁移至外部 Pigsty 集群。

### CNPG

- **含义**：CloudNativePG，在 Kubernetes 上以 Operator 方式管理 PostgreSQL 集群的开源项目。
- **本项目**：存量 CNPG 属迁移起点；目标 OLTP 数据库按 [`TECH.md`](TECH.md) 外置部署于 Pigsty，由 Patroni 提供自动故障转移、PgBouncer 治理连接池，并以 UUIDv7 作为默认主键。

### CRD 与 CR

- **含义**：CustomResourceDefinition 定义 Kubernetes 扩展资源类型，Custom Resource 是该类型的具体资源实例。
- **本项目**：Operator 通过 CRD 提供领域资源，例如 CNPG 的数据库集群与声明式建库资源。

### VPA

- **含义**：Vertical Pod Autoscaler，根据资源使用情况建议或调整 Pod 的 CPU 与内存请求。
- **本项目**：部署体系包含 VPA；是否自动更新资源以及具体策略以 Helm 配置为准。

### KEDA

- **含义**：Kubernetes Event-driven Autoscaling，根据队列长度、事件流或外部指标伸缩工作负载。
- **本项目**：属于已选定但尚未完全落地的方向，不能写成当前运行事实。

### PITR

- **含义**：Point-in-Time Recovery，把数据库恢复到指定时间点，通常依赖基础备份与持续归档的 WAL。
- **本项目**：目标 PostgreSQL 外置部署于 Pigsty，PITR 是高可用和灾难恢复的必要能力；存量 CNPG 方案处于迁移期。

### TLS verify-full

- **含义**：TLS 客户端既验证证书链，也验证连接主机名与证书 SAN 是否匹配。
- **本项目**：PostgreSQL 与缓存连接采用严格校验；验收不能依赖跳过校验的 `-k` 或等价选项。

## 存储与备份

### 对象存储（object storage）

- **含义**：以对象（内容 + 元数据 + 唯一键）为单位、经 HTTP API 读写的扁平存储，适合图片、备份和归档等一次写入、多次读取的非结构化数据；不提供 POSIX 文件语义。
- **本项目**：Silo（基于 MinIO）是 S3 兼容对象存储，用于商品图片与备份制品；开启 Versioning 与 Lifecycle，前端上传统一使用后端签发的预签名 URL。数据库不落对象存储。

### S3 兼容（S3-compatible）

- **含义**：实现 AWS S3 HTTP API 的接口约定，涵盖签名 v4 鉴权、bucket/object 模型、multipart 分片上传、presigned 预签名链接和生命周期规则；客户端通常只需更换 endpoint 即可切换后端。
- **本项目**：备份工具与商品图客户端都按 S3 协议对接，这是对象存储后端可替换的前提；替换验收按 TECH-RADAR §10.6 的兼容性 PoC 清单执行。

### MinIO

- **含义**：Go 编写的 S3 兼容对象存储，曾是自建对象存储的事实标准；上游仓库已于 2026 年归档，社区版停止演进，不再获得功能与安全修复。
- **本项目**：现役 MinIO 实例属于存量迁移对象；目标对象存储按 [`TECH.md`](TECH.md) 统一为 Silo（基于 MinIO），现状与迁移进度以 [`.service-matrix.yaml`](../.service-matrix.yaml) 和 [`TODO.md`](../TODO.md) 为准。

### Silo（pgsty/silo）

- **含义**：MinIO 上游归档后由 Pigsty 社区维护的延续分叉（前身 `pgsty/minio`），AGPL-3.0、Go 编写；保留 MinIO 的 S3 API、`MINIO_*` 配置面与线协议，回补上游不再向社区版发布的安全修复，定位是存量 MinIO 部署的 drop-in 升级线。
- **本项目**：node2 存量实例已于 2026-08-20 切至该分叉（pin digest + 显式 `--certs-dir`，验收与踩坑见 [`TODO.md`](../TODO.md) ⓪d）。

**后续决策覆盖（2026-08-28）**：本条已被 [`TECH.md`](TECH.md) 覆盖：Silo（基于 MinIO）是目标对象存储，统一承载 S3 兼容对象数据。

### 社区分叉（community fork）

- **含义**：上游项目归档、变更许可或停止维护后，社区在原代码基础上另立仓库继续维护的项目。评估要点：延续型（保留原许可、回补修复）还是换证型；维护方治理与 bus factor；发版与 CVE 响应节奏；对上游 API/配置面的兼容承诺。
- **本项目**：Silo 属延续型分叉。评审纪律：灾备等「不做会出事」层不押注年轻的单厂商分叉；分叉先进观察位，以持续维护时长和 CVE 响应时效换信任。

### SeaweedFS

- **含义**：Go 编写的开源分布式文件与对象存储（Apache-2.0），设计源自 Facebook Haystack 论文——海量小文件聚合进大 volume 文件以压低元数据开销；提供 S3 网关、filer、POSIX 挂载等多种形态。
- **本项目**：SeaweedFS 是历史评估方案，不再是目标对象存储；目标按 [`TECH.md`](TECH.md) 统一为 Silo（基于 MinIO）。

### 3-2-1 备份原则

- **含义**：重要数据保留 3 份副本、放在 2 种不同介质或系统上、其中 1 份异地，使任何单一事故最多损失一份副本。
- **本项目**：3 台虚拟机同宿主一台 Mac，物理故障域为 1，集群内副本不构成异地；异地副本规划落在云箱对象存储，由客户端加密（age）后以密文着陆，可选冷云第三副本凑满 3-2-1。

### Velero

- **含义**：CNCF 生态的 Kubernetes 集群备份/恢复工具（Go）。把集群里的资源对象（Deployment、Secret、CR 等）连同 PVC 盘数据（文件系统备份走 Kopia/FSB）打包推送到 S3 兼容存储，支持整簇或按命名空间恢复、迁移。
- **本项目**：TECH-RADAR 10.3 定稿采纳，分工是「管 K8s 资源与非 PG 的盘数据」；数据库一致性恢复明确**不归它**（文件级复制对运行中的 PG 不安全），归 CNPG 的 Barman 插件。落点=推送到 4c4G 云箱的 S3 兼容备份靶（原定 SeaweedFS；[`TECH.md`](TECH.md) 定稿对象存储为 Silo 后，备份靶选型随备份三件套重启时重议），见 TODO ①。

### Barman Cloud Plugin（CNPG-Barman）

- **含义**：CloudNativePG 的 PostgreSQL 原生备份插件（源自 Barman 工具族）。做两件事：定期**基础备份**（base backup，整库物理快照）+ 持续**WAL 归档**（把每段预写日志推到对象存储）。数据库运行中即可安全备份，恢复时先还原 base backup 再重放 WAL。
- **本项目**：与 Velero 成对分工——PG 的一致性备份/恢复由它负责（「Velero 文件备份 ≠ DB 一致性恢复」，对抗第 2 轮 codex 表述）；目标同为云箱 SeaweedFS，WAL 归档间隔 5 分钟。

### WAL（Write-Ahead Log，预写日志）

- **含义**：PostgreSQL 先把每个变更写进顺序日志再改数据文件的机制，是崩溃恢复、流复制与 PITR 的共同底座。归档 WAL = 把这些日志段持续复制到外部存储。
- **本项目**：CNPG 的 PITR 依赖 WAL 归档到云箱；RPO（最多丢多少数据）由归档间隔决定，定稿口径 5 分钟。

### PITR（Point-In-Time Recovery，按时间点恢复）

- **含义**：基于「base backup + 连续 WAL 归档」把数据库恢复到**任意指定时刻**（如误删表前一秒），而不是只能回到最近一次快照。RPO=两次归档间的窗口；RTO=完成恢复所需时间。
- **本项目**：TECH-RADAR §10 定稿速查里「Velero + CNPG-Barman 异地 PITR」的 PITR 即此；「异地」指备份必须离开 Mac 宿主（3 VM 同宿主=伪故障域），落到 4c4G 云箱。配套纪律：每周恢复演练到隔离命名空间、2c2G 哨兵监控归档年龄并互拨告警。属已定稿方向，落地状态以 [`TODO.md`](../TODO.md) ① 为准。

## 前端与客户端

### pnpm workspace

- **含义**：pnpm 管理多包仓库的工作区机制，支持本地包链接和统一依赖安装。
- **本项目**：`frontend/apps/*` 与 `frontend/packages/*` 属于同一 workspace，内部包使用 `workspace:*`。

### Catalog

- **含义**：pnpm 在 workspace 根集中声明依赖版本、由各包引用的版本管理机制。
- **本项目**：第三方依赖统一写为 `catalog:`，禁止各应用自行写死版本。

### Vite Plus（`vp`）

- **含义**：本项目采用的一体化前端工具链，覆盖开发服务器、构建、测试、lint、格式化、任务运行和 Git 钩子。
- **本项目**：前端不使用 Husky、Biome、ESLint 或 Prettier 作为独立工具；完整验证命令是 `pnpm ready`。

### 服务端状态

- **含义**：由远端服务拥有、客户端负责查询和同步的数据，例如商品列表与订单详情。
- **本项目**：使用 TanStack Query 管理缓存、重新获取和请求状态。

### 客户端状态

- **含义**：只在当前客户端交互中存在的本地状态，例如弹窗、草稿和界面偏好。
- **本项目**：使用 **Zustand** 管理（2026-08-28 由 valtio 全量迁移完成），不能把生成的 Proto DTO 直接存入 store。

### Web Vitals

- **含义**：衡量真实用户 Web 体验的一组核心指标，主要包括 LCP、INP 和 CLS。
- **本项目**：`@ecommerce/perf` 采集 Web Vitals、长任务和接口耗时，经 `telemetry.v1` 上报。

### LCP

- **含义**：Largest Contentful Paint，视口内最大内容元素完成渲染的时间，用于衡量主要内容加载速度。
- **本项目**：由前端性能包采集并汇入统一可观测性体系。

### INP

- **含义**：Interaction to Next Paint，用户交互到下一次视觉更新之间的延迟，用于衡量交互响应性。
- **本项目**：用于发现主线程长任务和交互处理过慢问题。

### CLS

- **含义**：Cumulative Layout Shift，页面生命周期内非预期布局位移的累计分数。
- **本项目**：图片尺寸缺失、异步内容插入和字体切换都可能造成 CLS，需要在界面实现中控制。

### 埋点（tracking）

- **含义**：记录用户行为事件及上下文，用于产品分析、推荐和故障定位。
- **本项目**：`@ecommerce/tracker` 负责行为采集；匿名浏览事件允许上报，但登录用户身份必须以网关注入值为准。

### `sendBeacon`

- **含义**：浏览器在页面卸载等时机可靠发送少量异步数据的 API。
- **本项目**：页面关闭时的行为上报使用手写 Connect unary JSON 线格式，因为 `sendBeacon` 不能设置 Connect 所需的自定义请求头。

## 搜索选型补充

### Meilisearch

- **含义**：面向应用搜索的开源搜索引擎，提供 typo 容错、Facet、排序与可选向量检索能力。
- **本项目**：Meilisearch 是仍在运行的存量搜索引擎，处于迁移期；目标按 [`TECH.md`](TECH.md) 迁回 Elasticsearch。实例与代码接线状态分别以 [`.service-matrix.yaml`](../.service-matrix.yaml) 和 [`TODO.md`](../TODO.md) 为准。

### Elasticsearch（ES）

- **含义**：基于 Lucene 的分布式搜索与分析引擎，支持全文检索、聚合和水平扩展。
- **本项目**：Elasticsearch 是目标搜索存储，作为隐藏于 `SearchCatalog` 接口后的只读投影，可从 PostgreSQL 全量重建；存量 Meilisearch 迁移完成前仍在运行。

### sortable（可排序字段）

- **含义**：允许查询按指定字段排序的索引能力，通常需要额外索引结构。
- **本项目**：商品列表可按价格、销量和上架时间排序；存量 Meilisearch 通过 `sortableAttributes` 声明，目标 Elasticsearch 只读投影通过排序字段映射提供该能力。

### 相关度（relevancy）

- **含义**：搜索结果与查询意图匹配程度的评分或排序依据。
- **本项目**：默认搜索排序使用相关度，业务可在此基础上组合销量、价格和时间等字段。

### 近似最近邻（ANN）

- **含义**：Approximate Nearest Neighbor，以较小精度损失换取高维向量近邻查询性能的算法类别。
- **本项目**：pgvector 的 HNSW 和 IVFFlat 都属于 ANN 索引，不是关键词倒排索引。

## 维护与状态用语

### 真相源（source of truth）

- **含义**：某类信息唯一受信任、需要优先更新的正式位置。
- **本项目**：技术栈看 `STACK.md`，拓扑看 `.service-matrix.yaml`，设计看 `docs/design/`，进度看 `TODO.md`，团队与 AI 规范看 `context/`。

### 目标态

- **含义**：设计希望最终达到的状态，不表示当前已经实现或部署。
- **本项目**：设计文档和技术雷达中的目标态必须与 `TODO.md` 的当前进度区分。

### 已接线

- **含义**：代码中已经存在可执行的调用、依赖或数据流，并非只有接口、配置或设计稿。
- **本项目**：服务依赖只有列入 `.service-matrix.yaml` 的 `depends_on` 才算已接线。

### 计划依赖

- **含义**：设计要求未来建立，但代码中尚不存在的服务依赖。
- **本项目**：记录在 `.service-matrix.yaml` 的 `depends_on_planned`，不得描述为当前能力。

### CrashLoop

- **含义**：Kubernetes 容器反复启动失败并被重新拉起，通常表现为 `CrashLoopBackOff`。
- **本项目**：已知服务异常原因与迁移计划以 `.service-matrix.yaml` 和 `TODO.md` 为准，术语本身不代表根因。
