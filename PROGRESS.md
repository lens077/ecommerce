# 电商项目进度表

> 最后更新：2026-08-07
> 当前阶段：第一阶段 - 核心业务 MVP（中期）
> 整体完成度：约 28%（**本轮回扫重估，下调 9 个百分点**，见下）
> 更新说明：一次对抗评审（双模型独立审查 + 逐条代码核实）发现本表多处「已实现/已联调」
> 与代码不符，本次按代码实际情况整体订正，完成度相应下调。**下调不代表功能倒退，
> 而是此前的数字虚高**。订正依据逐条附 `file:line`，评审全文见
> `ADVERSARIAL_REVIEW_20260806.md`。
> 订正涉及：库存 `Reserve` 静默失效 + `ReleaseReserve` 为 panic 桩、`CreateOrder` 返回
> 假成功而前端已接线、`CompleteOrder` 不落库、购物车 `AddProductToCart` 必然失败、
> 地址服务全线越权、商家审批为全表 UPDATE、前端页面表多处过期、Kafka 实为零集成、
> behavior 服务此前完全缺席。

---

## 一、项目整体规划

| 阶段 | 名称 | 周期 | 核心目标 | 状态 |
|------|------|------|----------|------|
| 第一阶段 | 核心业务 MVP | 2-3 个月 | 完成电商核心交易闭环，实现可上线的最小可用版本 | 进行中 |
| 第二阶段 | 商家与平台能力落地 | 3 个月 | 完成 B2B2C 平台核心能力，支持商家入驻、运营，平台管理 | 未开始 |
| 第三阶段 | 性能优化与高可用加固 | 2 个月 | 优化系统性能，完善高可用架构，支撑高并发流量 | 未开始 |
| 第四阶段 | 营销与扩展能力落地 | 3 个月 | 完善平台营销能力、数据分析能力，提升平台竞争力 | 未开始 |

---

## 二、后端微服务进度

> **本表口径**：「已实现接口」= proto 已定义且 handler 已挂载，**不代表调用会成功**；
> 一个返回假成功或 panic 的方法在本表按「未实现」计入完成度。2026-08-06 回扫前本表
> 混用了这两种口径，导致多项虚高。

| 微服务 | 规划阶段 | 当前状态 | 已实现接口 | 核心业务逻辑 | 完成度 |
|--------|----------|----------|------------|--------------|--------|
| **用户认证服务** | 第一阶段 | ✅ 核心完成 | SignIn、UserProfile | 已实现。⚠️ **安全**：`SignIn` 把完整 access token 打进 debug 日志（`user/internal/data/user.go:39`），debug 一开即经 Loki 外泄可回放 | 70% |
| **商品服务** | 第一阶段 | ⚠️ 接口定义 | GetProductDetail | 仅透传调用，无业务逻辑（`product/internal/biz/product.go:86`） | 25% |
| **订单服务** | 第一阶段 | ⚠️ 架构搭建 | CreateOrder、CompleteOrder | ❌ **两个都不可用**：`CreateOrder` 丢弃请求体并返回**假成功**（`service/order.go:31`，`application/order.go:61`），而结算页已真实接线；`CompleteOrder` 的 `SaveOrder` 只打日志不落库（`data/order.go:83`）却照发 `OrderCompleted` 事件 | 20% |
| **支付服务** | 第一阶段 | ⚠️ 接口定义 | CreatePayment、GetPaymentStatus、HandlePaymentNotify、HandlePaymentCallback | 5 个 repo 方法**全部显式返回 `CodeUnimplemented`**（`payment/internal/data/payment.go:41`）。原实现依赖已移除的 balance/consumerOrder client，需整体恢复 | 10% |
| **库存服务** | 第一阶段 | ❌ 不可用 | Reserve、ReleaseReserve（**均不可用**） | ❌ `Reserve` **静默无操作**：传 `version+1` 导致 WHERE 永不命中、丢弃 execrows、扣减量语义颠倒、错误变量传错致吞错（`inventory/internal/data/inventory.go:52`）——返回成功但库存不变，且写入假流水；`ReleaseReserve` 是 `panic("implement me")`（同文件 :88） | 5% |
| **搜索服务** | 第一阶段 | ⚠️ 接口定义 | Search | 仅透传调用。⚠️ 读取字段（`id`/`skus[].price`/`sale_detail[].quantity`）与 `DESIGN.md:335-370` 的 ES mapping（`spu_id`/顶层 `price`/`sale_count`）**不兼容**，按设计建索引则结果全为零值 | 20% |
| **购物车服务** | 第一阶段 | ⚠️ 部分可用 | GetCart、RemoveCartItem 可用；AddProductToCart、UpdateCartItemQuantity **不可用** | ❌ `AddProductToCart` 对任何新商品必然失败：schema 要求 `shop_name NOT NULL`（`data/schema/cart.sql:17`）而 INSERT 无此列（`data/queries/cart.sql:3`）；`UpdateCartItemQuantity` 的 Params **没有 Quantity 字段**（`data/cart.go:57`），改数量改不了 | 45% |
| **地址服务** | 第一阶段 | ⚠️ 功能完整但越权 | CreateAddress、UpdateAddress、DeleteAddress、GetAddress、ListAddresses、SetDefaultAddress | 功能已实现。❌ **安全 BLOCKER**：Get/Update/Delete/SetDefault 的 SQL 仅按 `address_id` 过滤、无 user 归属校验，`CreateAddress` 的 `user_id` 取自请求体（`service/address.go:26,71,84,95`），网关又整段放行 `AddressService/*`（`policies.csv:3`）——任何登录用户可读改删他人地址 | 70% |
| **行为/推荐服务 (behavior)** | 第一阶段 | ✅ 核心完成 | Track、Recommend、SimilarItems，并承载 TelemetryService | 已实现（`behavior/internal/biz/usecase.go`）。**此前本表完全遗漏该服务**，2026-08-06 回扫补入 | 60% |
| **商家服务** | 第二阶段 | ⚠️ 仅提交/查询可用 | SubmitApplication、GetApplication 可用；ApproveApplication **实现错误**；RejectApplication、ActivateMerchant **为 panic 桩** | ❌ `ApproveApplication` 的 SQL **没有 WHERE 子句**（`data/queries/merchant.sql:23`），批准一份 = 批准全部待审申请且覆盖其审核意见；`RejectApplication`/`ActivateMerchant` 是 `panic("implement me")`（`service/merchant_service.go:57,98`） | 20% |
| **履约服务** | 第二阶段 | ❌ 未开始 | - | - | 0% |
| **结算服务** | 第二阶段 | ❌ 未开始 | - | - | 0% |
| **营销服务** | 第四阶段 | ❌ 未开始 | - | - | 0% |
| **数据分析服务** | 第四阶段 | ❌ 未开始 | - | - | 0% |

