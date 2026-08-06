# 电商项目进度表

> 最后更新：2026-08-06
> 当前阶段：第一阶段 - 核心业务 MVP（中期）
> 整体完成度：约 37%
> 更新说明：可观测性一轮改造落地（原属第三阶段，提前完成主体）。业务侧完成度未变 ——
> 本次全部改动都在可观测性/基础设施层，`CreateOrder` 主体、payment 桩实现等核心缺口依旧。
> 细节见 `TODO.md` 的「6. 可观测性与测试」，本文件只记结论与完成度。

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

| 微服务 | 规划阶段 | 当前状态 | 已实现接口 | 核心业务逻辑 | 完成度 |
|--------|----------|----------|------------|--------------|--------|
| **用户认证服务** | 第一阶段 | ✅ 核心完成 | SignIn、UserProfile | 已实现 | 70% |
| **商品服务** | 第一阶段 | ⚠️ 接口定义 | GetProductDetail | 仅透传调用，无业务逻辑 | 25% |
| **订单服务** | 第一阶段 | ⚠️ 架构搭建 | CreateOrder、CompleteOrder | CompleteOrder 已实现，CreateOrder 为空 | 30% |
| **支付服务** | 第一阶段 | ⚠️ 接口定义 | CreatePayment、GetPaymentStatus、HandlePaymentNotify、HandlePaymentCallback | 仅透传调用，核心逻辑注释掉 | 20% |
| **库存服务** | 第一阶段 | ⚠️ 接口定义 | Reserve、ReleaseReserve | 仅透传调用，模型为空 | 15% |
| **搜索服务** | 第一阶段 | ⚠️ 接口定义 | Search | 仅透传调用 | 20% |
| **购物车服务** | 第一阶段 | ✅ 核心完成 | AddProductToCart、RemoveCartItem、UpdateCartItemQuantity、GetCart | 已实现 | 80% |
| **地址服务** | 第一阶段 | ✅ 完整实现 | CreateAddress、UpdateAddress、DeleteAddress、GetAddress、ListAddresses、SetDefaultAddress | 已实现 | 90% |
| **商家服务** | 第二阶段 | ⚠️ 入驻完成 | SubmitApplication、ApproveApplication、RejectApplication、GetApplication、ActivateMerchant | 已实现入驻流程 | 40% |
| **履约服务** | 第二阶段 | ❌ 未开始 | - | - | 0% |
| **结算服务** | 第二阶段 | ❌ 未开始 | - | - | 0% |
| **营销服务** | 第四阶段 | ❌ 未开始 | - | - | 0% |
| **数据分析服务** | 第四阶段 | ❌ 未开始 | - | - | 0% |

**后端整体完成度：约 35%**

### 2.1 核心服务业务逻辑详情

#### 订单服务 (`backend/services/order/internal/biz`)
- ✅ **DDD 架构**：领域实体（OrderGroupRoot、OrderRoot、OrderItem、OrderLog）完整定义
- ✅ **领域事件框架**：事件发布机制已搭建，支持 OrderCompleted 事件
- ⚠️ **CreateOrder**：方法框架存在，但核心业务逻辑（购物车校验、库存预占、金额计算、订单保存）未实现
- ✅ **CompleteOrder**：领域驱动实现，包含状态校验、事件发布
- ❌ **PayOrder / ShipOrder**：方法框架存在，业务逻辑为空

#### 支付服务 (`backend/services/payment/internal/biz`)
- ✅ **数据模型**：Payment、Notification、回调请求/响应结构完整
- ⚠️ **核心方法**：CreatePayment、GetPaymentStatus、HandlePaymentNotify 等仅做仓储透传
- ❌ **支付回调处理**：注释中包含完整逻辑（状态更新、订单通知），但实际未启用

#### 库存服务 (`backend/services/inventory/internal/biz`)
- ⚠️ **数据模型**：InventoryInfo 为空结构体，ReserveRequest/Response 定义完整
- ❌ **业务逻辑**：Reserve、ReleaseReserve 仅做仓储透传，无库存校验、扣减逻辑

