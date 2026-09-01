# 语义化 HTML 与导航预测（speculation rules）

> 适用范围：`frontend/apps/` 的 consumer（vite-plus SPA）与 consumer-next（Next.js App Router）。
> 与 [`accessibility.md`](accessibility.md) 的分工：那份管**读屏与键盘可达**（WCAG 2.2 AA、axe/Lighthouse 门禁），本份管**文档结构语义与机器可读性**（标题层级、地标、结构化数据、SEO），以及导航预测这类依赖 MPA 结构的优化。两份共用「语义化优先、ARIA 是兜底」这条原则，不重复它的验证章节。
> 现状基线（2026-09 实测，见 §一）：consumer-next 的手写标记语义质量合格；consumer SPA 有一处**系统性**的标题层级缺口；两个应用均无结构化数据。

## 一、现状实测

命令与计数取自 `frontend/apps/` 实际代码，非估计值。

| 观测项 | consumer（SPA） | consumer-next |
|---|---|---|
| 地标元素 | `component="main"` / `"nav"` / `"footer"` 各 1 处 | `<main>` / `<header>` / `<section>` / `<article>` 原生标签 |
| 标题语义 | 修复前 19 处 `variant="h*"` 未配 `component`，实测大纲全页无 `h1`、噪音 `h6` 满屏；**已修**（见 §四.1） | `<h1>` / `<h2>` 原生，层级连续 |
| 描述性列表 | 未使用 | 价格/库存用 `<dl>/<dt>/<dd>` |
| `div onClick` 反模式 | **0 处** | 0 处 |
| 结构化数据（JSON-LD） | **无** | **无** |
| `<html lang>` | i18n 驱动 | `layout.tsx` 由 `[lang]` 段驱动 |

两条结论：

1. **`div onClick` 零命中**说明「不用裸 div 造可点元素」这条纪律实际被遵守了，这是 a11y 手册§一.2 的成果，不必重复治理。
2. **MUI `Typography` 不写 `component` 时不是「没有语义」，而是「语义由 `variant` 决定」**——这一条与直觉相反，是本轮最重要的发现。实测 `@mui/material` 的 `defaultVariantMapping`：`h1`–`h6` 映射到**同名标题标签**，`subtitle1`/`subtitle2` 也映射到 **`h6`**，只有 `body1`/`body2`/`inherit` 才是 `<p>`。

   所以缺口不是「标题丢了语义」，而是**语义按字号被瞎安排**：本项目没有自定义 `variantMapping`（已全仓确认），于是选 `variant` 的人是按视觉挑字号，却在无意中决定了文档大纲。实测后果有两类，都能骗过 axe 的 `heading-order`：

   - **该是标题的没进大纲的正确位置**：购物车/结算/订单/支付/404 页的页面标题用了 `variant="h5"`/`h6`，渲染成 `<h5>`/`<h6>`，**整页没有 `h1`**；
   - **不该是标题的混进了大纲**：商品价格用 `variant="h3"` 渲染成 `<h3>` 紧跟 `<h1>`（层级跳跃），页脚品牌字样与页脚三个链接栏标题渲染成 `<h6>`，每页多出 4 个噪音标题。

   这与 a11y 手册§四.3 已修的 `heading-order` 是同一根因的两次发作：那次修的是单点跳级，这次修的是**整套大纲**。

## 二、实施原则

1. **`variant` 管视觉，`component` 管语义，二者必须分开决定**。`<Typography variant="h6" component="h2">` 是正常写法而非冗余——视觉上要小、结构上是二级标题。选 `component` 时只看文档大纲，不看字号。
2. **每页有且只有一个 `<h1>`**，层级不跳级（h1→h3 不允许）。SPA 里 `<h1>` 归当前路由的页面标题，不归 AppBar 的品牌名。
3. **地标元素给结构而非样式**：`<main>` 每页唯一且不含页头页脚；重复出现的导航区用 `<nav aria-label>` 区分（主导航/面包屑/分页）。
4. **列表用列表标签**。商品列表、SKU 列表、筛选项是 `<ul>/<li>`，不是一堆平铺 `<div>`——读屏会播报「共 N 项」，这是纯 div 给不了的。
5. **电商特有语义**：价格用 `<data value="1999">¥19.99</data>` 或 `<dl>` 键值对；时间用 `<time datetime>`（订单时间、倒计时）；面包屑用 `<nav><ol>`。
6. **结构化数据（JSON-LD）只放在 SSR 页面**。`consumer-next` 的商品详情页应输出 `schema.org/Product`（含 `offers.price`/`availability`），这是富媒体搜索结果的前提。SPA 页面输出 JSON-LD 收益极低（爬虫未必执行 JS），不值得做。
7. **不要用 ARIA 修补可以用原生标签解决的问题**——`role="heading" aria-level="2"` 永远劣于 `<h2>`。

## 三、`<script type="speculationrules">` 评估

**结论：当前不引入。** 两个应用各自被不同原因挡死，且都不是「配上就有收益」的情况。

### 3.1 技术前提

speculation rules 让浏览器在用户点击前对**另一个 URL** 发起导航级的 prefetch 或 prerender。收益前提是**点击会触发浏览器级的文档导航**。该前提在本项目两个 C 端应用中均不成立。

### 3.2 consumer（SPA）：架构上不适用

TanStack Router 的路由切换是客户端组件树替换，不发生文档导航；`index.html` 只有一个 `<div id="app">` 挂载点。对同一个 `index.html` 做 prerender 只会重复下载并执行同一份 bundle，白耗内存与流量。

