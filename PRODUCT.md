# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

三类角色,三端并重(设计投入不设主次,2026-08-11 用户确认):

- **消费者(consumer app)**:在综合商城浏览、搜索、比价、下单的普通购物者;移动与桌面浏览器都是真实场景。
- **商家(merchant app + desktop/Tauri 壳)**:入驻商家的运营者,日常做商品上架、SKU/库存维护、订单处理;高频、任务型使用。
- **平台管理员(admin app)**:平台侧运营/风控人员,管理商家、类目与平台规则;低频但权限最高。

## Product Purpose

**按真实商业产品的标准设计**(用户确认,非"技术演示"定位):一个淘宝/京东式的**综合商城 B2B2C 电商平台**——多品类货架电商,以搜索/类目为中心,标准商品卡与购物车-订单主流程。成功 = 消费者顺畅完成购买决策,商家高效完成经营闭环。

## Positioning

综合商城形态(非内容/短视频带货、非垂类精品)。平台机制:多商家入驻(B2B2C),平台统一提供搜索(存量为 Meilisearch,按 docs/TECH.md 定稿迁回隐藏于 SearchCatalog 接口后的 Elasticsearch 只读投影)、推荐(Gorse)、交易、履约支撑;三端共享同一套账号体系,目标鉴权为 Casdoor 有状态 Session(Dragonfly Session Store,登出即删 Session 即刻失效)+OpenFGA 关系授权;存量 Casbin 处于迁移期,完全废弃 JWT,不保留 JWT 兼容或双重鉴权路径。

## Operating Context

- 中文市场,界面语言 zh-CN;文档与代码注释均为中文。
- 消费者:移动/桌面浏览器购物;商家:桌面浏览器或 Tauri 桌面壳长时间操作工作台;管理员:桌面浏览器。
- 前端 4 app 复用 9 个共享包(pnpm monorepo),API 走 Connect-Web 直连自建网关,鉴权统一在网关层。

## Capabilities and Constraints

- 已有功能域(10 个后端微服务):用户、商品(含 SKU)、购物车、订单、支付、库存、搜索、地址、商家、行为(埋点/推荐信号);推荐由 Gorse 提供。搜索查询端已切换到 Meilisearch;dev 集群已部署 JetStream、outbox relay 和 search indexer,并完成示例商品回灌。以上是迁移起点:Meilisearch 按 docs/TECH.md 定稿迁回 Elasticsearch 只读投影,隐藏于 SearchCatalog 接口后并可从 PostgreSQL 全量重建;JetStream 仅在迁移期保留,目标事件体系为外部非 K8s Apache Kafka 集群+Outbox/Relay/Inbox+DLQ。Product Service 尚无商品写 RPC,也未在业务事务中写 outbox,因此当前不能宣称商品变更已自动同步。Meilisearch 不提供 ES 级聚合分析,涉及搜索数据统计报表的设计需另行评估。目标限界上下文为 identity/catalog/cart/order/payment/inventory/fulfillment/notification,另有 search-projection、analytics 编舞消费者;Order 内置 Saga Manager 编排核心链路,Kafka 事件驱动派生与副作用链路,防超卖由数据库单条原子语句与状态机不变量保证。拓扑真相源 `.service-matrix.yaml`,进度以 `TODO.md` 为准——**设计不得假定未接线的能力已存在**(区分 `depends_on` 与 `depends_on_planned`)。
- API 契约先行(protobuf + buf.validate),前端类型由契约生成;界面字段与校验受 proto 约束。
- 桌面壳是 Tauri 包 web 技术,设计语言仍为 web,不做平台原生化。
- 未定(显式延后):支付渠道的真实品牌露出、多语言/国际化范围。

## Brand Commitments

- **品牌名「灯市」**(2026-08-18 用户确认为正式品牌名):中文名「灯市」,拉丁转写 Dengshi / Lantern Market。
- **品牌标识:** 朱砂方印 BrandMark(方章内嵌白描纸灯线稿),与宋体 900 字标「灯市」成对使用;视觉语言的唯一真相源在 DESIGN.md(灯市视觉世界)。
- 起点:品牌从零建立(2026-08-11 确认无既有资产),名字与标识由灯市视觉世界确立后经用户确认转正。

## Evidence on Hand

仓库内无真实商品数据、真实用户评价、销量数据或商业背书。设计中**不得虚构**具体销量、评分、媒体报道或客户名;演示数据要可辨识为演示(或由用户提供真实素材)。

## Product Principles

1. **按真实产品的标准做取舍**——每个界面的设计以"真实购物者/商家会不会用得顺"评判,不以"演示技术"评判。
2. **三端一体,角色分明**——共享同一账号与设计语言,但 consumer 是转化与浏览体验(Persuade/Experience 倾向),merchant/admin 是效率与数据密度(Operate),不许互相污染。
3. **货架电商的信息架构优先**——搜索、类目、筛选、商品卡、SKU 选择、车-单流程是骨架;任何风格化不得牺牲这条主流程的可扫读性。
4. **契约即边界**——界面展示与交互能力以 proto 契约和已接线服务为上限,不画饼。

## Accessibility & Inclusion

无产品特定的强制标准(未确立);按 web 基线做:可键盘操作、对比度不低于 WCAG AA、表单错误可感知。