**后端整体完成度：约 25%**（原记 35%，本轮按上述口径重估下调）

### 2.1 核心服务业务逻辑详情

#### 订单服务 (`backend/services/order/internal/biz`)
- ✅ **DDD 架构**：领域实体（OrderGroupRoot、OrderRoot、OrderItem、OrderLog）完整定义
- ⚠️ **领域事件框架**：发布机制已搭建，但 EventBus 是**进程内总线**，事件出不了本进程
- ❌ **CreateOrder**：不只是「未实现」，而是**返回假成功**——service 层把 `req` 整个注释掉、
  硬编码 `CartItemIDs: nil, AddressID: 0`（`internal/service/order.go:31`），application 层
  直接 `return &domain.CreateOrderResponse{}, nil`（`application/order.go:61`）。
  而结算页已真实调用该接口并跳转支付结果页（`checkout/index.tsx:110`），
  **用户会看到「下单成功」但系统里没有订单**。应先改为显式 `CodeUnimplemented` 止血
- ❌ **CompleteOrder**：状态校验与事件发布已写，但**持久化是空的**——`SaveOrder` 只打一行
  debug 日志就返回 nil（`internal/data/order.go:83`），`OrderCompleted` 事件照发。
  另：`CompleteOrderResponse.Order` 是零字段空 message（`api/order/v1/order.proto:28`）；
  service 层把 application 返回的 CodeNotFound 重包成 CodeInternal（`service/order.go:63`），
  客户端会把「单号写错」当成「服务端故障」
- ❌ **PayOrder / ShipOrder**：方法框架存在，业务逻辑为空
- ❌ **UpdateOrderStatus / SaveOrderLog**：repo 层为 `panic("implement me")`

#### 支付服务 (`backend/services/payment/internal/biz`)
- ✅ **数据模型**：Payment、Notification、回调请求/响应结构完整
- ❌ **核心方法**：5 个 repo 方法**全部显式返回 `connect.CodeUnimplemented`**
  （`internal/data/payment.go:41`），不是「仓储透传」——每次调用都以错误结束。
  这是有意为之的诚实桩（服务能起、能注册，调用方分得清「没做」和「链路不通」），
  但原实现依赖已移除的 balance/consumerOrder client，恢复是整块工作
- ❌ **支付回调处理**：未启用

#### 库存服务 (`backend/services/inventory`)
- ⚠️ **数据模型**：InventoryInfo 为空结构体，ReserveRequest/Response 定义完整
- ❌ **Reserve 静默无操作**（`internal/data/inventory.go:52`）——四个错误叠加：
  1. Go 传 `Version: stock.Version + 1`，SQL 是 `... AND version = @version`，
     WHERE 比对「未来版本号」→ **永远命中 0 行**；
  2. `_, reserveErr :=` 丢弃 `:execrows` 的受影响行数，0 行更新不报错；
  3. `Quantity: stock.Available - item.Quantity` 传给 `available = available - @quantity`，
     语义颠倒（把可用库存设成 `item.Quantity` 而非减掉它）；
  4. 错误分支传的是恒为 nil 的 `err` 而非 `reserveErr`/`insertChangeLogErr`，真失败时返回 `(nil, nil)`。
  注释声称「开启事务/回滚重试」但**没有任何 `ExecTx` 包裹**，`FOR UPDATE` 在自动提交下立即失效。
  净效果：调用返回成功、库存分毫未动、change_log 里写下一条**伪造的扣减流水**。
  一旦按 `TODO.md` 的方案接上「建单同步 Reserve（TCC-Try）」，预占永远虚假成功 → **必然超卖**，
  直接违反 `DESIGN.md` 的「从数据库层面杜绝超卖」
- ❌ **ReleaseReserve**：`panic("implement me")`（同文件 :88）。接上取消/超时补偿即每单必炸

#### 购物车服务 (`backend/services/cart`)
- ✅ **GetCart / RemoveCartItem**：已实现
- ❌ **AddProductToCart**：schema 的 `shop_name` 是 `VARCHAR(255) NOT NULL` 且无默认值
  （`internal/data/schema/cart.sql:17`），而 INSERT 列表里没有这一列
  （`internal/data/queries/cart.sql:3`）→ 任何**首次**加购（走不到 ON CONFLICT 分支）
  必然以 not-null violation 失败
- ❌ **UpdateCartItemQuantity**：`UpdateCartItemQuantityParams` 里**根本没有 Quantity 字段**
  （`internal/data/cart.go:57`）——即便前端接线也改不了数量

#### 商家服务 (`backend/services/merchant`)
- ✅ **SubmitApplication / GetApplication**：已实现
- ❌ **ApproveApplication 全表 UPDATE**：SQL 没有 WHERE 子句
  （`internal/data/queries/merchant.sql:23`），repo 层还把 `ApplicationId` 直接丢弃
  （`internal/data/merchant.go:23`）→ 批准一份申请 = 把所有待审申请一起改成 approved，
  并覆盖上这一份的审核意见和时间戳
- ❌ **RejectApplication / ActivateMerchant**：`panic("implement me")`
  （`internal/service/merchant_service.go:57,98`）

#### 地址服务 (`backend/services/address`)
- ✅ **功能**：CRUD + SetDefault 六个方法均已实现，是本阶段完成度最高的业务服务
- ❌ **安全 BLOCKER — 全线越权**：`GetAddress`/`UpdateAddress`/`DeleteAddress`/`SetDefaultAddress`
  的 SQL 只按 `address_id` 过滤，无 user 归属校验；`CreateAddress` 的 `user_id` 直接取自
  请求体（`internal/service/address.go:26,71,84,95`）；网关策略又整段放行
  `p, consumer, /address.v1.AddressService/*`（`gateway/configs/policies/policies.csv:3`）。
  任何登录用户拿到或遍历到他人地址 UUID 即可读改删其隐私地址，违反 `DESIGN.md` 的数据隔离不变量

