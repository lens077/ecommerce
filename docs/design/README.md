# docs/design/ — 架构与领域设计

> 2026-08-08 由根目录旧架构总纲 `DESIGN.md`（985 行单文件）按微服务拆分而来，并收编了散落在
> 根目录的领域设计文档（拆分后曾留桩兜旧引用，同日仓内引用清零后已删除）。
> ⚠️ 注意同名不同物：现根目录的 [`DESIGN.md`](../../DESIGN.md) 是 2026-08-11 新增的「灯市」**视觉设计系统**
>（配色/字体/间距 token，配套 [`PRODUCT.md`](../../PRODUCT.md) 产品定义，impeccable 工作流真相源），
> 不是被拆分的架构文档回魂，也不归本目录管。**分工不变**：本目录回答「为什么这么设计」；
> 技术选型与基础设施真相源 → [../TECH.md](../TECH.md)；编码约束 → `STACK.md`；服务拓扑事实 → `.service-matrix.yaml`；
> 实现进度 → `TODO.md`。文中「现状」类横幅描述的是拆分当日的实况，之后以 `TODO.md` 为准。
>
> 📖 **遇到不认识的业务名词先查 [../GLOSSARY.md](../GLOSSARY.md)**（189 个领域词条：
> SPU/SKU/Listing/商品快照/拆单/履约/OrderGroup/MerchantOrder/Saga Manager/PaymentIntent/
> StockLedger/Reservation…）。本目录的设计文档默认读者已掌握这些术语，不再逐篇解释。
>
> 🔁 **DDL / proto / Go 声明不要手抄进设计文档**：用 `<!-- embed: <源路径> <选择器> -->` 指令标出来，
> 由 [`scripts/doc-embed.py`](../../scripts/doc-embed.py) 从迁移/proto/Go 源重写代码块（写法见脚本头注释，
> 样例见 [order/schema.md](order/schema.md)）；`verify-context.sh` 的 [EMBED] 门禁比对投影与源，
> 改了源就重跑脚本。2026-09-03 清点 523 个文档代码块，product/order/payment/inventory/cart
> 五个域的 DDL/proto 摘录名字都已对不上源码，清单在 `.scratch/doc-code-block-inventory-2026-09-03.md`。

## 目录