#### 商品服务 (`backend/services/product/internal/biz`)
- ✅ **数据模型**：ProductSpu、ProductSku、ProductSpuDetail 完整定义
- ⚠️ **核心方法**：GetProductDetail 仅做仓储透传，无数据组装、缓存逻辑

---

## 三、前端应用进度

| 应用 | 规划阶段 | 当前状态 | 已实现页面 | 完成度 |
|------|----------|----------|------------|--------|
| **消费者端 (Consumer)** | 第一阶段 | ✅ 页面框架完成 | 首页、商品详情、分类、购物车、结算、订单列表、订单详情、支付结果、个人中心、地址管理、优惠券、登录回调 | 60% |
| **商家端 (Merchant)** | 第二阶段 | ⚠️ 框架搭建 | 订单、商品、报表、设置（基础结构） | 20% |
| **管理后台 (Admin)** | 第二阶段 | ⚠️ 框架搭建 | 分类、商家、订单、商品、报表、用户、设置（基础结构） | 20% |

**前端整体完成度：约 40%**

### 3.1 消费者端页面详情

| 页面 | 路径 | 状态 | 联调状态 | 备注 |
|------|------|------|----------|------|
| 首页 | `/` | ✅ 已完成 | N/A | 重定向至分类页 |
| 商品详情 | `/product/$spuCode` | ✅ 已完成 | ✅ 已联调 | 属性选择、SKU 切换、加入购物车、骨架屏 |
| 分类页 | `/categories` | ✅ 已完成 | ⚠️ 部分联调 | 商品分类浏览 |
| 购物车 | `/cart` | ✅ 已完成 | ✅ 已联调 | 商家分组、全选、数量调整、删除、响应式布局 |
| 结算页 | `/checkout` | ✅ 已完成 | ❌ 未联调 | 使用模拟数据，提交订单未对接后端 |
| 订单列表 | `/orders` | ✅ 已完成 | ❌ 未联调 | 订单状态分类展示，数据未对接后端 |
| 订单详情 | `/orders/$orderId` | ✅ 已完成 | ❌ 未联调 | 订单明细查看，数据未对接后端 |
| 支付结果 | `/payment/result` | ✅ 已完成 | ❌ 未联调 | 支付成功/失败展示，数据未对接后端 |
| 个人中心 | `/profile` | ✅ 已完成 | ⚠️ 部分联调 | 用户信息展示 |
| 地址管理 | `/profile/addresses` | ✅ 已完成 | ⚠️ 部分联调 | 地址增删改查、设为默认 |
| 优惠券 | `/coupons` | ⚠️ 基础页面 | ❌ 未联调 | 功能待完善 |
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
| **API 网关** | 第一阶段 | ✅ 完整实现 | Consul 服务发现、JWT 认证、RBAC 权限、限流熔断、CORS、日志、链路追踪、协议转换、重试 | 85% |
| **服务注册发现** | 第一阶段 | ✅ 已实现 | Consul 集成 | 90% |
| **可观测性** | 第三阶段（提前落地） | ✅ 主体完成 | Trace/Metric/Log 三管道端到端（→ Jaeger / VictoriaMetrics / Loki）；11 个服务 OTel SDK 装配收敛为一份基线（`ParentBased` 采样器 + 采样率可配、`service.instance.id`、`SetErrorHandler`、gzip）；跨服务 trace 已串联（网关→服务实测同一条 trace）；2 张 Grafana 看板（业务盘 + 基础设施盘，脚本生成）。**缺口：告警为 0**（Grafana 0 条规则、无 vmalert/alertmanager）、采集管道自身无监控（`otelcol_*` 未采集）、无 k8s 对象/容器级指标、网关无 meter | 60% |
| **消息队列** | 第一阶段 | ⚠️ 部分集成 | 订单服务 EventBus/Kafka | 20% |
| **缓存层** | 第一阶段 | ⚠️ 基础设施就绪 | Redis 部署配置，业务缓存待完善 | 20% |
| **数据库** | 第一阶段 | ✅ 基础完成 | PostgreSQL + sqlc，各服务 Schema 已建 | 70% |
| **容器化部署** | 第一阶段 | ✅ 基础完成 | Dockerfile、K8s Deployment、Helm Chart（部分） | 60% |
| **CI/CD** | 第一阶段 | ⚠️ 基础配置 | GitHub Actions 工作流 | 40% |

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
- DDD 分层架构（订单服务已完整实现 domain/application 分层）
- 各服务独立 Dockerfile + K8s 部署配置
- 前后端 Monorepo 管理（pnpm workspace）
- 统一的错误处理规范（biz 层定义错误，service 层映射 RPC 错误码）

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

