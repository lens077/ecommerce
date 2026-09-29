# 语义化 HTML 与导航预测（speculation rules）

> 适用范围：`frontend/apps/` 的 consumer（vite-plus SPA）与 consumer-next（Next.js App Router）。
> 与 [`accessibility.md`](accessibility.md) 的分工：那份管**读屏与键盘可达**（WCAG 2.2 AA、axe/Lighthouse 门禁），本份管**文档结构语义与机器可读性**（标题层级、地标、结构化数据、SEO），以及导航预测这类依赖 MPA 结构的优化。两份共用「语义化优先、ARIA 是兜底」这条原则，不重复它的验证章节。
> 现状基线（2026-09 实测，见 §一）：consumer-next 的手写标记语义质量合格；consumer SPA 有一处**系统性**的标题层级缺口；两个应用均无结构化数据。

## 一、现状实测

命令与计数取自 `frontend/apps/` 实际代码，非估计值。

| 观测项 | consumer（SPA） | consumer-next |
|---|---|---|
| 地标元素 | `component="main"` / `"nav"` / `"footer"` 各 1 处 | `<main>` / `<header>` / `<section>` / `<article>` 原生标签 |
| 标题语义 | 修复前 23 处 `variant="h*"`/`subtitle*` 未配 `component`，实测大纲全页无 `h1`、噪音 `h6` 满屏；**已清零**（见 §四.1） | `<h1>` / `<h2>` 原生，层级连续 |
| 描述性列表 | 未使用 | 价格/库存用 `<dl>/<dt>/<dd>` |
| `div onClick` 反模式 | **0 处** | 0 处 |
| 结构化数据（JSON-LD） | 无（刻意：SPA 输出收益极低） | `schema.org/Product`，服务端生成、与展示价格同源（§四.4） |
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

1. **补齐 `Typography` 的 `component`**（23 处，分两批）。✅ 2026-09-01 完成。做法分三向而不是一味加 `component="h*"`：**页面标题补 `h1`**（购物车/结算/订单/订单详情/支付结果/404/个人中心）、**区块标题补 `h2`**（商品列表、选规格、页脚三栏、搜索结果、空购物车、地址簿、个人中心两个卡片）、**非标题降级**（商品价格、合计金额、支付金额、页脚品牌字样、搜索结果项名称与价格 → `p`；地址簿收件人姓名/电话 → `span`，因为它们在 `ListItemText primary` 的 `<span>` 里，`p` 会构成非法嵌套）。

   **第二批 4 处是第一批统计的盲区**：第一批只 grep 了 `variant="h`，漏了 `subtitle1/2`——而它们同样映射 `h6`。这 4 处全在个人中心/地址簿，恰好是第一批断言没覆盖的登录态页面；「没有断言的地方就是缺陷残留的地方」在同一轮里被印证了两次。地址簿那两处把**收件人姓名和电话渲染成标题**，读屏按标题导航会念出一串人名电话。实测大纲前后对比（jsdom 整页渲染）：

   | 页面 | 修复前 | 修复后 |
   |---|---|---|
   | 首页 | `h1,h2,h2,h6×4,h2,h3×3` | `h1,h2×6,h3×3` |
   | 商品详情 | `h1,h5,h6×5,h2,h3×3`（选规格后 `h1,h3,…` 跳级） | `h1,h2×5,h3×3` |
   | 购物车 | `h6,h6,h5,h6×4,h2,h3×3`（**无 h1**） | `h1,h2×5,h3×3` |
   | 结算 | `h6,h6,h6×4,h2,h3×3`（**无 h1**） | `h1,h2×4,h3×3` |
   | 订单/支付/404 | `h5`/`h5,h4`/`h6×4` 起头（**均无 h1**） | 均以唯一 `h1` 起头 |
   | 个人中心（登录态） | `h5,h6,h6,…`（**无 h1**，两个卡片标题是 h6） | `h1,h2,h2,…` |
   | 地址簿（登录态） | `h4→h1` 已有，但列表项 `h6×2`（**收件人姓名+电话**） | `h1,h2,…`，姓名电话退出标题树 |

