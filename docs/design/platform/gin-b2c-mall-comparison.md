# 对照调研：Gin 单体 B2C 商城 vs 本仓

> 2026-08-19 对照快照。对照项目的信息**仅来自一段项目介绍文本**（照录于附录，未见代码与线上系统），
> 涉及其能力的表述一律以「据其介绍」为限。本仓侧事实取自当日的
> [`README.md`](../../../README.md)、[`STACK.md`](../../../STACK.md)、
> [`.service-matrix.yaml`](../../../.service-matrix.yaml)、[`PRODUCT.md`](../../../PRODUCT.md)，
> 实况会随时间漂移，以 [`TODO.md`](../../../TODO.md) 为准。
> 本文回答「两套做法差在哪、对本仓有什么启示」，是调研记录，不是设计决定。

## 对照项目是什么

据其介绍：一个 Go + Gin + GORM + PostgreSQL 的**单体 B2C 商城**，客户端为微信小程序（C 端）
加 UmiJS 4 + Ant Design 6.4 管理后台（B 端），Phase 3 规划 Tauri 供应链中台。
业务上覆盖商品、订单（微信支付 + 快递 100 物流）、退款售后，并配齐一整套营销玩法
（优惠券、秒杀、拼团、砍价、促销、积分、会员等级、推广员分佣），
以及财务、供应、内容、区域、系统配置等运营支撑模块。
架构为 Handler → Service → Model 三层，`routes.go` 集中注册路由并按路径前缀划分权限域。

## 总判断

- **它业务面宽，本仓工程面深**：它把营销、售后、物流、财务、内容全部堆进单体；
  本仓在契约、网关、云原生交付、可观测性上成体系，但功能域只有 10 个基础服务。
- **定位互为镜像**：它是 B2C 流量运营商城，获客靠拼团、砍价、分佣等社交裂变；
  本仓是 B2B2C 平台机制商城（「灯市」），承载靠搜索、类目、推荐（behavior 埋点喂 gorse）。
  一个运营驱动，一个数据驱动。
