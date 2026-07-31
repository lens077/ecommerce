# 项目实现进度与待办

> 依据 `README.md` 的目标与 `Design.md` 的架构设计，对照当前代码实现整理。
> 图例：✅ 已完成　🟡 部分完成（有核心能力，仍有缺口）　⬜ 未开始

---

## 一、实现进度对照

### 1. 基础设施与工程化

| 项目 | 状态 | 说明 |
|------|------|------|
| 容器化（Docker） | 🟡 | 各服务 Dockerfile / compose 就绪，镜像构建规范见 Design.md |
| Kubernetes 编排 | 🟡 | `helm/`、`application-vpa.yml` 已有，集群级压测/弹性未验证 |
| GitOps（ArgoCD） | 🟡 | `argocd-app.yml`、`argocd-proj.yml` 已配置 |
| CI/CD（GitHub Actions） | 🟡 | `.github/workflows/backend.yml`、`frontend.yml` 已有，制品推送/清单更新链路待完善 |
| 注册发现（Consul） | 🟡 | `consul-kv.json`、配置中心接入已有 |
| 提交规范（husky + cz-git） | ✅ | `.husky/` 已配置 Conventional Commits |
| 代码规范（biome） | 🟡 | 前端已用，未全量接入门禁 |

### 2. 后端微服务（核心）

| 服务 | 状态 | 已实现 RPC | 主要缺口 |
|------|------|-----------|----------|
| 用户认证 user | 🟡 | `SignIn`、`UserProfile` | 令牌刷新、登出、多端会话、第三方登录适配 |
| 商品 product | 🟡 | `GetProductDetail`（SPU/SKU） | 商品列表/分页、上下架、类目/品牌管理、`ProductChangedEvent` 同步 ES |
| 购物车 cart | ✅ | `GetCart`、`GetCartSummary`、`AddProductToCart`、`RemoveCartItem`、`UpdateCartItemQuantity` + MinIO 缩略图 URL | 选中态服务端持久化（如需） |
| 订单 order | 🟡 | `CreateOrder`(桩)、`CompleteOrder` | **`CreateOrder` 主体待实现**（幂等/核价/拆单/取地址快照/同步 Reserve/事务落库）；proto 待补 `CreateOrderRequest.requestId`(幂等键) 与 `CreateOrderResponse.orderNo/payAmount/payDeadline`；订单查询/列表、取消、状态机、`OrderCreated/Paid/Cancelled` 事件 |
| 支付 payment | 🟡 | `CreatePayment`、`GetPaymentStatus`、`HandlePaymentNotify`、`HandlePaymentCallback`（支付宝/微信） | 退款、幂等/验签加固、每日对账、`PaymentRefundedEvent` |
| 库存 inventory | 🟡 | `Reserve`、`ReleaseReserve` | 扣减确认/回补、库存流水与对账、不足预警事件、Redis 分布式锁 |
| 搜索 search | 🟡 | `Search`（ES + OTel） | CQRS 读写分离、商品数据实时同步、聚合筛选/智能排序、热门词 |

### 3. 后端微服务（支撑）

| 服务 | 状态 | 已实现 | 主要缺口 |
|------|------|--------|----------|
| 地址 address | ✅ | CRUD + `SetDefaultAddress` + `ListAddresses` | — |
| 商家 merchant | 🟡 | 入驻申请生命周期（`Submit/Approve/Reject/Get/Activate`） | 店铺信息管理、商品运营权限、发货/售后、结算账单 |
| 履约 fulfillment | ⬜ | — | 发货/物流轨迹、第三方物流对接、售后履约 |
| 结算 settlement | ⬜ | — | 佣金计算、结算单、财务对账 |
| 营销 marketing | ⬜ | — | 优惠券、满减、秒杀、会员/积分 |
| 数据分析 analytics | ⬜ | — | 指标计算、行为分析、经营报表 |

### 4. 网关与 RBAC

| 项目 | 状态 | 说明 |
|------|------|------|
| 网关（身份验证/授权/路由守卫） | 🟡 | `gateway/` 已实现，集中式 Casdoor 鉴权 + 策略文件 |
| RBAC 三角色（消费者/商家/管理员） | 🟡 | 策略模型（model.conf/policies.csv）已有，细粒度权限校验待补齐 |
| Casdoor 集成 | 🟡 | 登录/令牌解析打通，权限适配持续完善 |

### 5. 前端

**consumer（消费者端）**