2. **建立标题层级的回归断言**。✅ 2026-09-01 完成，加在既有 `pages.a11y.test.tsx`（不新建套件）：关键四页 + 个人中心 + 地址簿断言「恰好一个 `h1`」+「层级不跳级」，地址簿额外断言收件人姓名不出现在任何标题标签里；另加一条 canary 自检探测器有效性。登录态两页靠 `vi.hoisted` 的 `authState` 开关放行 `beforeLoad`，主体靠 `UserService.userProfile` 桩渲染（没有它个人中心只有一个 `CircularProgress`）。

   **为什么必须自己断言而不是靠 axe**：`heading-order` 只查相邻标题不跳级，`page-has-heading-one` 属 best-practice 标签、不在该文件的 WCAG A/AA `runOnly` 范围内——上面「整页无 h1」的四个页面在 axe 下**全绿**。

   **红测的一个坑**（值得记）：商品价格区要**选中规格后**才渲染（`selectedAttrs` 初始为空），且服务桩的 SKU 原本没有 `attributes` 字段，导致价格分支永远走不到——第一次红测「假绿」正是因此。修法是给桩 SKU 补 `attributes` 并在用例里点一次规格 Chip（MUI `Chip` 渲染成 `div` 不是 `button`，要按文本点）。补上后红测才真红：`层级跳跃于 index 1：1→3→2→…`，恢复 `component="p"` 后转绿。**结论：断言写完必须真的把修复回退一次看它变红**，否则测的可能是一条根本没渲染的分支。
3. **merchant/admin 同类缺陷清零并建 a11y 脚手架**。✅ 2026-09-01 完成，35 处（merchant 16 / admin 19；此前按文件去重报的「30」是低估）。分类完全机械——按 `Typography` 内容判：`*.title` → `h1`，区块/图表标题 → `h2`，`stat.value`/侧栏品牌 → `p`，分类 emoji 图标 → `span aria-hidden`。**两个应用此前零 a11y 测试，admin 甚至没有 `test` script**——`pnpm ready` 的 `vp run -r test` 会静默跳过它，所以「测试全绿」对 admin 一直是空话。脚手架照抄 consumer 形态（axe canary + 大纲 canary + 逐页断言），两个应用红测都过（回退一处 `h1` → `toHaveLength(1)` 红）。

   **脚手架一上线就抓出的真缺陷**（不是标题语义，是 axe WCAG A/AA 违规，此前无人知道）：merchant 表格里 18 个图标按钮无可及名称（查看/编辑/删除/发货）、顶栏通知铃、设置页头像相机按钮、订单状态 `Select` 无 label、设置页 4 个 `TextField` 的视觉标签是独立 `Typography` 未关联；admin 订单/报表的 `Select` 有 `InputLabel` 但没接 `labelId`、设置页超时字段同样未关联。修法：图标按钮 `aria-label` 走 i18n（新增 `a11y.*` 词条）、`InputLabel id` + `Select labelId`、分离标签用 `id` + `slotProps.htmlInput["aria-labelledby"]`。merchant `/reports` 因挂 ECharts（canvas）未纳入 jsdom 断言，交手动走查。

4. **consumer-next 商品详情页输出 `schema.org/Product` JSON-LD**。✅ 2026-09-01 完成。

   **形态**：`buildProductJsonLd()`（`src/lib/product-jsonld.ts`）在 `page.tsx` **服务端**从同一份 `queryClient` 数据生成，内联进首屏 HTML——这是它存在的意义，不依赖水合爬虫就能拿到。多 SKU 用 `AggregateOffer`（lowPrice/highPrice 按数值比较，不按字符串），单 SKU 退化成 `Offer`。`availability` 只看 `stockLocked`（proto 里唯一库存字段，且语义是「锁定」非「可售」，所以只敢分有/无）。**不写 `description`/`brand`**——proto 没这两个字段，编造会被判误导性标记。`<` 转义成 `\u003c` 防 `</script>` 提前闭合。

   **漂移防线是结构性的，不是靠自觉**：`formatMoney`（页面展示）与 `moneyToDecimalString`（JSON-LD）都抽到 `src/lib/money.ts`，前者调后者——两处不可能算出不同数字。`canonical` 与 JSON-LD 的 `url` 也抽成同一个 `productUrl()`，搜索引擎会拿两者互相校验。

   **验收走真 SSR**：`frontend/apps/consumer-next/scripts/verify-runtime.mjs`（mock 网关 + `next dev`）从服务端 HTML 里正则出 JSON-LD，断言类型/sku/url/`Offer` 退化/`price === "99.5"`/币种/库存，并断言页面文本含同一个 `CNY 99.5`。红测：把 JSON-LD 的 price 改成丢 nanos 的 `units.toString()` → `'99' !== '99.5'` 红。Google Rich Results Test 需公网可达，dev 环境未跑，留待上线后补。

5. **speculation rules 不做**，按 §3.4 的触发条件重估。

## 五、TDK 与收录范围

> 2026-09-28 按行业关键词整理全站 TDK（title / description / keywords）时确立。依据是百度《网页标题规范》《基础信息设置规范》与 Google Search Central，链接见 §六。

### 5.1 只有 consumer-next 的公开页参与收录

