---
name: 2026-11-13-spa-view-state-caching
layer: decisions
status: rejected
description: 否决 consumer SPA 视图缓存式 view transitions（content-visibility: hidden）——收益已被数据层吃掉大半，且触碰登录守卫与隐私
---
# 决策：SPA 视图缓存式 view transitions——不采用

## 问题

modern-web-guidance 的 faster-spa-view-transitions 指南提出：SPA 非激活视图不销毁，用 `content-visibility: hidden` 缓存渲染状态，切回近瞬时恢复。consumer（Vite SPA，TanStack Router + react-query）是否推进该方案。

## 提案

- 路由渲染结果包进持久 DOM 容器（不卸载），路由切换只切 active/inactive。
- React 层用官方 `<Activity mode="hidden">`（React 19.2+）配合——隐藏时卸载 effects、保留组件树；浏览器渲染层再用 `content-visibility: hidden`。
- 白名单 2~3 个高频低危路由（首页、分类），配 LRU 上限；商品详情 `$spuCode` 动态路由排除。

## 考虑过的替代方案

- **手搓 content-visibility 容器（指南原样，纯 CSS/JS 切 class）**——与 TanStack Router 的 match 生命周期、scrollRestoration、beforeLoad 守卫全部打架，React 层没有对应原语，输。
- **仅数据层缓存（现状，本轮已采纳）**——`defaultPreload: "intent"`（悬停预载）+ react-query 缓存已解决切回的主要成本（数据），是本次不采用的前提事实。

## 否决理由

1. **收益已被吃掉大半**：切回页面的成本 = 数据请求 + 组件树 reconcile/DOM 重建 + layout/paint，前两段已被 router 预载与 react-query 缓存解决；本方案只优化最后一段，对轻页面是几十 ms 级边际收益。
2. **登录守卫被绕过**：`beforeLoad` / `requireLogin` 在路由切换时跑；缓存视图切回不重新挂载，守卫不执行。缓存了 profile/订单页，登出后切回，DOM 快照里的个人信息还在——与 TODO「购物车明文 localStorage」同类的隐私关切。
3. **数据新鲜度与瞬时恢复互相拉扯**：Activity hidden 会卸载 react-query observer，切回重挂载触发 refetch，「瞬间恢复」的卖点因此打折，调 staleTime 又引入陈旧数据风险。
4. **滚动恢复打架**：`scrollRestoration: true` 管 window 滚动，缓存容器需各自保住内部 scrollTop，两套机制未经验证。
5. **内存与生态**：动态路由无限增长无 LRU 会膨胀（指南自身列为 DO NOT 场景）；Activity + TanStack Router 的 keepalive 集成没有社区成熟模式，探索成本高。

## 重估条件

perf 采集（initPerf，已在 consumer 接线）显示「切回已访问路由」是真实热点（INP 或 route load 显著偏高）时重估，届时按「Activity + 白名单 + LRU + 登录路由永久排除」推进。