| 目录 | 内容 | 来源 |
|---|---|---|
| [platform/architecture.md](platform/architecture.md) | 服务边界、核心/支撑服务规划、领域事件、通信协议 | DESIGN.md §微服务架构核心设计 |
| [platform/voxel-construction-site.md](platform/voxel-construction-site.md) | 离线 Three.js r160 等轴测体素沙盘：客户端到 Cilium、control-tower 和 Go 微服务的请求治理可视化设计，含物理块清单、四态灯、状态契约、健康聚合器、场景脉冲与视觉提示词；设计稿 `voxel-construction-site-demo.html` | 2026-09-10 WebGL 演示与项目真实链路对照设计 |
| [platform/production-scale-goal.md](platform/production-scale-goal.md) | 百万/千万级生产化目标、容量模型、现有技术栈边界、证据门禁、P0/P1/P2 与完成定义 | 2026-08-27 用户目标，后续按证据驱动方向修订 |
| [platform/capacity-balancing.md](platform/capacity-balancing.md) | VPA recommendation、可信 requests、节点重启、Descheduler 准入、容量/故障演练与持续告警 | 2026-08-29 三节点调度审计与 [VPA recommendation-only 发布报告](../reports/2026-08-29-vpa-recommendation-only.md) |
| [platform/error-handling.md](platform/error-handling.md) | biz→data→service 三层错误分层约定（**全服务通用规范**） | DESIGN.md §错误处理 |
| [platform/rbac.md](platform/rbac.md) | Casdoor 三角色与 OpenFGA 对象关系授权（覆盖存量 Casbin RBAC） | DESIGN.md §RBAC |
| [platform/anonymous-shopping.md](platform/anonymous-shopping.md) | 匿名（访客）购物链路：RPC 三级分类、网关签发访客令牌、IAM 过滤边界、登录合并购物车语义、六步落地（**设计草案**） | 2026-08-31 由「匿名逛首页被强制跳登录」缺陷反推 |
| [platform/pre-environment.md](platform/pre-environment.md) | **历史快照，禁止作为当前配置源**：保留旧集群协议握手与迁移教训；当前实况看 matrix 与 infrastructure audit | 2026-08-08/24 集群实测 |
| [platform/i18n-routing.md](platform/i18n-routing.md) | i18n URL 与语言路由策略：公开页子目录 `/:lang/` 决策、方案对比、hreflang、SSR 前置、API 本地化（**设计草案**） | 2026-08-08 设计草案 |
| [platform/i18n-lessons.md](platform/i18n-lessons.md) | 对照调研：Fluent/ICU4X 作者的 i18n 经验对本项目的适用性；已核实现状（语义 ID/Intl 已达标）与三个缺口（复数、后端错误、业务数据多语言）（**调研文档**） | 2026-08-31 基于 zed#7409 评论 + 本仓代码核查 |
| [platform/admin-roadmap.md](platform/admin-roadmap.md) | 管理员角色技术形态（角色×独立 admin-service×专属页面，含边界铁律）与能力取舍、竞品差距 | 2026-08-12 基于 merchant/store-settings.md 反推 |
| [platform/gin-b2c-mall-comparison.md](platform/gin-b2c-mall-comparison.md) | 对照调研：Gin 单体 B2C 商城与本仓的定位/架构/工程化差异及三点启示（快照，含介绍原文附录） | 2026-08-19 外部项目介绍文本 |
| [product/listing.md](product/listing.md) | ListProducts 无限滚动/游标分页（**设计已定待落地**） | DESIGN.md §商品列表 |
| [product/schema.md](product/schema.md) | SPU/SKU 表早期稿 | DESIGN.md §数据库设计 |
| [inventory/inventory.md](inventory/inventory.md) | 库存分层模型、状态机、高并发保障、库存表 | DESIGN.md §分布式库存状态机 |
| [order/checkout.md](order/checkout.md) | **下单（CreateOrder）设计基线 v2**：报价 token、组原子预占、支付/订单接受分离、Outbox、超时自愈；6 轮对抗评审收敛 | 原 docs/design/order.md（v1 草稿已被 v2 推翻并删除） |
| [order/consistency.md](order/consistency.md) | 跨服务一致性（Order Saga 编排 + Outbox/Inbox + Kafka 编舞） | 原 TODO.md §二 |
| [order/schema.md](order/schema.md) | 订单表早期稿（被 checkout 终稿部分取代） | DESIGN.md §数据库设计 |
| [payment/payment.md](payment/payment.md) | **已作废**（文首横幅）：单订单支付单+单轴状态模型被 checkout v2 按组支付、capture/refund 双轴取代；仅存渠道对接与对账素材 | DESIGN.md §支付系统 |
| [search/search.md](search/search.md) | CQRS 搜索投影：`products.search_catalog` → Debezium → Kafka → Elasticsearch Sink 已切流，含 `SearchCatalog` 边界、字段契约、全量重建、alias/IK 与灾备入口 | DESIGN.md §搜索服务；2026-09 运行时切流与手顺固化 |
| [merchant/store-settings.md](merchant/store-settings.md) | Shopline 商店设置 20 页竞品实录（含自研备注与服务映射） | 原 DESIGN-MERCHANT.md，2026-08-12 重写为实录调研 |
| [merchant/roadmap.md](merchant/roadmap.md) | 商家角色功能取舍（引进/不引进）与 P0/P1/P2 路线图 | 2026-08-12 基于 store-settings.md 调研 |
| [product/sales.md](product/sales.md) | 销量统计：PG 事实与预聚合 + Dragonfly 可丢加速层（**部分落地**，实况见文首横幅） | 原 product 服务 schema/design/ 目录，2026-08-13 移入 |
| [notification/notification.md](notification/notification.md) | **通知服务设计草案**：模板/消息/投递三层模型、IN_APP + Resend EMAIL 渠道、混合发送、dedup_key 幂等、投递状态机与重试、`support` 角色与 Casbin 策略、Config Center 键、落地登记与分期（承接 TECH.md §5.9） | 2026-09-09 发件微服务与客服后台立项 |
| [support/support.md](support/support.md) | **客服服务设计草案**：Resend 收件 webhook → 工单串线规则、工单/往来/事件模型、客服面与用户面接口、回复经 notification 发出、状态机、repository 归属条件与 OpenFGA 首个接线试点模型 | 2026-09-09 与 notification 同批 |
| [copilot/copilot.md](copilot/copilot.md) | **页内智能助手设计草案（纯前端，无 LLM、无后端）**：对标腾讯云 KiKi「界面模式」的调研结论（未开源，只有零件）、`@ecommerce/copilot` 包（动作契约、正则意图匹配与未命中交互、执行器原语与 React/MUI 事件派发坑位、蒙层/渐变描边/大指针视觉规格、安全边界）、三条演示链路（用户搜商品 / 商家筛待发货 / 管理员开监控页）与分期验收 | 2026-09-10 用户需求，KiKi 界面模式截图对照 |
| [cart/api-decisions.md](cart/api-decisions.md) | 购物车接口设计因果论证（**历史记录**）。2026-08-26 裁决：`cart_item_id` 为唯一条目标识（checkout v2 依赖此语义），proto 现行并行数组属未记录的翻转，迁移列 P1 | 原 backend/api/cart/v1/README.md，2026-08-13 移入 |