| 应用与路由 | 收录 | 做法 |
|---|---|---|
| consumer-next `/`、`/en` | 是 | 首页 TDK，见 5.2 |
| consumer-next `/{zh,en}/product/{spuCode}` | 是 | 按商品数据生成，见 5.3 |
| consumer SPA 全部路由 | 否 | `index.html` 写死 `<meta name="robots" content="noindex">` |
| merchant、admin | 否 | `index.html` 写死 `noindex, nofollow` |

依据是 [i18n-routing.md](../design/platform/i18n-routing.md) 第三节：公开可收录页走 `/:lang/` 的 SSR，登录后的应用内页面不需要收录。SPA 首屏 HTML 是空壳，百度等不执行 JS 的爬虫拿不到正文；SPA 里还有与 consumer-next 重复的 `/product/$spuCode` 和占位的 `/categories`。要把某个 SPA 路由做成公开页，先迁到 consumer-next，不要删 SPA 的 `noindex`。

SPA 的 `/product/$spuCode` 用 `noindex` 是按现状的折中，不是最优解：

- Google 对站内重复页推荐 `rel="canonical"` 而不是 `noindex`，`noindex` 会让这个 URL 被整个挡在搜索之外，它的外链信号也就归并不到规范页。
- 但 SPA 的 `index.html` 是所有路由共用的静态壳，写不了按路由的 canonical；而静态 HTML 带 `noindex` 的页面 Google 不会排队渲染，靠 JS 按路由移除 `noindex`、补 canonical 都不可靠。这个 URL 目前只出现在 SPA 内部导航里，外链信号可以忽略。
- 它和设计有一处冲突：i18n-routing.md §4.1 把中文商品页的规范 URL 定为裸路径 `/product/{spuCode}`，现在 consumer-next 用的是 `/zh/product/{spuCode}`，裸路径仍由 SPA 提供。按 §4.1 对齐时，应让网关把 `/product/*` 分给 consumer-next，由 SSR 页取代 SPA 页，SPA 的 `noindex` 也就不再作用于这个路径。

`robots.txt`（由 SPA 的 `public/` 提供）保持允许抓取，不要为这些页面加 `Disallow`：爬虫被挡在门外就读不到 `noindex`，外链指向的 URL 反而可能以「无摘要」的形式留在索引里。

### 5.2 写法约定

- **分隔符只用 ` - `**。百度标题规范建议把 `|`、`_`、`——` 等间隔符统一为 `-`，括号内超过 4 个字的 `【】` 建议删除。
- **首页**用「品牌名 - slogan」，slogan 位放行业词：「综合网上购物商城」加首页类目竹架上的类目。类目必须在竹架（`demoCategories`）上真实存在，改竹架时同步改 `src/home/copy.ts`。
- **子页面**按百度内容页格式「内容标题 - 列表/频道名(可省) - 站点名」。站点名由 `app/[lang]/layout.tsx` 的标题模板按语言补在最末，英文页补 `Lantern Market`。站点名放最末只适用于子页面，首页是品牌在前。
- **描述**概括页面核心内容与服务，首页 50 字左右（百度建议值）。只写页面兑现得了的信息：不写「正品」「低价」「包邮」「在线下单」这类当前页面兑现不了的承诺，不用「最」「第一」等广告法绝对化用语。
- **keywords** 对主流搜索引擎排序基本没有作用：Google 官方声明完全不用它排序；百度官方文档没有说明它的作用，第三方转载的百度站长问答称其「不见得会起到预期的排序效果」（链接见 §六）。只放少量准确的词，不堆砌，也不值得花时间调优。

### 5.3 商品详情页

- 标题是「商品名价格与规格 - 灯市」。proto 没有类目，频道名省略；内容标题写成「主体 + 方面」，与百度规范的内容页示例「红烧肉的做法 - 菜谱 - 香哈网」同一写法。「价格」是商品页最常见的搜索意图词，页面确实展示了价格和规格，不属于文不对题；没有任何 SKU 带价格时，标题只留商品名。
- 商品名按显示宽度截断到约 30 个汉字（上限 60，汉字、全角字符和 emoji 记 2，其余记 1），以字素为单位，国旗、ZWJ 组合 emoji 不会被拆开。商家填的长标题常是堆词，整段放进标题容易被百度按标题堆砌处理。
- 描述由商品名、规格数、前 3 个规格名和最低价拼成。价格只经 `lib/money.ts` 的 `formatMoney` 格式化，与页面展示、JSON-LD 同源。不写库存（`stockLocked` 是锁定库存）、类目、品牌和参数：proto 没有这些字段，或者页面没有展示。
- keywords 是商品名，页面展示价格时再加「商品名价格」；商品名超出标题宽度时不输出，因为截断会切出半个词。
- 查询失败分两种处理，两种都给出与故障态页面一致的标题和描述，不继承首页描述。
  - product 服务返回 `not_found`（该服务约定商品缺失必须是 `not_found`），或 `invalid_argument`（spuCode 不合法，例如超过 proto 的 `max_len: 64`，这个 URL 永远取不到商品）：输出 `noindex, follow`，并且不输出 canonical 与 hreflang，避免一个 `noindex` 页面同时指认规范地址。
  - 网关自己返回的 `not_found` 不算：路由表缺 GetProductDetail 时 control-tower 也回 `not_found`（reason `ROUTE_NOT_FOUND`）。网关自身的错误带 `X-Error-Reason` 头、ErrorInfo 域为 `gateway.control-tower`，按下一条的故障处理，判定见 `lib/gateway-error.ts`。只看错误码的话，路由配置出错期间生成的每个商品页都会被打上 `noindex`。
  - 其余错误：不输出 `noindex`，保留 canonical 与 hreflang。ISR 会把故障页缓存 60 秒，爬虫恰好这时来抓，打了 `noindex` 的正常商品就会被移出索引。