#### 商品服务 (`backend/services/product/internal/biz`)
- ✅ **数据模型**：ProductSpu、ProductSku、ProductSpuDetail 完整定义
- ⚠️ **核心方法**：GetProductDetail 仅做仓储透传（`biz/product.go:86`），无数据组装、缓存逻辑

#### 用户服务 (`backend/services/user`)
- ✅ **SignIn / UserProfile**：走真实 Casdoor client，已实现
- ❌ **安全**：`SignIn` 成功后 `u.l.Debug(token.AccessToken)`（`internal/data/user.go:39`）——
  debug 级别一开（排障时最常见），每次登录的 bearer token 就经 stdout → fluent-bit → Loki
  落盘，日志读者可在有效期内直接回放

---

## 三、前端应用进度

| 应用 | 规划阶段 | 当前状态 | 已实现页面 | 完成度 |
|------|----------|----------|------------|--------|
| **消费者端 (Consumer)** | 第一阶段 | ⚠️ 页面框架大部完成 | 首页、商品详情、购物车、结算、订单列表、订单详情、支付结果、个人中心、地址管理、登录回调（**分类页为占位桩、优惠券页不存在**） | 45% |
| **商家端 (Merchant)** | 第二阶段 | ⚠️ 框架搭建 | 订单、商品、报表、设置（基础结构） | 20% |
| **管理后台 (Admin)** | 第二阶段 | ⚠️ 框架搭建 | 分类、商家、订单、商品、报表、用户、设置（基础结构） | 20% |

**前端整体完成度：约 30%**（原记 40%，本轮回扫下调）

### 3.1 消费者端页面详情

| 页面 | 路径 | 状态 | 联调状态 | 备注 |
|------|------|------|----------|------|
| 首页 | `/` | ⚠️ 空态 | ❌ 未联调 | **已不是重定向**：改为商品网格，但 `products` 恒为空数组、等 `ListProduct` 落地（`routes/index.tsx`） |
| 商品详情 | `/product/$spuCode` | ✅ 已完成 | ✅ 已联调 | 走 `useProductDetail` 真实 API（`routes/product/$spuCode.tsx:55`）；属性选择、SKU 切换、加入购物车、骨架屏。⚠️ 加购按钮打到的后端必然失败（见 §2.1 购物车） |
| 分类页 | `/categories` | ❌ 占位桩 | ❌ 未联调 | **全文 9 行**，渲染字面量 `cart`、组件还叫 `CartPage`，无任何分类 UI 与 API（`routes/categories/index.tsx`）。原记「✅ 已完成 / 部分联调」为虚报 |
| 购物车 | `/cart` | ✅ 已完成 | ⚠️ 部分联调 | 商家分组、全选、响应式布局 OK；**数量调整与删除只改本地 valtio store、从不发 RPC**（`hooks/useCart.ts:203-214`）→ 刷新后被删的商品复活。原记「✅ 已联调（数量调整、删除）」为虚报 |
| 结算页 | `/checkout` | ✅ 已完成 | ⚠️ 已接线但后端是假的 | **原记「使用模拟数据、未对接后端」已过时且方向相反**：已真实调 `createOrder.mutateAsync` 并跳转支付结果页（`routes/checkout/index.tsx:110`），但后端 `CreateOrder` 丢弃请求返回假成功 → 用户以为下单成功。另：proto 缺 `requestId`，无防重令牌 |
| 订单列表 | `/orders` | ✅ 已完成 | ❌ 未联调 | 订单状态分类展示，数据未对接后端（mock） |
| 订单详情 | `/orders/$orderId` | ✅ 已完成 | ❌ 未联调 | 订单明细查看，数据未对接后端（mock） |
| 支付结果 | `/payment/result` | ✅ 已完成 | ❌ 未联调 | 支付成功/失败展示，数据未对接后端（mock） |
| 个人中心 | `/profile` | ✅ 已完成 | ⚠️ 部分联调 | 用户信息展示 |
| 地址管理 | `/profile/addresses` | ✅ 已完成 | ⚠️ 部分联调 | 地址增删改查、设为默认（后端存在越权缺陷，见 §2.1 地址服务） |
| 优惠券 | `/coupons` | ❌ 不存在 | ❌ 未联调 | **`src/routes/` 下没有 coupons 路由，访问直接 404**。原记「⚠️ 基础页面」为虚报 |
| 登录回调 | `/callback` | ✅ 已完成 | ✅ 已联调 | Casdoor OAuth 回调 |
| 404 页面 | `*` | ✅ 已完成 | N/A | 404 错误页 |

### 3.2 前端关键组件

| 组件 | 路径 | 状态 | 备注 |
|------|------|------|------|
| AppBar | `components/AppBar.tsx` | ✅ 已完成 | 全局共享，Sticky 定位，模糊背景效果 |
| CartItemCard | `components/cart/CartItemCard.tsx` | ✅ 已完成 | 购物车商品卡片，固定尺寸，hover 效果 |
| CartSummaryCard | `components/cart/CartSummaryCard.tsx` | ✅ 已完成 | 结算摘要，支持 sidebar/bottomBar 两种模式 |
| MerchantCartGroup | `components/cart/MerchantCartGroup.tsx` | ✅ 已完成 | 商家分组，支持商家级全选 |
| EmptyCart | `components/cart/EmptyCart.tsx` | ✅ 已完成 | 空购物车状态展示 |

---

## 四、基础设施进度