| 页面 | 状态 | 说明 |
|------|------|------|
| 首页 `index` | 🟡 | 骨架/静态，未接商品列表 API |
| 分类 `categories` | 🟡 | 静态，未接类目 API |
| 商品详情 `product/$spuCode` | ✅ | 已接 `GetProductDetail`（SPU/SKU） |
| 购物车 `cart` | ✅ | 已接购物车 API；本次修复间距 8× 问题并重构紧凑布局 |
| 结算 `checkout` | 🟡 | 已重写：接选中项(useCart 真实 `cart_item_id`)、地址弹层选择+新增(AddressService)、防重 `requestId`、下单调用(`api/order`)；运费恒 0、去优惠券、统一 `sp[]`。待后端补 `CreateOrderRequest.requestId` 与 `CreateOrderResponse.orderNo` 后接通 |
| 订单列表/详情 `orders` | 🟡 | mock 数据，未接订单查询 API |
| 支付结果 `payment/result` | 🟡 | 未接支付状态查询 |
| 个人中心 `profile` | ✅ | 已接真实 API |
| 收货地址 `profile/addresses` | ✅ | 已接 AddressService |
| 登录回调 `callback` | ✅ | Casdoor 登录回调打通 |

**merchant（商家端）** — ⬜ 仅路由骨架（`index/orders/products/reports/settings`），无 `api/` 目录、未接后端

**admin（管理员端）** — ⬜ 仅路由骨架（`index/users/merchants/products/orders/categories/reports/settings`），无 `api/` 目录、未接后端

### 6. 可观测性与测试

| 项目 | 状态 | 说明 |
|------|------|------|
| 链路追踪（OpenTelemetry/Jaeger） | 🟡 | 服务端 `otelhttp` 中间件、ES OTel 传输已接入 |
| 日志（Loki/fluent-bit） | ⬜ | 部署与采集链路未落地 |
| 指标（VictoriaMetrics/Grafana） | ⬜ | 采集/看板未落地 |
| 前端测试（playwright + vitest） | ⬜ | 仅 `vite.config.ts`，缺用例 |
| 后端单元/集成测试 | ⬜ | 覆盖率低 |

---

## 二、订单分布式一致性方案（已定）

下单跨服务事务采用 **混合模式**，不引入 Seata（Java 生态，Go 栈不适配）：

1. **可靠投递底座（必选）**：本地事务 + **Outbox 表 + Kafka**。写订单与写 outbox 同一事务，独立 relay 投递，杜绝"落库成功但事件丢失"的双写问题。
2. **A 段·建单↔库存预占（强一致 + 快反馈）**：建单事务内 **同步 RPC 调 `inventory.Reserve`**（即 TCC 的 Try），预占成功才建单成功，用户即时得到"库存不足"反馈；`inventory` 现有 `Reserve`/`ReleaseReserve` 天然是 Try/Cancel，支付成功后的确认扣减为 Confirm。
3. **B 段·建单后→支付→履约/营销（最终一致）**：走 **编舞式 Saga（Choreography）**。经 Outbox 发 `OrderCreated`；支付回调发 `OrderPaid`（库存 Confirm、订单转已支付）；取消/超时发 `OrderCancelled`（库存 `ReleaseReserve` 补偿）。

编舞 Saga 的四项治理（必须随事件驱动一起落，否则流程失控）：

- [ ] **幂等消费**：consumer 以 `order_no`/事件 ID 去重（消息至少投递一次语义）
- [ ] **显式补偿事件**：`StockReserveFailed → 订单自动取消` 等补偿作为一等公民设计，不散落
- [ ] **状态即真相**：`order_status` 作为"这单走到哪"的唯一可见状态，弥补编舞流程不可见
- [ ] **超时兜底 job**：扫 `pay_deadline` / 卡在中间态的订单做补偿或告警（编舞无中心，必须有 backstop）
- [ ] **全链路 trace_id**：事件贯穿 `trace_id`，靠 Jaeger/OTel 追踪定位

---

## 三、近期待办（按优先级）

先打通「消费者核心交易闭环」，再向商家/管理端与非核心能力扩展。