- [ ] **结算页**：对接订单创建接口，替换模拟数据
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
3. **业务逻辑层面**：大部分核心业务逻辑仍未实现（订单创建、支付回调、库存扣减等）
4. **前端层面**：页面框架基本完成，部分页面已联调，核心流程（结算→下单→支付）未打通
5. **可观测性层面**：原属第三阶段，已提前落地主体 —— 三管道端到端、跨服务 trace 串联、
   2 张 Grafana 看板。但**告警仍是 0**，所以现阶段的定位是「出事后能查」，还不是
   「出事时会被告知」。另外看板上不少面板当前是空的，成因是采集侧未实现（网关无 meter、
   11 个服务无 Go runtime 指标）或服务未启动（behavior/product/order），不是看板坏了 ——
   逐条成因记在 `observability/grafana/README.md` 的「未实现 / 当前无数据」

### 下一步核心任务

1. **优先实现订单服务核心逻辑**（CreateOrder），这是交易闭环的关键
2. **实现库存服务核心逻辑**（预占、扣减、释放），保障库存一致性
3. **实现支付服务回调处理**，打通支付→订单状态更新链路
4. **完善领域事件驱动**，实现服务间解耦
5. **前端联调核心交易流程**（购物车→结算→下单→支付→订单）

---

## 八、更新日志