**SPA 语义下的等价物是另一套 API**：TanStack Router 的路由级 `preload`（hover/intent 触发）+ TanStack Query 的 `prefetchQuery`。要优化 SPA 的感知速度应走这条路，与 speculation rules 无关。

### 3.3 consumer-next（MPA）：技术上适用，但当前无预渲染目标

App Router + ISR，技术前提成立。但该应用当前只有**一个业务页面**（`app/[lang]/product/[spuCode]/page.tsx`，其余为 `not-found` 与 `api`/`healthz` 路由），且全量检索 `next/link`、`<a`、`router.push`、`redirect(` **零命中**——应用内部没有任何站内链接。没有链接就没有「下一个页面」，无论 `href_matches` 列表还是 document rules 的选择器匹配都无从写起。

另需注意：Next.js `<Link>` 自带视口内 prefetch，等站内链接出现后默认行为已覆盖大部分收益，speculation rules 的增量仅在「prerender 完整文档」这一档。

### 3.4 重新评估的触发条件

盯 `TODO.md` 的「`ListProducts` 实现后 consumer-next 扩页」。当 consumer-next 出现**列表页 → 详情页**的真实跳转链路时，本项第一次具备施展空间——列表对详情做 `prerender`（`eagerness: moderate`）是其教科书场景，电商详情页首屏重、转化敏感，收益确实存在。

届时的**前置检查项**（不做完不得上线）：

1. **prerender 会执行 JS**。`personalized-panel.tsx` 这类个性化组件会在用户尚未点击时就发起请求，须用 `document.prerendering` 与 `prerenderingchange` 事件把副作用推迟到激活之后。
2. **遥测口径对齐**。`telemetry_pb.ts` 已把 `prerender` 列为一种导航类型，若不处理会造成 PV 虚高与埋点污染。
3. **ISR 缓存交互**：`revalidate=60` 下 prerender 命中的可能是不同 Pod 的不同缓存副本，需确认不放大既有的多 Pod 不一致窗口。

在此之前，`ListProducts` 未实现是真正的瓶颈，它同时卡着扩页与本优化，优先级高于本项。

## 四、落地顺序与验收判据

沿用仓库「静默失效要实测」纪律（同 a11y 手册§四），每步先证明门禁会红。

1. **补齐 `Typography` 的 `component`**（19 处）。✅ 2026-09-01 完成。做法分两向而不是一味加 `component="h*"`：**页面标题补 `h1`**（购物车/结算/订单/订单详情/支付结果/404/个人中心）、**区块标题补 `h2`**（商品列表、选规格、页脚三栏、搜索结果、空购物车、地址簿）、**非标题降为 `p`**（商品价格、合计金额、支付金额、页脚品牌字样、搜索结果项名称与价格）。实测大纲前后对比（jsdom 整页渲染）：

   | 页面 | 修复前 | 修复后 |
   |---|---|---|
   | 首页 | `h1,h2,h2,h6×4,h2,h3×3` | `h1,h2×6,h3×3` |
   | 商品详情 | `h1,h5,h6×5,h2,h3×3`（选规格后 `h1,h3,…` 跳级） | `h1,h2×5,h3×3` |
   | 购物车 | `h6,h6,h5,h6×4,h2,h3×3`（**无 h1**） | `h1,h2×5,h3×3` |
   | 结算 | `h6,h6,h6×4,h2,h3×3`（**无 h1**） | `h1,h2×4,h3×3` |
   | 订单/支付/404 | `h5`/`h5,h4`/`h6×4` 起头（**均无 h1**） | 均以唯一 `h1` 起头 |

2. **建立标题层级的回归断言**。✅ 2026-09-01 完成，加在既有 `pages.a11y.test.tsx`（不新建套件）：关键四页断言「恰好一个 `h1`」+「层级不跳级」，另加一条 canary 自检探测器有效性。

   **为什么必须自己断言而不是靠 axe**：`heading-order` 只查相邻标题不跳级，`page-has-heading-one` 属 best-practice 标签、不在该文件的 WCAG A/AA `runOnly` 范围内——上面「整页无 h1」的四个页面在 axe 下**全绿**。

   **红测的一个坑**（值得记）：商品价格区要**选中规格后**才渲染（`selectedAttrs` 初始为空），且服务桩的 SKU 原本没有 `attributes` 字段，导致价格分支永远走不到——第一次红测「假绿」正是因此。修法是给桩 SKU 补 `attributes` 并在用例里点一次规格 Chip（MUI `Chip` 渲染成 `div` 不是 `button`，要按文本点）。补上后红测才真红：`层级跳跃于 index 1：1→3→2→…`，恢复 `component="p"` 后转绿。**结论：断言写完必须真的把修复回退一次看它变红**，否则测的可能是一条根本没渲染的分支。
3. **consumer-next 商品详情页输出 `schema.org/Product` JSON-LD**。验收：用 Google Rich Results Test 与 Schema Markup Validator 校验通过，且 `offers.price` 与页面显示价格一致（防止两处漂移——价格来自同一个 `Money` 字段，不得手工格式化两次）。
4. **speculation rules 不做**，按 §3.4 的触发条件重估。

## 五、参考

- [HTML Standard — Sections](https://html.spec.whatwg.org/multipage/sections.html) · [MDN 语义化元素](https://developer.mozilla.org/zh-CN/docs/Glossary/Semantics)
- [MUI Typography `component` prop](https://mui.com/material-ui/react-typography/) · [schema.org/Product](https://schema.org/Product)
- [Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API) · [prerender 与 `document.prerendering`](https://developer.chrome.com/docs/web-platform/prerender-pages)
