# docs/design/ — 架构与领域设计

> 2026-08-08 由根目录 `DESIGN.md`（985 行单文件）按微服务拆分而来，并收编了散落在
> 根目录的领域设计文档（拆分后曾留桩兜旧引用，同日仓内引用清零后已删除，勿再重建）。**分工不变**：本目录回答「为什么这么设计」；
> 技术选型与编码约束 → `STACK.md`；服务拓扑事实 → `.service-matrix.yaml`；
> 实现进度 → `TODO.md`。文中「现状」类横幅描述的是拆分当日的实况，之后以 `TODO.md` 为准。

## 目录

| 目录 | 内容 | 来源 |
|---|---|---|
| [platform/architecture.md](platform/architecture.md) | 服务边界、核心/支撑服务规划、领域事件、通信协议 | DESIGN.md §微服务架构核心设计 |
| [platform/error-handling.md](platform/error-handling.md) | biz→data→service 三层错误分层约定（**全服务通用规范**） | DESIGN.md §错误处理 |
| [platform/performance.md](platform/performance.md) | 性能目标、四层架构、多级缓存、DB 集群、Redis 缓存（目标态） | DESIGN.md §性能与高可用 + §Redis + §数据库集群 |
| [platform/rbac.md](platform/rbac.md) | 三角色 RBAC 模型、权限粒度、Casdoor 集成 | DESIGN.md §RBAC |
| [platform/pre-environment.md](platform/pre-environment.md) | **Pre 环境基础设施接入清单（实测）**：各组件 IP/svc/路由/网关/TLS 现状与升级路径 | 2026-08-08 集群实测 |
| [platform/i18n-routing.md](platform/i18n-routing.md) | i18n URL 与语言路由策略：公开页子目录 `/:lang/` 决策、方案对比、hreflang、SSR 前置、API 本地化（**设计草案**） | 2026-08-08 设计草案 |
| [platform/admin-roadmap.md](platform/admin-roadmap.md) | 管理员角色技术形态（角色×`<域>.admin.v1` 专属 API 面×专属页面）与能力取舍、竞品差距 | 2026-08-12 基于 merchant/store-settings.md 反推 |
| [product/listing.md](product/listing.md) | ListProducts 无限滚动/游标分页（**设计已定待落地**） | DESIGN.md §商品列表 |
| [product/schema.md](product/schema.md) | SPU/SKU 表早期稿 | DESIGN.md §数据库设计 |
| [inventory/inventory.md](inventory/inventory.md) | 库存分层模型、状态机、高并发保障、库存表 | DESIGN.md §分布式库存状态机 |
| [order/checkout.md](order/checkout.md) | **下单功能终稿**：结算页、token、拆单、预占、超时自愈 | 原 docs/design/order.md |
| [order/consistency.md](order/consistency.md) | 跨服务一致性（Outbox + TCC-Try + 编舞 Saga） | 原 TODO.md §二 |
| [order/schema.md](order/schema.md) | 订单表早期稿（被 checkout 终稿部分取代） | DESIGN.md §数据库设计 |
| [payment/payment.md](payment/payment.md) | 支付渠道策略模式、流程、幂等、对账、支付/退款表 | DESIGN.md §支付系统 |
| [search/search.md](search/search.md) | CQRS 读写分离、ES 索引 Mapping、搜索能力 | DESIGN.md §搜索服务 |
| [merchant/store-settings.md](merchant/store-settings.md) | Shopline 商店设置 20 页竞品实录（含自研备注与服务映射） | 原 DESIGN-MERCHANT.md，2026-08-12 重写为实录调研 |
| [merchant/roadmap.md](merchant/roadmap.md) | 商家角色功能取舍（引进/不引进）与 P0/P1/P2 路线图 | 2026-08-12 基于 store-settings.md 调研 |
| [config-center/design.md](config-center/design.md) | 配置中心设计存档（代码已拆至独立仓库） | 原 CONFIG_CENTER_DESIGN.md |

尚无设计文档的服务：user / cart / address / behavior（behavior 的推荐链路知识在
`context/project/ecommerce/behavior/`）。新增设计时在对应服务目录建文件并回填本表。

## 交互式架构图（docs/architecture/）

archify 生成的系统地图，自包含 HTML（深浅主题 / 搜索 / 路径追踪 / 导出）；同名
`.architecture.json` 是 typed 源，改图改 JSON 后用 archify `deliver` 重渲染，不要手改 HTML。

| 图 | 文件 | 覆盖 |
|---|---|---|
| 整体 | [ecommerce-overall.html](../architecture/ecommerce-overall.html) | 4 前端应用 → 网关 → 服务分组 → 数据与外部依赖 |
| 前端 | [ecommerce-frontend.html](../architecture/ecommerce-frontend.html) | pnpm workspace：apps × packages、tracker/perf 上报链路 |
| 网关 | [ecommerce-gateway.html](../architecture/ecommerce-gateway.html) | 9 层中间件链实际顺序、JWT+RBAC、发现与回源重试 |
| 后端 | [ecommerce-backend.html](../architecture/ecommerce-backend.html) | 单服务分层、proto/sqlc 双生成链、启动装配 |

图内事实按生成当日（2026-08-08）代码实测，之后架构变了改 JSON 重渲染并更新本表。

## 拆分时删除的章节（内容已被取代，勿凭记忆找回）

| 原 DESIGN.md 章节 | 为什么删 | 现在看哪里 |
|---|---|---|
| §技术栈集成架构设计 | 与技术栈真相源重复，且无版本信息 | [`STACK.md`](../../STACK.md) |
| §可观测性体系设计 | 已被更具体的方法论+指标基线文档取代 | [`observability/OBSERVABILITY.md`](../../observability/OBSERVABILITY.md) |
| §容器化与编排设计 | 示例清单与实际部署矛盾（namespace 划分、Deployment 结构均不同），目标态已归 DevOps 体系 | [`docs/DEVOPS.md`](../DEVOPS.md) + `helm/` + `backend/services/*/deploy/` |

## 阅读顺序建议

改 proto / 写新功能前：先查 [`.service-matrix.yaml`](../../.service-matrix.yaml)
拿拓扑事实 → 读对应服务目录的设计 → 读 [platform/error-handling.md](platform/error-handling.md)
（错误码映射是评审必查项）→ 动手。触发式必读路由见
[`context/team/runbook.md`](../../context/team/runbook.md) §0.1。