| 组件 | 规划阶段 | 当前状态 | 已实现能力 | 完成度 |
|------|----------|----------|------------|--------|
| **API 网关** | 第一阶段 | ✅ 主体完整 | Consul 服务发现、JWT 认证、RBAC 权限、限流熔断、CORS、日志、链路追踪、协议转换、重试。⚠️ **重试无幂等保护**：传输错误时无条件重放非幂等 POST（`gateway/proxy/proxy.go:263-310`，address 等路由 `attempts: 2`），而业务侧尚无幂等键 → 断连可产生重复写；⚠️ 生产 ConfigMap 用了代码不读的 `DISCOVERY_CONFIG_PATH`（`gateway/deploy/prod/configMap.yaml:9`，实际是 `CONSUL_CONFIG_PATH`） | 80% |
| **服务注册发现** | 第一阶段 | ✅ 已实现 | Consul 集成 | 90% |
| **可观测性** | 第三阶段（提前落地） | ✅ 主体完成 | Trace/Metric/Log 三管道端到端（→ Jaeger / VictoriaMetrics / Loki）；11 个服务 OTel SDK 装配收敛为一份基线（`ParentBased` 采样器 + 采样率可配、`service.instance.id`、`SetErrorHandler`、gzip）；跨服务 trace 已串联（网关→服务实测同一条 trace）；2 张 Grafana 看板（业务盘 + 基础设施盘，脚本生成）。**缺口：告警为 0**（Grafana 0 条规则、无 vmalert/alertmanager）、采集管道自身无监控（`otelcol_*` 未采集）、无 k8s 对象/容器级指标、网关无 meter。2026-08-07 新增方法论与指标基线文档 `observability/OBSERVABILITY.md`（RED/USE、逐服务最低指标配置、第一批 7 条告警清单、6 条硬规则），**纯文档，缺口未动，完成度不变** | 60% |
| **消息队列** | 第一阶段 | ❌ 未集成 | **Kafka 客户端代码为 0**：`backend/go.mod` 里没有 sarama / franz-go / segmentio 任一依赖，订单的 EventBus 是**纯进程内总线**（`order/internal/eventbus/eventbus.go`），事件出不了本进程；`infrastructure/kafka-connect` 只是 Debezium 部署物（且当前 CrashLoopBackOff）。原记「EventBus/Kafka 部分集成 20%」把两件事混为一谈，制造了已接 MQ 的假象 | 5% |
| **缓存层** | 第一阶段 | ⚠️ 基础设施就绪 | Redis 部署配置，业务缓存待完善 | 20% |
| **数据库** | 第一阶段 | ✅ 基础完成 | PostgreSQL + sqlc，各服务 Schema 已建 | 70% |
| **容器化部署** | 第一阶段 | ✅ 基础完成 | Dockerfile、K8s Deployment、Helm Chart（部分） | 60% |
| **CI/CD** | 第一阶段 | ⚠️ 基础配置 | GitHub Actions 工作流；2026-08-07 新增结构性门禁 `backend/structcheck`（matrix↔目录↔网关接线一致性 + internal/pkg 同构性棘轮），随 `go test ./...` 执行。同日新增 `DEVOPS.md` 体系设计（四阶段落地路线 + 行为验收标准），**仅设计定稿，实现未开始，完成度不因文档变化** | 45% |

**基础设施整体完成度：约 55%**（相比上版 +5，全部来自可观测性 30% → 60%，其余组件未动）

### 4.1 网关中间件清单

| 中间件 | 状态 | 说明 |
|--------|------|------|
| IP 中间件 | ✅ | IP 限流/白名单 |
| CORS | ✅ | 跨域处理 |
| JWT 认证 | ✅ | 令牌校验与用户解析 |
| RBAC 权限 | ✅ | 基于 Casbin 的权限控制 |
| 日志 | ✅ | 请求日志记录 |
| 链路追踪 | ✅ | OpenTelemetry tracing。会向下游注入 `traceparent`，与服务端的 `WithTrustRemote()` 配对后网关→服务是同一条 trace（实测） |
| 指标 | ⬜ | **网关没有任何 meter**，`http_server_*` 指标族不存在，所以看不到网关侧耗时/错误率。要补 metrics 中间件 |
| 限流熔断 (BBR) | ✅ | 自适应限流 |
| 协议转换 (Transcoder) | ✅ | Connect / gRPC-Web 协议转换 |
| URL 重写 | ✅ | 请求路径重写 |

---

## 五、已完成的核心亮点

### 5.1 技术栈验证 ✅
- **Connect-go + Connect-web**：前后端类型安全的 RPC 通信已打通，商品服务已成功联调
- **Protobuf + Buf**：统一的 API 定义与代码生成流程已建立，13 个服务的 proto 文件已定义
- **Fx 依赖注入**：各微服务均采用 Fx 模块化架构
- **sqlc**：类型安全的数据库操作代码生成
- **Casdoor 集成**：统一身份认证体系已接入，登录回调已实现

### 5.2 工程化规范 📐
- 统一的目录结构与代码规范
- DDD 分层架构（订单服务已完成 domain/application **分层骨架**——注意骨架完整不等于逻辑完整，
  该服务的持久化与建单逻辑均为空，见 §2.1）
- 各服务独立 Dockerfile + K8s 部署配置
- 前后端 Monorepo 管理（pnpm workspace）
- ⚠️ **错误处理规范尚未真正统一**：规范是「biz 层定义错误，service 层映射 RPC 错误码」，
  但订单服务的 application 层自己构造 connect 错误码（`application/order.go:84-106`），
  service 层又把它整体重包成 `CodeInternal`（`service/order.go:63`）——两处都违反规范，
  且后者把 NotFound 变成了 Internal。此条从「已建立」降为「已定义、待落实」

### 5.3 网关能力 🚀
- 基于 Consul 的服务发现与负载均衡
- JWT 认证 + RBAC 权限控制
- BBR 限流熔断
- OpenTelemetry 全链路追踪
- 协议转换（Connect / gRPC-Web）
- CORS 跨域处理
- 配置热更新

---

## 六、待办事项

### 6.1 第一阶段收尾（当前重点）

#### 🔴 P0 · 假成功与越权（2026-08-06 对抗评审发现，优先于一切新功能）

> 这批问题的共同点是：**调用会「成功」但结果是错的**，比未实现更危险。
> 详见 `ADVERSARIAL_REVIEW_20260806.md`。

- [ ] **库存 Reserve 静默无操作**：修版本号比对（传当前 version 而非 +1）、检查 execrows 为 0 时
      返回冲突错误、修正扣减量语义、错误分支传对变量、整段包进事务（`inventory/internal/data/inventory.go:52`）
- [ ] **库存 ReleaseReserve 是 panic 桩**：实现或至少改成显式 `Unimplemented`（同文件 :88）
- [ ] **CreateOrder 返回假成功**：立即改为显式返回 `CodeUnimplemented` 止血
      （前端已接线，当前用户会看到「下单成功」但无订单），再按下方计划实现主体
- [ ] **CompleteOrder 不落库**：实现 `SaveOrder`（`order/internal/data/order.go:83`）；
      在持久化成功前不得发布 `OrderCompleted`
- [ ] **地址服务全线越权**：所有查询加 `AND user_id = ?`，user 一律取自网关注入的身份头
      而非请求体；网关策略从整段放行收敛到 RPC 粒度（`policies.csv:3`）
