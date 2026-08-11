---
version: 1
slug: "frontend-apps-consumer-src-routes-index-tsx"
primary_target: "frontend/apps/consumer/src/routes/index.tsx"
related_targets: []
---

# consumer 首页 · 灯市(纸灯工坊世界)

- 范围与模式:consumer 首页 route(Persuade);AppBar/Footer 仅皮肤适配,逻辑结构不动。
- 受众与任务:中国购物者逛综合商城;几秒内明白是什么、想逛、知道入口。
- 选定方向:Akari 纸灯工坊语法(用户三掷两 re-roll 后选定 challenger,seed ee8c0618)。
  纸 #F6EFE1 为场、竹线 #D8B48A 为架、墨 #2A2A2A 为字、朱砂 #CC3A2E 只给动作与价格强调。
- 首屏:墨字大标(灯市)+ 主灯位(本日主推全幅)+ 竹架类目条 + 灯阵商品网格(桌面 5 列/移动 2 列)。
- 签名交互:入场灯阵次第点灯(stagger 透光渐亮);hover 纸面透光;加购/CTA 朱砂落印;reduced-motion 降级。
- 内容与真实性:ListProduct 未接通,商品为 authored 演示数据 + 自绘墨线 SVG 插画(统一笔画),
  界面标注「演示商品」;不虚构销量/评分/背书。白底图区=灯心最亮处的逻辑保留给未来真图。
- 记忆时刻:首屏主灯的点灯瞬间与网格次第亮起。
- 不可触碰:AppBar 的搜索/购物车/登录逻辑;其他 routes;后端契约。
- 反软糯纪律:竹线网格硬朗、墨字力度、朱砂准确;禁 eyebrow 小标签、禁渐变字、禁 emoji 图标;
  display 用自托管 Noto Serif SC,数字 tabular-nums。
- 待决:全站其他 surface 的世界迁移顺序(DESIGN.md 记录路径后逐个做)。