- `generateMetadata` 与页面组件经 `lib/product-detail-loader.ts` 的 React `cache` 共用一次 RPC。Next 的请求记忆只作用于 fetch，而 connect-node 直接走 `node:http`/`http2`，不经过 fetch；不去重的话每次生成都要打两次网关。

### 5.4 流式 metadata 不影响爬虫（已实测）

Next 16 默认把 `generateMetadata` 的结果流式追加到 `<body>`，只对「HTML 受限爬虫」名单里的 UA 阻塞渲染、输出到 `<head>`。默认名单包含 Baiduspider、Sogou、Bingbot，**不包含** 360Spider、YisouSpider（神马）和 Bytespider（头条）。

2026-09-28 用生产构建（standalone）加 mock 网关实测：商品页是 ISR，生成时走完整预渲染。无论首次触发生成的是浏览器还是爬虫、UA 在不在名单里，`<title>` 与 description 都在 `<head>` 里，所以不需要配置 `htmlLimitedBots`。同一轮实测确认每次生成只打一次 GetProductDetail。商品页改成纯动态渲染时（去掉 `revalidate`、读取 cookie 等），这条结论可能失效，需要重新实测。

### 5.5 已知缺口

- 商品不存在和服务故障都返回 HTTP 200。更好的做法是前者调用 `notFound()` 返回 404，后者抛错，让 ISR 继续提供上一份成功页面。这会改变页面行为，这次没有处理。
- 首页商品是演示数据：13 个 `DEMO-*` 编码在后端种子里都不存在，点进去是「商品不存在」页（`noindex`）；类目链接指向 SPA 的占位页 `/categories`。所以首页描述只写页面上确实存在的类目结构与站内搜索，不写「汇集好物」这类宣称有货的说法。TDK 解决不了内容单薄：真实货架和分类页上线前，「网上购物」这类行业大词很难拿到排名，新站的自然流量主要来自商品页的长尾词。
- 线上 SKU 的规格名、编码、锁定库存和缩略图全是空值，这是后端缺陷，不在 TDK 范围内。`products.skus` 没有 `sku_name` 列；`services/product/internal/data/product.go` 把 `json_agg(k.*)` 解进没有 json tag 的 `biz.ProductSku`，`sku_code`、`stock_locked`、`thumbnail_url` 这类带下划线的键对不上字段。影响：商品页规格名空白，描述里只能写「共 N 款规格可选」；JSON-LD 的 `availability` 全部是 `OutOfStock`，也没有图片。
- 百度要求首页标题与 ICP 备案的网站名称一致。备案名不是「灯市」时，要同步调整首页标题的品牌位。

## 六、参考

- [HTML Standard — Sections](https://html.spec.whatwg.org/multipage/sections.html) · [MDN 语义化元素](https://developer.mozilla.org/zh-CN/docs/Glossary/Semantics)
- [MUI Typography `component` prop](https://mui.com/material-ui/react-typography/) · [schema.org/Product](https://schema.org/Product)
- [Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API) · [prerender 与 `document.prerendering`](https://developer.chrome.com/docs/web-platform/prerender-pages)
- [百度搜索网页标题规范](https://ziyuan.baidu.com/college/articleinfo?id=2728) · [百度搜索基础信息设置规范：首页](https://ziyuan.baidu.com/college/documentinfo?id=3390&page=2)
- [Google：Influencing title links](https://developers.google.com/search/docs/appearance/title-link) · [Google：meta description 与摘要](https://developers.google.com/search/docs/appearance/snippet) · [Google does not use the keywords meta tag](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag)
- [Google：规范网址与重复页](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) · [Google：JavaScript SEO 基础（`noindex` 页面不进渲染队列）](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- 百度站长问答中关于 meta keywords 的答复（第三方转载，非百度官方页面）：[百度俱乐部站长问答整理](https://blog.tag.gg/showinfo-36-12168-0.html)