- [ ] **商家审批全表 UPDATE**：`ApproveApplication` 的 SQL 补 `WHERE application_id = @application_id`，
      repo 层把 `ApplicationId` 传下去（`merchant.sql:23`、`merchant.go:23`）
- [ ] **登录 token 落日志**：删除 `u.l.Debug(token.AccessToken)`（`user/internal/data/user.go:39`）
- [ ] **购物车 AddProductToCart 必然失败**：INSERT 补 `shop_name`（proto/biz/data 一路补字段），
      或改 schema 给默认值——二选一，需先定契约
- [ ] **UpdateCartItemQuantity 收不到数量**：Params 补 Quantity 字段并接上前端
- [ ] **商家 RejectApplication / ActivateMerchant 是 panic 桩**：实现或改显式 `Unimplemented`
- [ ] **网关重试可复制非幂等写**：proto 补 `requestId` 幂等键，或对非幂等方法关闭重试
- [ ] **搜索字段与 DESIGN 的 ES mapping 不兼容**：二者对齐（改实现或改设计，需决策）
- [ ] **给上述路径补测试**：这些缺陷全部位于零覆盖路径上——不补测试，修完还会重演

#### 后端核心业务逻辑实现

- [ ] **订单服务**：实现 CreateOrder 核心逻辑（购物车校验、库存预占、金额计算、订单保存、清空购物车）
- [ ] **订单服务**：实现 PayOrder（支付成功状态更新、事件发布）
- [ ] **订单服务**：实现 ShipOrder（商家发货、物流信息记录）
- [ ] **支付服务**：实现支付回调处理（验签、状态更新、订单通知）
- [ ] **支付服务**：实现退款流程
- [ ] **库存服务**：实现库存预占、扣减、释放核心逻辑
- [ ] **库存服务**：实现库存流水记录
- [ ] **商品服务**：实现 SPU/SKU 列表查询、类目管理、品牌管理
- [ ] **搜索服务**：实现 Elasticsearch 索引同步、聚合筛选、排序推荐
- [ ] **用户服务**：实现用户信息修改、第三方登录

#### 领域事件完善

- [ ] 实现 OrderCreated 事件发布（订单创建后触发库存预占）
- [ ] 实现 OrderPaid 事件发布（支付成功后触发库存扣减、订单履约）
- [ ] 实现 OrderCancelled 事件发布（订单取消后触发库存释放）
- [ ] 各服务订阅相关领域事件并实现业务逻辑

#### 前端联调

- [x] **结算页**：已对接订单创建接口（但后端返回假成功，需先修后端，见 P0）
- [ ] **购物车**：把删除/改数量接到 `RemoveCartItem`/`UpdateCartItemQuantity`（当前只改本地 store）
- [ ] **分类页**：当前是 9 行占位桩，需从零实现
- [ ] **优惠券页**：路由不存在，需从零实现
- [ ] **首页**：接通 `ListProduct`（当前商品列表恒为空数组）
- [ ] **订单列表**：对接订单查询接口
- [ ] **订单详情**：对接订单详情接口
- [ ] **支付结果**：对接支付状态查询接口
- [ ] **个人中心**：完善用户信息展示
- [ ] **优惠券**：实现优惠券选择、核销逻辑

#### 基础设施

- [ ] Kafka 集群部署与全服务接入
- [ ] Redis 缓存策略落地（商品详情、库存、热点数据）
- [ ] 全链路压测准备
- [x] 可观测性主体（三管道 + SDK 基线 + 2 张 Grafana 看板），详见 `TODO.md`
- [ ] **告警从 0 到 1**：目前 Grafana 0 条规则、无 vmalert/alertmanager，只有一个默认 email 联系点 —— 看板只能人盯，出事没人被叫醒。这是可观测性剩下的最大一块
- [ ] 采集管道自身监控：`otelcol_*` 只在 collector pod 的 `:8888`，没被采进 VM，「遥测有没有在半路丢」查不了（collector 加 `prometheus` receiver 自采即可，代价极小）
- [ ] 网关 metrics 中间件（当前网关只有 tracing，无 meter）
- [ ] k8s 对象/容器级指标（`kubelet_stats` + `k8s_cluster`，基数敏感，单独一轮）

---

### 6.2 第二阶段：商家与平台能力

#### 后端新增

- [ ] **履约服务**：订单发货、物流轨迹、售后退换货
- [ ] **结算服务**：佣金计算、商家结算、财务对账
- [ ] **商家服务完善**：店铺管理、商品管理、订单履约、促销配置
- [ ] **完整 RBAC 权限体系落地**

#### 前端新增

- [ ] **商家后台**：商品管理、订单发货、售后处理、财务结算、店铺设置
- [ ] **管理后台**：商家审核、类目品牌管理、订单仲裁、平台配置、数据统计

---

### 6.3 第三阶段：性能优化与高可用

- [ ] 全链路压测与性能调优
- [ ] 多级缓存架构（本地缓存 + Redis + CDN）
- [ ] 数据库读写分离
- [ ] 弹性扩缩容（HPA）
- [ ] 完善监控告警体系（VictoriaMetrics + Grafana）
- [ ] 日志平台（Loki）
- [ ] 链路追踪完善（Jaeger）

---

### 6.4 第四阶段：营销与扩展能力

#### 后端新增

- [ ] **营销服务**：优惠券、满减、秒杀、会员积分
- [ ] **数据分析服务**：经营报表、用户行为分析

#### 前端新增

- [ ] 营销活动页面
- [ ] 数据分析仪表盘

---

## 七、当前阶段判断

**项目整体处于第一阶段（核心业务 MVP）的中期**

### 当前状态总结

1. **架构层面**：DDD 分层架构、微服务骨架、网关基础设施均已完善
2. **接口层面**：核心服务的 Protobuf 定义、Service 接口均已完成
3. **业务逻辑层面**：大部分核心业务逻辑仍未实现（订单创建、支付回调、库存扣减等）。
   **更需警惕的是「假成功」**：库存 `Reserve`、订单 `CreateOrder`/`CompleteOrder` 不是老实地
   报错，而是返回成功、写假流水、发事件——这类缺陷不会在联调时暴露，只会在上量后以
   超卖、丢单的形式爆发。payment 显式返回 `Unimplemented` 的做法才是正确示范
4. **安全层面**：地址服务全线越权、商家审批全表 UPDATE、登录 token 落日志——
   三项均已可被利用，优先级高于任何新功能