- [ ] **订单服务**：补 `GetOrder` / `ListOrders` / `CancelOrder` RPC 与订单状态机（带守卫的状态迁移 + `order_log`）
- [ ] **一致性底座**：落 Outbox 表 + Kafka relay，替换现有进程内 `GoEventBus`（跨服务事件当前到不了其他服务）
- [ ] **建单全链路**：cart 补"按 CartItemIds 取选中项"RPC → 取商品/地址快照 → 拆单 → 事务落库 group/order/item → 同步 `Reserve` → 清空购物车
- [x] **consumer 结算页（前端）**：已接选中项/地址弹层选择+新增/防重 requestId/下单调用，去优惠券、运费恒 0、统一 sp[]；生成 `api/order` 客户端并在 `gen/api` 导出 order
- [ ] **consumer 结算页（待后端联通）**：后端补 `CreateOrderRequest.requestId`、`CreateOrderResponse.orderNo` 并 `make api` 后，提交订单接真实响应、跳真实支付页（现为固定 `/payment/result` 占位）
- [x] **购物车 cart_item_id 修复（前后端已闭环）**：后端 `AddProductToCart` SQL 改 `RETURNING id`、`AddProductToCartResponse` 增 `cart_item_id`（proto/biz/data/service 已改，`make api` 已跑，`make sqlc` 需在有 DB 的环境重跑以校验，手写已对齐）；前端 `store/cart.ts` 删除伪造 ID、`useCart` 从 `GetCart` 取真实 ID、`api/cart` 乐观新增改用后端返回的真实 `cart_item_id`
- [ ] **consumer 订单页**：订单列表/详情接真实查询 API，替换 mock
- [ ] **支付闭环**：`payment/result` 接支付状态查询 + 回调后订单状态同步（订单订阅 `OrderPaid`）
- [ ] **库存联动**：下单同步 `Reserve`（TCC-Try），支付成功确认扣减，取消/超时 `ReleaseReserve`
- [ ] **商品服务**：补商品列表/分页 RPC，接首页与分类页
- [ ] **领域事件**：引入 Kafka，落地 `OrderCreated/OrderPaid/OrderCancelled` 事件驱动（编舞 Saga）
- [ ] **订单缺陷修复**：金额改 `decimal`（现为 `float64`）、修 `AddressPostalCode` 空指针、统一 `merchant_id` 类型（UUID）、`Complete()` 应要求已发货
- [ ] **merchant 端**：新增 `api/` 客户端，接商家入驻/商品/订单
- [ ] **admin 端**：新增 `api/` 客户端，接商家审核/用户/类目管理
- [ ] **RBAC**：补齐三角色细粒度权限校验与网关策略
- [ ] **测试**：补 consumer 关键路径 playwright/vitest 用例、后端核心 biz 单测
- [ ] **可观测性**：落地 Loki 日志采集、VictoriaMetrics + Grafana 指标看板
- [ ] **技术债**：修复 `product/$spuCode.tsx:156` 的 `shopName` 类型报错；清理其余 mock 数据

---

## 四、实施路线

### 分阶段迭代实施策略

采用敏捷迭代模式，先核心后扩展，分四个阶段落地，保障业务快速闭环，同时控制技术风险：

第一阶段：核心业务 MVP

- 核心目标：完成电商核心交易闭环，实现可上线的最小可用版本
- 核心工作：
  1. 完成基础设施搭建：Kubernetes 集群、PostgreSQL 集群、Redis 集群、Kafka、可观测性组件部署
  2. 落地 6 个核心微服务：认证服务、商品服务、订单服务、支付服务、库存服务、搜索服务
  3. 完成核心交易流程：商品浏览→下单→支付→订单状态同步全流程打通
  4. 前端用户端核心页面开发：商品详情、购物车、下单、支付、订单列表
- 交付成果：可上线的 MVP 版本，支持用户完成完整的购物流程

第二阶段：商家与平台能力落地

- 核心目标：完成 B2B2C 平台核心能力，支持商家入驻、运营，平台管理
- 核心工作：
  1. 落地商家服务、履约服务、结算服务三个扩展微服务
  2. 完成商家后台开发：商品管理、订单履约、售后处理、财务结算
  3. 完成平台管理后台开发：商家审核、类目管理、订单仲裁、平台配置
  4. 完善 RBAC 权限体系，实现商家、管理员的细粒度权限管控
- 交付成果：完整的 B2B2C 平台版本，支持商家入驻运营，平台统一管理

第三阶段：性能优化与高可用加固

- 核心目标：优化系统性能，完善高可用架构，支撑高并发流量
- 核心工作：
  1. 全链路压测，优化慢查询、性能瓶颈，达到预设的 QPS/TPS 目标
  2. 完善多级缓存架构，提升缓存命中率，降低数据库压力
  3. 完善限流熔断、弹性扩缩容机制，应对流量波动
  4. 完善可观测性体系，补全监控指标、告警规则、链路追踪
- 交付成果：高性能、高可用的生产级版本，可支撑大促峰值流量

第四阶段：营销与扩展能力落地

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
