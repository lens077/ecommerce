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

综合商城形态(非内容/短视频带货、非垂类精品)。平台机制:多商家入驻(B2B2C),平台统一提供搜索(Elasticsearch)、推荐(Gorse)、交易、履约支撑;三端共享同一套账号与 RBAC 体系(Casdoor + Casbin)。

## Operating Context

- 中文市场,界面语言 zh-CN;文档与代码注释均为中文。
- 消费者:移动/桌面浏览器购物;商家:桌面浏览器或 Tauri 桌面壳长时间操作工作台;管理员:桌面浏览器。
- 前端 4 app 复用 9 个共享包(pnpm monorepo),API 走 Connect-Web 直连自建网关,鉴权统一在网关层。

## Capabilities and Constraints

- 已有功能域(10 个后端微服务):用户、商品(含 SKU)、购物车、订单、支付、库存、搜索、地址、商家、行为(埋点/推荐信号);推荐由 Gorse 提供,搜索由 Elasticsearch 提供。拓扑真相源 `.service-matrix.yaml`,进度以 `TODO.md` 为准——**设计不得假定未接线的能力已存在**(区分 `depends_on` 与 `depends_on_planned`)。
- API 契约先行(protobuf + buf.validate),前端类型由契约生成;界面字段与校验受 proto 约束。
- 桌面壳是 Tauri 包 web 技术,设计语言仍为 web,不做平台原生化。
- 未定(显式延后):品牌名(暂用 "Ecommerce")、支付渠道的真实品牌露出、多语言/国际化范围。

## Brand Commitments

无既有品牌资产(2026-08-11 用户确认"品牌从零开始"):无名字、无 logo、无主色。视觉世界与品牌决策延后到 new-work 建立,本文件不预设。

## Evidence on Hand

仓库内无真实商品数据、真实用户评价、销量数据或商业背书。设计中**不得虚构**具体销量、评分、媒体报道或客户名;演示数据要可辨识为演示(或由用户提供真实素材)。

## Product Principles

1. **按真实产品的标准做取舍**——每个界面的设计以"真实购物者/商家会不会用得顺"评判,不以"演示技术"评判。
2. **三端一体,角色分明**——共享同一账号与设计语言,但 consumer 是转化与浏览体验(Persuade/Experience 倾向),merchant/admin 是效率与数据密度(Operate),不许互相污染。
3. **货架电商的信息架构优先**——搜索、类目、筛选、商品卡、SKU 选择、车-单流程是骨架;任何风格化不得牺牲这条主流程的可扫读性。
4. **契约即边界**——界面展示与交互能力以 proto 契约和已接线服务为上限,不画饼。

## Accessibility & Inclusion

无产品特定的强制标准(未确立);按 web 基线做:可键盘操作、对比度不低于 WCAG AA、表单错误可感知。