| 日期 | 版本 | 更新内容 | 更新人 |
|------|------|----------|--------|
| 2026-07-26 | v1.0 | 初始进度表创建，梳理整体项目进度 | - |
| 2026-07-26 | v1.1 | 深入抽查订单/支付/库存/商品服务 biz 层，修正完成度评估，新增业务逻辑详情 | - |
| 2026-08-06 | v1.5 | 继续降日志量，并**发现 CDC 完全没在跑**。fluent-bit 再排除 `elastic-system`（20.5%，单行 1508B）与 `openebs`（15.8%）两个命名空间 —— 按命名空间而非 pod 名排除，pod 名带哈希会失配；两个命名空间的构成已确认（前者只有 elastic-operator，后者只有 lvm-localpv 驱动）。用同一方法同窗长（2min）测三个时点：改动前 21.37 → 第一轮后 14.96 → 现在 **6.53 MiB/h**，**累计 −69.4%（原来的 1/3.3）**；上一版记的「6%」是拿粒度过粗的 volume API 算的，作废。**更重要的发现**：排到第三名 `my-connect-cluster-connect-0`（19.9%）时才看出 Debezium CDC 一直是死的 —— `CrashLoopBackOff`、**重启 484 次**、启动 4 秒即 `OOMKilled`，所以那些日志不是 CDC 数据而是同一段启动日志重复 484 遍。两个独立成因：Connect 的 `spec.resources` 完全没设（BestEffort，被 node3 内核 OOM-killer 选中，有 `SystemOOM victim process: java` 事件）且 JVM 无 `-Xmx`；以及 `binary.handling.mode: utf8` 是非法值，Debezium 从 2026-06-09 起就以 400 拒绝该 connector。修法待确认（详见 TODO） | - |
| 2026-08-06 | v1.4 | **断开日志平面的自我放大回路**。先纠正前提:Loki 不是资源大户（`kubectl top` 下 loki-0 仅 186Mi/13m，全集群内存第 13；真正的大户是 elasticsearch 1679Mi、cilium ×3 各约 1Gi、apiserver 1035Mi）。写入侧才是问题:近 24h 有 **99.9%** 的量来自 fluent-bit 采的容器日志，业务服务只占 0.05%；按 pod 归类后发现 fluent-bit 33.8% + loki-0 17.7% + VPA 29.7% 全是可观测性/平台在自我记录，且存在「查 Loki → Loki 打日志 → 被采回 Loki」的回路。五项改动全部落地:fluent-bit `Print_Status false` + `Exclude_Path` 排除自己与 loki、Loki `log_level warn`、VPA recommender/updater 降到 `--v=1`、给 loki StatefulSet 建 `updateMode: Off` 的 VPA（原先只有盯 nginx 网关的那个，会 OOM 的 StatefulSet 反而没纳管）。**如实记效果**:回路确实断了（fluent-bit 与 loki-0 已完全不再写入 Loki），但稳态日志量只从 12.01 降到 11.29 MiB/h（约 6%），**远低于我预估的 1/5** —— 预估错在拿一个 5 分钟、被截断、且在自己密集查询期间取的样本外推 24h 字节量。真实价值在消除查询压力下的放大（即 OOMKill 的机制），不在稳态降量。改完后大头是 elastic-operator 20.5%、openebs 15.8%、kafka-connect 14.4%，均不在本轮范围。顺带修掉一个潜伏坑:fluent-bit 镜像原先靠手工 patch、从未进 values，任何 helm upgrade 都会冲回不可达的 registry —— 我这轮正好踩爆一次（node2 采集中断约 4 分钟），已钉进 values | - |
| 2026-08-06 | v1.3 | **修掉 Loki 每 8 小时被 OOMKill**（55 天内 25 次，exit 137）。两个成因叠加：内存上限只有 512Mi（空载已占 344Mi）且 `requests==limits` 是 Guaranteed，一超即杀；`limits_config` 没有任何查询护栏，`tsdb_max_query_parallelism` 默认 128 —— 一条 range query 扇出 128 个并发子查询，把单进程内存顶穿。修法是砍查询峰值为主（并行度 →8、`max_chunks_per_query` →200000、split →1h）、内存为辅（requests 保持 512Mi 不动、limits →1Gi 转 Burstable）—— 因为 node3 的内存 requests 已占 99%、且 PV 是 `openebs-lvmpv` 硬钉在 node3，既不能提 requests 也不能换节点。改的是 node101 上的 helm values（已备份，revision 1→2）。验证：restarts 归 0、四条护栏逐条核对生效、连打 3 次 OOM 前那种查询全部 200 且不重启、push 5xx 归 0。顺带把基础设施盘刷新 1m→5m（那条 `{service_name=~".+"}` 单次要扫 87MB/7.7 万行，1 分钟一次地打一个 1Gi 的单进程 Loki 不划算） | - |
| 2026-08-06 | v1.2 | 可观测性一轮改造。**修好跨服务 trace 断链**（otelconnect 默认 `WithNewRoot()` 把上游 context 降级成 link，网关与服务在 Jaeger 里是两条独立 trace，11 个服务加 `WithTrustRemote()`）；**11 份 otel.go 收敛为一份基线**并修 7 处（`ParentBased` 采样器 + 采样率/导出间隔可配、`service.instance.id`、semconv 运行时属性、`SetErrorHandler`、gzip、删 150 行 option 样板）；**RPC 指标基数失控**（`net_peer_port` 按 TCP 连接取值 → `rate()` 恒为 0，请求率/错误率/P95 算的都是错值，加 `WithoutServerPeerAttributes()`）；**pgx span 名**改取 sqlc 查询名；**semconv 跟上 sdk v1.45**（不改则 11 个服务启动即失败，靠上一轮埋的 `SchemaURL` 断言拦住）；**看板搬入本仓** `observability/grafana/` 并拆出基础设施盘，搬时逐条拿 VM 实测校对、修 5 处指标名/口径错误（含错误率零错误时画成空图）。业务侧完成度未变 | - |