尚无设计文档的服务：user / behavior（behavior 的推荐链路知识在
`context/project/ecommerce/behavior/`）。**部分服务的设计文档住在服务目录内**：
address 领域设计 → `backend/services/address/README.md`；cart 表设计决策 →
`backend/services/cart/internal/data/migrations/README.md`；product 领域与接口早期稿 →
`backend/services/product/README.md`（其接口命名与 [product/listing.md](product/listing.md)
未统一，列表页现行设计以 listing.md 为准）。新增设计时在对应服务目录建文件并回填本表。

## 交互式架构图（docs/architecture/）

archify 生成的系统地图，自包含 HTML（深浅主题 / 搜索 / 路径追踪 / 导出）；同名
`.architecture.json` 是 typed 源，改图改 JSON 后用 archify `deliver` 重渲染，不要手改 HTML。

| 图 | 文件 | 覆盖 |
|---|---|---|
| 整体 | [ecommerce-overall.html](../architecture/ecommerce-overall.html) | 4 前端应用 → 网关 → 服务分组 → 数据与外部依赖 |
| 前端 | [ecommerce-frontend.html](../architecture/ecommerce-frontend.html) | pnpm workspace：apps × packages、tracker/perf 上报链路 |
| 网关 | [ecommerce-gateway.html](../architecture/ecommerce-gateway.html) | （**历史快照**：本仓旧网关，2026-08-23 已迁 control-tower）9 层中间件链、JWT+RBAC、发现与回源重试 |
| 后端 | [ecommerce-backend.html](../architecture/ecommerce-backend.html) | 单服务分层、proto/sqlc 双生成链、启动装配 |

图内事实按生成当日（2026-08-08）代码实测，之后架构变了改 JSON 重渲染并更新本表。

## 拆分时删除的章节（内容已被取代，勿凭记忆找回）

| 原文档/章节 | 为什么删 | 现在看哪里 |
|---|---|---|
| `config-center/design.md`（2026-08-26 删） | 配置面与网关已随代码迁至同级仓 control-tower（2026-08-23 切流），本仓副本只会漂移 | `../control-tower/docs/design/` |
| §技术栈集成架构设计 | 与技术栈真相源重复，且无版本信息 | [`STACK.md`](../../STACK.md) |
| §可观测性体系设计 | 已被更具体的方法论+指标基线文档取代 | [`observability/OBSERVABILITY.md`](../observability/OBSERVABILITY.md) |
| §容器化与编排设计 | 示例清单与实际部署矛盾（namespace 划分、Deployment 结构均不同），目标态已归 DevOps 体系 | [`docs/DEVOPS.md`](../DEVOPS.md) + `helm/` + `backend/services/*/deploy/` |

## 阅读顺序建议

改 proto / 写新功能前：先查 [`.service-matrix.yaml`](../../.service-matrix.yaml)
拿拓扑事实 → 读对应服务目录的设计 → 读 [platform/error-handling.md](platform/error-handling.md)
（错误码映射是评审必查项）→ 动手。触发式必读路由见
[`context/team/runbook.md`](../../context/team/runbook.md) §0.1。