5. **前端层面**：页面框架基本完成，部分页面已联调，核心流程（结算→下单→支付）未打通；
   结算页已接线但打到的是后端假接口，比未接线更糟
5. **可观测性层面**：原属第三阶段，已提前落地主体 —— 三管道端到端、跨服务 trace 串联、
   2 张 Grafana 看板。但**告警仍是 0**，所以现阶段的定位是「出事后能查」，还不是
   「出事时会被告知」。另外看板上不少面板当前是空的，成因是采集侧未实现（网关无 meter、
   11 个服务无 Go runtime 指标）或服务未启动（behavior/product/order），不是看板坏了 ——
   逐条成因记在 `observability/grafana/README.md` 的「未实现 / 当前无数据」

### 下一步核心任务

0. **先清 P0（假成功 + 越权）**，见 §6.1 开头那一组——尤其是把 `CreateOrder` 改成诚实的
   `Unimplemented`、修地址越权与商家审批 SQL。这些的成本远低于新功能，而风险高于新功能
1. **优先实现订单服务核心逻辑**（CreateOrder），这是交易闭环的关键
2. **实现库存服务核心逻辑**（预占、扣减、释放），保障库存一致性
3. **实现支付服务回调处理**，打通支付→订单状态更新链路
4. **完善领域事件驱动**，实现服务间解耦（注意：当前 EventBus 出不了进程，需先接真 MQ）
5. **前端联调核心交易流程**（购物车→结算→下单→支付→订单）
6. **给核心路径补 biz/data/service 层测试**——本轮全部缺陷都在零覆盖路径上

---

## 八、更新日志