- **链路完成度此刻它占优**：单体本地事务天然打通「下单 → 支付 → 物流 → 售后」；
  本仓服务间调用尚未接线（详见[第四节](#四对本仓的启示)第 3 条）。

## 一、定位与业务范围

| 维度 | 对照项目（据其介绍） | 本仓 |
|---|---|---|
| 商业形态 | B2C 自营商城，社交裂变获客 | B2B2C 多商家平台，搜索/类目/推荐承载（[`PRODUCT.md`](../../../PRODUCT.md)） |
| 角色与端 | C 端小程序 + B 端管理后台 | consumer / merchant / admin 三角色 RBAC，商家入驻审批是一等公民 |
| 桌面端 | Tauri 供应链中台在 Phase 3 规划中 | Tauri 桌面壳**已落地**（desktop app 套 consumer / merchant） |
| 营销体系 | 优惠券、秒杀、拼团、砍价、促销、积分、会员等级、推广分佣 | **无任何营销域**（10 个服务中无对应项） |
| 售后与履约 | 退款售后、快递 100 物流轨迹 | 退款与对账在 [`payment/payment.md`](../payment/payment.md) 有设计（落地进度以 `TODO.md` 为准）；售后工单、物流轨迹无对应服务 |
| 内容与评价 | 评价评分、图文/视频、文章管理 | 无 UGC 与内容域 |
| 区域数据 | 区域管理（省市区） | address 服务的 `RegionService/ListRegions`（双方都有） |
| 本仓独有 | — | 独立 inventory；search（Meilisearch 查询已迁）；behavior 埋点 + Gorse 推荐；merchant 入驻 |

## 二、技术架构

| 维度 | 对照项目（据其介绍） | 本仓 |
|---|---|---|
| 总体架构 | 单体三层 Handler → Service → Model | 10 微服务 + 同级 control-tower gateway/config，四层 server → service → biz ← data，Fx 装配 |
| API 形态 | Gin REST，`routes.go` 集中注册 | 契约先行：Protobuf + buf.validate，ConnectRPC Go（Connect/gRPC/gRPC-Web 兼容），前端由 Protobuf-ES 生成类型 |
| 数据访问 | GORM，PostgreSQL 连接池限 8 | sqlc（手写 SQL 生成类型安全代码）+ pgx，每服务一个 schema |
| 鉴权 | 应用内 JWT 中间件，按路径前缀分管理端/客户端 | control-tower BFF session + legacy JWT + Casbin RPC 级 RBAC，身份经 `x-md-global-*` 注入下游；数据归属仍由服务校验 |
| 限流 | 应用内 x/time/rate 令牌桶，按接口差异化频控 | 当前 gateway 没有通用限流或熔断；业务防滥用与过载保护都是待设计项 |
| 中间件链 | cors → auth(JWT) → ratelimit → error recovery，应用内编排 | recover → otel → access log → CORS → auth → proxy；默认无重试、无协议转码 |
| 配置 | 应用内「系统配置」模块参数化 | control-tower Config Center（proto Bootstrap + Protovalidate + pg_notify/Watch），是业务服务必需启动依赖 |
| 注册发现 | 不需要（单体） | Consul 仅注册发现，目标迁 K8s Service DNS + Cilium KPR |
| 存储与中间件 | COS + CDN；介绍未提缓存与搜索引擎 | Pigsty PostgreSQL、Dragonfly、Meilisearch、Silo S3-compatible、Gorse；当前 NATS 搜索链，目标 Kafka 主干 |
| 支付渠道 | 微信支付 | 支付宝（smartwalle/alipay） |
| 定时任务 | Goroutine 自实现 SchedulerService | 无统一调度组件（behavior 以内存队列 + `synced_at` 做 outbox 补偿） |
| 输入安全 | bluemonday HTML 消毒防 XSS | buf.validate 结构校验 + React 默认转义；无富文本消毒（当前无 UGC） |
| 管理端前端 | UmiJS 4 + Ant Design 6.4 + umi-presets-pro + keepalive | pnpm monorepo（4 app + 9 包）+ vite-plus + MUI + TanStack Router/Query + Zustand + ConnectRPC/Protobuf-ES |

两侧都用 React 19；差别在组织方式——它按 UmiJS 约定式框架走，本仓自组 monorepo 工具链。

## 三、工程化与交付

对照项目介绍中交付相关的内容只有「构建时注入 Git commit hash」。本仓是完整闭环，且多数无对位物：

- **CI/CD**：GitHub Actions 由 semver tag 触发，Buildx 多架构双推 TCR/GHCR；Harbor 只在 Helm OCI helper 中使用。ArgoCD 当前零 Application，尚无自动同步。
- **可观测性**：OTel 全链路，Vector + VictoriaMetrics/Logs/Traces + Grafana；前端 Web Vitals 经 `telemetry.v1` 汇入指标。
- **结构门禁**：structcheck、`.service-matrix.yaml`、verify-context/canary 与 vite-plus/commitlint；`.freeze` 已删除。

## 四、对本仓的启示

1. **业务级频控与过载保护都是网关的真实缺口。** 两者目标不同：前者限制用户/IP 对敏感 procedure 的滥用，后者保护依赖和容量。应先用压测与失败语义定义阈值、key 和降级方式，再决定实现位置。
2. **UGC 消毒要在评价/图文详情上马前预留。** buf.validate 只管结构约束；
   一旦商家图文详情或用户评价引入富文本，需要 bluemonday 类的 HTML 消毒环节，
   校验层不能替代。
3. **「全链路闭环」是它此刻成立、本仓不成立的宣称。** 本仓 order→inventory/product/address、
   payment→order 均为 `depends_on_planned`，`depends_on` 实测全空（matrix），
   outbox 当前只有 NATS 搜索投影链部分接线，Kafka 目标链尚未开始（`STACK.md` §十）。对照之下，服务协同接线
   （[`order/consistency.md`](../order/consistency.md) 的 Outbox + relay 方案）仍是主线短板。

## 五、对比的局限

- 对照项目信息为单方面介绍文本，无代码、无性能与规模数据可验证；
  「有某能力」不代表其实现质量。
- 介绍未提缓存、搜索、可观测性、CI/CD，是「未提及」而非「确认没有」。
- 本仓侧为 2026-08-19 快照，之后以 `TODO.md` 与 `.service-matrix.yaml` 为准。

## 附录：对照项目介绍原文

> 照录调研输入（仅去除任务指令语句），不作改写。

行业场景
完整 B2C 链路 — 从商品发现、浏览加购、下单支付到物流配送、售后评价，覆盖电商全生命周期。
社交裂变营销 — 支持优惠券发放、限时秒杀、好友拼团、砍价等营销玩法，配合推广员分佣体系实现用户自传播获客。
多端协同运营 — 小程序面向消费者（C 端），管理后台面向运营/财务/客服（B 端），后续扩展供应链中台（Tauri 桌面端）面向供应商/采购（Phase 3）。

功能介绍
商品体系
商品管理（多规格 SKU、上架/下架、排序）、分类树、品牌管理、规格模板、商品标签、评价与评分、收藏、内容（图文/视频）

订单体系
购物车（增删改、选中结算）、订单提交与支付（微信支付）、物流查询（快递 100）、退款售后、订单状态流转跟踪

营销体系
优惠券：满减/折扣券，后台发放或用户领取
秒杀：限时低价抢购，独立秒杀场次管理
拼团：N 人成团享优惠价，团长开团/参团
砍价：用户分享邀请好友帮忙砍至底价
促销：满减/满折/满赠等多类型活动
积分：购物赠送、积分抵扣、积分商城
推广员：分享推广链接按分佣比例获收益
用户体系
会员等级（按消费/积分晋级、梯度权益）、收货地址管理、收藏夹、积分账户、推广关系链

运营管理
财务管理（交易流水、对账）、供应管理（供货商品、供应商）、内容管理（文章/视频/协议）、区域管理（省市区数据）、系统配置（支付/物流/积分规则等参数化配置）

项目实现
Go + Gin + GORM + PostgreSQL / UmiJS 4 + React 19 + Ant Design 6.4 / 微信小程序
中间件链按 cors → auth（JWT）→ ratelimit → error recovery 顺序编排。限流基于 Go x/time/rate 实现 IP 和路由级别的令牌桶，不同接口限流策略各异：下单 10 秒 1 次、支付 5 秒 1 次、登录 60 秒 3 次、通用 30/秒。上传采用 COS 存储 + CDN 分发，配置层按 bucket 和环境区分。

输入安全通过 bluemonday 实现 HTML 消毒防 XSS。PostgreSQL 连接池限 8 个，兼顾读写并发效率。定时任务基于 Goroutine 自实现 SchedulerService，无外部组件依赖。

架构采用典型的三层分层（Handler → Service → Model），模块按业务域划分：商品/分类/品牌/规格/标签、购物车/订单/支付/退款、用户/地址/收藏/积分/会员等级、优惠券/秒杀/拼团/砍价/促销等营销体系，以及财务/供应/内容/区域/系统配置等支撑模块。Handler 层专注请求解析与响应组装，Service 层抽离核心业务逻辑，Model 层定义数据结构和持久化操作。管理端 API 与小程序的客户端 API 统一注册于 routes.go，按路径前缀划分权限域，JWT 中间件对管理端和客户端分别校验。

管理端 UmiJS 配置与其他项目统一：@umijs/max + umi-presets-pro + keepalive 缓存，构建时注入 Git commit hash，routes/proxy/defaultSettings 分层配置。