| 日期 | 版本 | 更新内容 | 更新人 |
|------|------|----------|--------|
| 2026-08-07 | v1.10 | **新增可观测性方法论与指标基线文档 `observability/OBSERVABILITY.md`（纯文档，无代码/集群改动，完成度不变）**。消化一篇 Prometheus 方法论文章并适配本仓栈（OTel→VictoriaMetrics/Loki/Jaeger，非裸 Prometheus）：三支柱分工与排障动线（Metrics 发现→Trace 定位→Logs 看错误）；RED 看服务（错误率必须画**比率**、延迟看 p50/p95/p99 不看均值）、USE 看资源（饱和度先于利用率报警，「故障常是池子满了不是数据库挂了」）；逐服务最低指标配置（RED、Goroutine/GC/Heap、pgx pool wait、Redis 命中率与 DB QPS 联动看板、Kafka Lag 随首个 consumer 同步上线）；第一批 7 条告警清单（当前告警为 0 是最大窟窿）；采集判据「指标异常时答不出该做什么的不采」。6 条硬规则全部来自本仓已核实教训：唯一标签防 config 撞名混合值、基数上限前置（net_peer_port 前科）、凭据不入日志（SignIn token 前科）、告警用注入故障实测验收（VPA/consul「配置在骗人」两次前科）、监控随功能同一 PR。落地对接 `DEVOPS.md` 阶段 3。**同日补齐检索入口**：`DEVOPS.md` 与本文件按就近原则保留原位（仓库根 / `observability/`），在 `context/INDEX.md` 新增「工程体系文档」段登记指向——按 `knowledge-layering.md` 的「同一约束只写一处、其余用链接」执行，修复了此前两份文档不在任何 INDEX 中、只能靠全仓 grep 找到的问题 | - |
| 2026-08-07 | v1.9 | **新增 DevOps 体系设计文档 `DEVOPS.md`（纯文档，无代码/集群改动，完成度不变）**。以 Three Ways/CALMS/DORA 为骨架，核心取向是「DevOps 边界对齐 DDD 限界上下文」与「修产出系统而非逐服务打补丁」（吃 11 服务同构性的乘数效应）。含现状盘点（与 TODO「基础设施与工程化」表对齐）和四个待实现阶段：①可重复构建（CI 模板化/路径触发/buf breaking/镜像禁 latest+trivy）②可重复交付（GitOps 全链路/同 digest 晋级/migration 流水线/副本策略按集群现实分型——单副本+node2/node3 可调度+存储钉 node3）③看得见（OTel 全链路/`service.namespace` 唯一标签解 config 撞名/SLO+错误预算）④快而不破（契约测试常态化/DORA 自动采集/gitleaks/NetworkPolicy）。验收标准一律取实测行为而非配置表面状态（VPA min-replicas、consul deregister 钳制两次教训的沉淀）。**状态：等待实现**，实现时逐项回填 TODO 与本表 | - |
| 2026-08-07 | v1.8 | **harness 瘦身 + 结构性约束沉降为 CI 门禁（业务代码零改动）**。参照 Anthropic/OpenAI 的「减法」prompting 指引做了一轮：①AGENTS.md（根 + ecommerce 两份同步）「项目速览」改为「反直觉约定」，删掉读代码即可发现的技术栈/架构复述；硬规则 #1 从路径规定（「按 INDEX 逐层缩小」）改写为冲突裁决判据（真相源优先）；新增硬规则 #6：不可逆动作（commit/push/合入/deploy/仓外写删）只能由用户明示触发，subagent 永不执行。②新增 `backend/structcheck/` 结构性测试，随 `go test ./...` 进 CI：matrix↔服务目录双向对齐、matrix 内部一致性、matrix↔网关实际接线、10 服务 `internal/pkg` 同构性（服务名归一化后比对）。**实测发现基础设施副本已真实漂移 14 个文件**——`registry/consul.go` 8 个变体（address 的 Consul check 空指针防护没同步到其余服务）、`log/log.go` 4 个变体——全部记入 `homogeneity_baseline.txt` 棘轮基线：新漂移即红、收敛后删行、清空后删基线。③PROGRESS/TODO 分工与「先回扫代码再声称完成」口径成文进 `context/harness-framework/progress-and-todo.md`，两级 INDEX 已更新 | - |
| 2026-08-07 | v1.9 | **新增统一可执行 runbook `context/team/runbook.md`**,把项目的规则与限制命令化,供 Codex 等 CLI 直读直跑(动手前必读的限制 + 提交前验收锚点 `go build/vet`·`structcheck -count=1`·`go test -short`·`pnpm ready`·`verify-freeze` + 冻结/双审/提交流程)。**非新真相源**,冲突以 `context/`/`.service-matrix.yaml`/`TODO.md` 为准。因 Codex 只自动读 AGENTS.md,两份 AGENTS.md(根+ecommerce,已同步)内联 5 条锚点命令 + 指针,并挂进 `context/team/INDEX.md`。无业务代码改动 | - |
| 2026-08-07 | v1.8 | **新增冻结验收集门禁(Frozen Nodes),给 Graph Engineering 多闭环工作流补上「改考题必须走审批」这道防线**。三件套焊进仓库:`scripts/freeze.sh`(把一组验收测试的内容哈希锁进 `.freeze/<feature>.sha256`+`.meta`)、`scripts/verify-freeze.sh`(比对工作区与清单,DRIFT/MISSING 即退出码 1)、CI `.github/workflows/freeze-check.yml`(每个 PR/分支 push 跑 `--all`,与只在 tag 触发的 `backend.yml` 分开)、`.github/CODEOWNERS`(把 `/.freeze/` 与三个脚本本身的改动指给人工/CC 审批)、`.freeze/README.md`(机制说明)。两层防线:CI 拦「偷改测试但没刷新清单」的静默漂移,CODEOWNERS + `/adversarial-review`「diff 动测试即标红」拦「明改」。脚本兼容 bash 3.2(macOS,去掉了 mapfile)与 ubuntu(sha256sum/shasum 双回退),已用真实测试文件自测 OK/DRIFT/MISSING/空目录四态、`bash -n` 语法过。**无业务代码改动**。**已经 PR #1 合入 `github.com/lens077/ecommerce` 的 main**(CI `verify-freeze` 在 PR 上跑绿),并对 main 加了分支保护:必需状态检查 `verify-freeze`(strict)、code-owner 审批已开(改 `/.freeze/` 与脚本需批)、`enforce_admins=false`(单人仓保留 admin 兜底,不锁死);同时补了 GitLab 侧等价的 `.gitlab-ci.yml` freeze-check job。**注意本仓 origin 是 GitLab、另有 github remote,这套 GitHub 门禁仅对 github remote 生效;`.gitlab-ci.yml` 需该分支推到 GitLab 才在 GitLab 侧起效**。单人仓下 code-owner 审批要有第二个身份(协作者/bot)才真正强制,否则你作为 admin 始终能兜底 | - |
| 2026-08-06 | v1.7 | **可观测性「统一关联底座」对抗评审（本次无任何代码/集群改动,只出报告）**。用集群真实数据(node101/102/103,kubectl + port-forward curl)+ 三仓源码,双模型独立对抗评审(隔离 Claude 子代理 + Codex,逐条由编排者核实)验证「指标/日志/链路/事件/变更统一采集·存储·查看·分析」这一目标是否达成。**结论:未达标,断裂是系统性的**。全文见 `observability/OBSERVABILITY_REVIEW_20260806.md`。关键实测:①`ecommerce` 命名空间 0 Pod,ArgoCD 只管一个 vpa(OutOfSync),应用遥测源当前完全不存在;②Jaeger `api/services` 只有 `badger-migration-e2e`/`jaeger`——应用链路面为空;③Loki 所有流的 `k8s__pod_name` 等标签是坏字面量 `.pod_name`,日志无法按 pod 下钻(与 TODO §236 同一 bug,已实测确认仍未修);④VM 里 `service_name` 只有 cart/config/user-identity 三个,web_vitals 指标为 0;⑤事件/变更两维从未进面(无 kube-state-metrics/event-exporter);⑥Grafana `common.py` 无 Jaeger 数据源、全仓零关联配置(derivedField/tracesToLogs/exemplar 全无)。**新查出的确认缺陷**:fluent-bit 手机号脱敏用了 Lua 不支持的 `{3}` 量词=空操作 + `Keep_Log On` 保留原始明文(PII 双漏)、脱敏只碰 email/phone 两键漏掉 payment 的 form_data、RUM 与后端无 traceparent 无 join key、网关 5xx 因无传输层 error 被记成 span OK/日志 INFO、免鉴权入口 `x-md-global-user-id` 可伪造身份、「DB 错误率」面板画的是错误/秒不是比率、节点覆盖统计阈值 ≥2 已与「collector 现在 3 节点全跑」的实况矛盾、核心存储全单副本无 HA、MinIO 凭据明文进 Git。**证据订正**:上一轮说「基础设施盘 Loki 面板只能看到 0.05% 流」方向反了——`service_name="kube-logs"` 匹配得上主体。业务侧完成度未变 | - |
| 2026-08-06 | v1.6 | **对抗评审后的虚报订正（本次无任何代码改动，只订正文档）**。一次双模型独立对抗评审（隔离的 Claude 子代理 + Codex，逐条由编排者对照代码核实）在四份文档中查出 22 条与代码不符的声明，**全部 CONFIRMED、0 条被推翻**，全文见 `ADVERSARIAL_REVIEW_20260806.md`。本表的订正：①**新增本表口径说明**——「已实现接口」此前混用了「proto 已挂载」和「调用会成功」两种含义，是多项虚高的根因，现明确返回假成功或 panic 的方法按未实现计；②库存从「⚠️ 接口定义 15%」改为「❌ 不可用 5%」——`Reserve` 有四处叠加缺陷（版本号比对未来值→WHERE 永不命中、丢弃 execrows、扣减量语义颠倒、错误变量传错致吞错）导致**返回成功但库存分毫未动还写假流水**，`ReleaseReserve` 是 panic 桩；③订单 30%→20%，`CreateOrder` 不是「为空」而是**丢弃请求体返回假成功**，且结算页已真实接线——用户会看到「下单成功」但系统里没有订单，`CompleteOrder` 的 `SaveOrder` 只打日志不落库却照发事件；④购物车 80%→45%，`AddProductToCart` 因 `shop_name NOT NULL` 缺列对任何新商品必然失败，`UpdateCartItemQuantity` 的 Params 根本没有 Quantity 字段；⑤地址 90%→70%，功能虽全但**全线越权**（无 user 归属校验 + 网关整段放行）；⑥商家 40%→20%，`ApproveApplication` 的 SQL **没有 WHERE 子句**（批准一份=批准全部），Reject/Activate 是 panic 桩；⑦支付「仅透传/逻辑注释掉」订正为**5 个方法全部显式 `Unimplemented`**（TODO 的描述才是对的）；⑧**补入此前完全缺席的 behavior 服务**；⑨消息队列 20%→5%，go.mod 里没有任何 Kafka 依赖，EventBus 是进程内总线；⑩前端页面表多处当天即过期——首页已不是重定向、分类页是 9 行占位桩、`/coupons` 路由根本不存在、购物车的删除/改数量只改本地 store、结算页状态与代码方向相反；⑪§5.2 的「错误处理规范已建立」降为「已定义待落实」（订单服务两层都违反）；⑫用户服务补记 `SignIn` 把 access token 打进 debug 日志。完成度：后端 35%→25%、前端 40%→30%、整体 37%→28%——**下调来自订正虚报，不是功能倒退**。§6.1 新增 P0 清单（假成功与越权 13 项），优先级高于所有新功能 | - |
| 2026-07-26 | v1.0 | 初始进度表创建，梳理整体项目进度 | - |
| 2026-07-26 | v1.1 | 深入抽查订单/支付/库存/商品服务 biz 层，修正完成度评估，新增业务逻辑详情 | - |
| 2026-08-06 | v1.5 | 继续降日志量，并**发现 CDC 完全没在跑**。fluent-bit 再排除 `elastic-system`（20.5%，单行 1508B）与 `openebs`（15.8%）两个命名空间 —— 按命名空间而非 pod 名排除，pod 名带哈希会失配；两个命名空间的构成已确认（前者只有 elastic-operator，后者只有 lvm-localpv 驱动）。用同一方法同窗长（2min）测三个时点：改动前 21.37 → 第一轮后 14.96 → 现在 **6.53 MiB/h**，**累计 −69.4%（原来的 1/3.3）**；上一版记的「6%」是拿粒度过粗的 volume API 算的，作废。**更重要的发现**：排到第三名 `my-connect-cluster-connect-0`（19.9%）时才看出 Debezium CDC 一直是死的 —— `CrashLoopBackOff`、**重启 484 次**、启动 4 秒即 `OOMKilled`，所以那些日志不是 CDC 数据而是同一段启动日志重复 484 遍。两个独立成因：Connect 的 `spec.resources` 完全没设（BestEffort，被 node3 内核 OOM-killer 选中，有 `SystemOOM victim process: java` 事件）且 JVM 无 `-Xmx`；以及 `binary.handling.mode: utf8` 是非法值，Debezium 从 2026-06-09 起就以 400 拒绝该 connector。修法待确认（详见 TODO） | - |
| 2026-08-06 | v1.4 | **断开日志平面的自我放大回路**。先纠正前提:Loki 不是资源大户（`kubectl top` 下 loki-0 仅 186Mi/13m，全集群内存第 13；真正的大户是 elasticsearch 1679Mi、cilium ×3 各约 1Gi、apiserver 1035Mi）。写入侧才是问题:近 24h 有 **99.9%** 的量来自 fluent-bit 采的容器日志，业务服务只占 0.05%；按 pod 归类后发现 fluent-bit 33.8% + loki-0 17.7% + VPA 29.7% 全是可观测性/平台在自我记录，且存在「查 Loki → Loki 打日志 → 被采回 Loki」的回路。五项改动全部落地:fluent-bit `Print_Status false` + `Exclude_Path` 排除自己与 loki、Loki `log_level warn`、VPA recommender/updater 降到 `--v=1`、给 loki StatefulSet 建 `updateMode: Off` 的 VPA（原先只有盯 nginx 网关的那个，会 OOM 的 StatefulSet 反而没纳管）。**如实记效果**:回路确实断了（fluent-bit 与 loki-0 已完全不再写入 Loki），但稳态日志量只从 12.01 降到 11.29 MiB/h（约 6%），**远低于我预估的 1/5** —— 预估错在拿一个 5 分钟、被截断、且在自己密集查询期间取的样本外推 24h 字节量。真实价值在消除查询压力下的放大（即 OOMKill 的机制），不在稳态降量。改完后大头是 elastic-operator 20.5%、openebs 15.8%、kafka-connect 14.4%，均不在本轮范围。顺带修掉一个潜伏坑:fluent-bit 镜像原先靠手工 patch、从未进 values，任何 helm upgrade 都会冲回不可达的 registry —— 我这轮正好踩爆一次（node2 采集中断约 4 分钟），已钉进 values | - |
| 2026-08-06 | v1.3 | **修掉 Loki 每 8 小时被 OOMKill**（55 天内 25 次，exit 137）。两个成因叠加：内存上限只有 512Mi（空载已占 344Mi）且 `requests==limits` 是 Guaranteed，一超即杀；`limits_config` 没有任何查询护栏，`tsdb_max_query_parallelism` 默认 128 —— 一条 range query 扇出 128 个并发子查询，把单进程内存顶穿。修法是砍查询峰值为主（并行度 →8、`max_chunks_per_query` →200000、split →1h）、内存为辅（requests 保持 512Mi 不动、limits →1Gi 转 Burstable）—— 因为 node3 的内存 requests 已占 99%、且 PV 是 `openebs-lvmpv` 硬钉在 node3，既不能提 requests 也不能换节点。改的是 node101 上的 helm values（已备份，revision 1→2）。验证：restarts 归 0、四条护栏逐条核对生效、连打 3 次 OOM 前那种查询全部 200 且不重启、push 5xx 归 0。顺带把基础设施盘刷新 1m→5m（那条 `{service_name=~".+"}` 单次要扫 87MB/7.7 万行，1 分钟一次地打一个 1Gi 的单进程 Loki 不划算） | - |
| 2026-08-06 | v1.2 | 可观测性一轮改造。**修好跨服务 trace 断链**（otelconnect 默认 `WithNewRoot()` 把上游 context 降级成 link，网关与服务在 Jaeger 里是两条独立 trace，11 个服务加 `WithTrustRemote()`）；**11 份 otel.go 收敛为一份基线**并修 7 处（`ParentBased` 采样器 + 采样率/导出间隔可配、`service.instance.id`、semconv 运行时属性、`SetErrorHandler`、gzip、删 150 行 option 样板）；**RPC 指标基数失控**（`net_peer_port` 按 TCP 连接取值 → `rate()` 恒为 0，请求率/错误率/P95 算的都是错值，加 `WithoutServerPeerAttributes()`）；**pgx span 名**改取 sqlc 查询名；**semconv 跟上 sdk v1.45**（不改则 11 个服务启动即失败，靠上一轮埋的 `SchemaURL` 断言拦住）；**看板搬入本仓** `observability/grafana/` 并拆出基础设施盘，搬时逐条拿 VM 实测校对、修 5 处指标名/口径错误（含错误率零错误时画成空图）。业务侧完成度未变 | - |
