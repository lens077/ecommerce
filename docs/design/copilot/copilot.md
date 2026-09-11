# 页内智能助手（copilot）设计：规则驱动的界面操作

> 2026-09-10 设计草案。目标是把腾讯云 KiKi「界面模式」的交互形态搬进本仓三个前端 app：
> 用户在聊天面板提问，助手把固定句式匹配成页面动作，在**当前页面内**带着用户做完，过程可视、可中断。
> **不引入 LLM，不新增后端服务**：第一期只需要固定行为，意图解析用前端正则完成，整个方案是一个前端共享包。
> **落地状态（2026-09-10）**：S1/S2 已在分支 `feat/copilot-ui-mode` 实现——`frontend/packages/copilot`、三个 app 的接线、
> admin `/monitor` 页，以及 `frontend/e2e/copilot.e2e.ts`（`pnpm e2e:copilot`，6 条全绿）。本文与实现的差异见 §九。
>
> **现状事实（2026-09-10）**：三个 app（consumer / merchant / admin）没有聊天或 AI 相关代码；admin 没有监控路由；
> consumer 的搜索框在 `frontend/apps/consumer/src/components/AppBar.tsx`，输入即出下拉结果，没有独立搜索结果页；
> merchant 的 `routes/orders/index.tsx` 用本地 mock 数据做状态筛选（`pending / shipped / completed`），
> `backend/api/order/v1/order.proto` 没有状态字段。
> 本文凡写「现在」指第一期实现，凡写「目标」指依赖尚未落地的部分，不得把目标写成能力。
>
> 术语见 [../../GLOSSARY.md](../../GLOSSARY.md)。

## 一、调研结论：没有现成实现，只有零件

KiKi 是腾讯云 2026-03-20 上线的官网内置 Agent，基于腾讯内部 Helix 平台，**未开源**。
`gh search repos` 在 Tencent / TencentCloud / TencentCloudADP 组织及全站检索「kiki」「helix」均无命中；
腾讯云文档中心 `product/871` 是同名小程序，与界面模式无关。

GitHub 上没有项目同时具备「聊天面板 + 意图匹配 + 页面内带光标高亮地替用户操作」。可复用的零件：

| 层 | 项目 | 许可 | 借什么 | 不借什么 |
|---|---|---|---|---|
| 蒙层 + 元素聚焦 | [nilbuild/driver.js](https://github.com/nilbuild/driver.js) | MIT | 蒙层裁剪算法（`clip-path` 挖洞）、滚动到视口、步骤气泡定位 | 它的气泡样式与 API，不满足渐变描边与光标需求 |
| 拟人光标轨迹 | [Xetera/ghost-cursor](https://github.com/Xetera/ghost-cursor) | MIT | `path()` 贝塞尔曲线函数，作者声明可用于任意 2D 平面 | puppeteer 相关部分 |
| 页外驱动浏览器 | [web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)、[nanobrowser](https://github.com/nanobrowser/nanobrowser)、[browser-use](https://github.com/browser-use/browser-use) | MIT / Apache-2.0 | 无 | 靠截图或全量 DOM 由外部驱动，是扩展或测试形态，不能嵌入业务页 |

**决策**：自建一个前端包。需要的执行原语只有九个（§4.4），视觉层是纯 CSS/SVG，意图匹配是一张正则表；
引入任何一个上述框架都会带来比自写更多的适配代码。

## 二、定位与边界

copilot 只做一件事：**把一句固定句式的输入匹配成当前角色允许的页面动作序列，并在页面内可视地执行**。

| 职责 | 属于 copilot | 不属于 copilot |
|---|---|---|
| 聊天面板、界面模式开关、步骤展示 | ✅ | — |
| 意图匹配（前端正则 + 同义词表） | ✅ | — |
| 页面内执行：导航、移动光标、高亮、输入、点击、选择 | ✅ | — |
| 按角色过滤可用动作与提示 | ✅ | — |
| 业务查询本身（搜索商品、拉订单、健康状态） | — | 页面已有的调用，copilot 只触发它们 |
| 自由问答、句式泛化 | — | 明确不做；未命中时列出可用问法 |
| 任意 DOM 选择器操作、页外浏览器控制 | — | 明确不做（§4.6） |
| 写操作（发货、退款、改价） | — | 第一期不注册任何写动作；引入时必须走 `confirm` 步骤 |
| 网络请求 | — | copilot 自身不发任何请求 |

与 KiKi 的差异：KiKi 跨官网、控制台、购买页多站点操作并由模型泛化问法；本仓三个 app 是独立 SPA，
copilot **不跨 app**、**不泛化问法**，每个 app 只注册自己的动作与句式。

## 三、总体架构

```
┌──────────── 浏览器（consumer / merchant / admin，任一 app）────────────┐
│  CopilotPanel（聊天）  ──输入──▶  IntentMatcher（正则表，按角色过滤）        │
│        ▲                                   │ 动作名 + 参数                  │
│        │ 步骤卡片 / 结果文本                  ▼                                │
│  Executor（执行器） ◀──步骤序列── ActionRegistry（本 app 注册的动作）        │
│        │                                                                  │
│        ▼                                                                  │
│  OverlayLayer（蒙层 + 渐变描边 + 大指针） → 真实 DOM（data-copilot 锚点）    │
└──────────────────────────────────────────────────────────────────────────┘
```

一次请求的时序：

1. 面板把输入做归一化（§4.3），交给 IntentMatcher。
2. IntentMatcher 只在当前角色允许的动作里按顺序试正则，首个命中的动作与捕获组参数胜出；全部未命中走「未命中」交互。
3. 动作的 `plan(params)` 展开为原语步骤，交给执行器串行执行，每步驱动视觉层并操作 DOM。
4. 执行完成或被用户中断，动作的 `summarize()` 从页面状态取结果文本追加到面板。

全程无网络请求、无后端、无配置项。

## 四、前端：`frontend/packages/copilot`

新建 workspace 包 `@ecommerce/copilot`，三个 app 共用；`.service-matrix.yaml` 的 `frontend.packages` 追加 `copilot`。
依赖只加 `@ecommerce/ui`、`@ecommerce/i18n` 与各 app 已有的 MUI / TanStack Router / Zustand，不引入新的动画库
（光标与描边用 CSS transition 与 Web Animations API）。

### 4.1 组件

| 组件 / Hook | 职责 |
|---|---|
| `<CopilotProvider role router>` | 放在各 app `__root.tsx`，持有注册表、执行器状态、面板开关；`role` 来自各 app 现有用户 store |
| `<CopilotPanel>` | 右下角浮动面板，含消息列表、输入框、「界面模式」开关、停止按钮、「你可以这样问」提示；样式沿用 `DESIGN.md` 灯市 token |
| `useCopilotAction(action)` | 页面或布局组件里注册动作（§4.2），组件卸载即注销 |
| `data-copilot="<anchor>"` | 可被操作的元素标记；执行器只认这个属性，不认其他选择器 |
| `<CopilotOverlay>` | 视觉层（§4.5），由执行器驱动，平时不挂载 |

### 4.2 动作契约

```ts
interface CopilotAction {
  name: string;               // ^[a-z][a-z0-9_]{2,40}$，app 内唯一，例如 search_products
  roles: Role[];              // customer | merchant | admin
  patterns: RegExp[];         // 命中即触发；命名捕获组即参数，例如 (?<keyword>.+)
  examples: string[];         // 面板「你可以这样问」展示，也是 vitest 的必命中样例
  sensitive?: boolean;        // true 时执行前插入 confirm 步骤；第一期所有动作为 false
  plan(params, ctx): Step[];  // 把参数展开为原语步骤（§4.4），纯函数，不做副作用
  summarize?(ctx): string;    // 执行后给面板的结果文本，例如「找到 12 件商品」
}
```

锚点命名 `<区域>.<元素>`，例如 `appbar.search-input`、`orders.status-filter`。

### 4.3 意图匹配规则

归一化，按顺序执行：去首尾空白；全角标点转半角；去掉成对的 `「」`、`“”`、`""`、`''`；
去掉句末的 `。！？!?`；英文转小写。**不做分词**，三条固定命令不需要。

匹配：

- 只在 `roles` 包含当前角色的动作里试；动作按注册顺序、正则按数组顺序，首个命中胜出。
- 捕获组为空或只有空白视为未命中，继续试下一条。
- 同义词映射写在动作内部而不是正则里，例如「没有发货 / 未发货 / 待发货 / 没发的」→ `pending`，便于阅读与测试。
- 一个输入只触发一个动作；「先 A 再 B」这类复合句不支持，未命中处理。

未命中交互：面板回复「我还不会这个。你可以这样问：」并列出当前角色所有动作的 `examples`，每条可点击直接发送。
未命中不弹蒙层、不动页面。

每个动作的 `examples` 必须全部命中自己的 `patterns`，并且不命中同角色的其他动作；这是 vitest 的固定断言（§六）。

### 4.4 执行器原语

执行器是一个串行状态机，每步有超时（默认 8 秒，等待锚点出现的时间包含在内），任一步失败即整体停止并在面板说明停在哪一步。

| 原语 | 参数 | 行为 |
|---|---|---|
| `navigate` | `path` | 调 TanStack Router `navigate`，等待路由稳定 |
| `waitFor` | `anchor` | 轮询锚点出现并在视口内（必要时 `scrollIntoView`），超时失败 |
| `moveCursor` | `anchor` | 大指针沿贝塞尔路径移到元素中心，用时随距离 300–700 ms |
| `highlight` | `anchor`, `text` | 蒙层挖洞聚焦该元素，元素外沿渐变描边，旁边显示步骤文字 |
| `type` | `anchor`, `value` | 聚焦输入框，逐字写入（每字 30–60 ms），按下表方式触发 React 受控更新 |
| `press` | `anchor`, `key` | 在锚点上派发 `keydown`/`keyup`（例如 Enter 触发搜索；consumer 搜索框是回车才查，不是输入即查） |
| `click` | `anchor` | 指针按下动画后派发真实 `click`，等价用户点击 |
| `select` | `anchor`, `optionAnchor` | MUI `Select`：按下表方式打开菜单，`waitFor` `optionAnchor` 再 `click`，不直接改 state |
| `say` | `text` | 面板追加一条助手文本 |
| `confirm` | `text` | 面板弹出确认，用户点「继续」才往下走；`sensitive` 动作自动插入 |

直接操作 DOM 在 React + MUI 下有三个已知坑，执行器按右列实现：

| 场景 | 直接做会怎样 | 执行器做法 |
|---|---|---|
| 给受控 `<input>` 赋值 | `el.value = x` 后 React 的 `onChange` 不触发，React 追踪的是原型 setter | `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, x)`，再 `el.dispatchEvent(new Event("input", { bubbles: true }))`；`textarea` 同理换原型 |
| MUI `Select` | 它监听 `mousedown` 而不是 `click`，派发 `click` 打不开菜单 | 对 `role="combobox"` 元素派发 `mousedown`（`bubbles: true`），菜单挂到 `body` 后对目标 `li[role="option"]` 派发 `click` |
| 页面跳转 | `location.href = path` 整页刷新，面板状态与执行进度丢失 | 只用 Router `navigate`；执行器从 Provider 拿 router 实例 |

按钮、链接、复选框派发真实 `click` 即可，与用户点击等价；页面逻辑单一来源，不另写「假点击」旁路。

中断：面板「停止」按钮和 `Esc` 键都能在任意步之间停止；正在进行的 `type` 立即结束，不回滚已输入内容。

### 4.5 视觉层规格

对应截图中 KiKi 的三个可见元素。颜色取自 `DESIGN.md` 灯市 token，不用 KiKi 的蓝
〔若要保留蓝色品牌渐变，改 token 一处即可，待确认〕。

| 元素 | 规格 |
|---|---|
| 页面蒙层 | `position: fixed; inset: 0; z-index` 高于 MUI Modal；背景 `rgba(42,42,40,0.35)`（`ink` 35%）；四边 3 px 渐变描边：`linear-gradient(135deg, vermilion, glow, vermilion)`，用 `padding + mask` 只保留边框，`background-size: 300%` 做 4 秒循环流动 |
| 聚焦挖洞 | 蒙层用 `clip-path: polygon(...)` 挖出目标元素矩形（外扩 6 px，圆角 8 px），随滚动与尺寸变化重算（`ResizeObserver` + `scroll` 监听） |
| 元素描边 | 目标元素外套一个绝对定位的框，同样的渐变边框 2 px + `box-shadow: 0 0 0 4px glow/40%`，与挖洞同步 |
| 大指针 | 32×32 SVG，箭头形，填 `vermilion` 描 `paper`；移动用 WAAPI 沿贝塞尔采样点位；`click` 时 120 ms 缩放到 0.85 再回弹 |
| 步骤卡片 | 面板内当前步骤高亮显示，同时在目标元素旁显示同一文字（截图里「点击七层流量策略的编辑按钮，准备修改阈值」的形态） |
| 减弱动效 | `prefers-reduced-motion: reduce` 时指针瞬移、描边不流动、逐字输入改为一次写入 |
| 无障碍 | 每步文字进 `aria-live="polite"` 区域；蒙层不抢焦点，键盘用户可随时 `Esc`；面板按钮全部有可及名称（i18n） |

### 4.6 安全与边界

- 执行器只接受 `data-copilot` 锚点；动作的 `plan()` 返回的步骤里不允许出现选择器字符串，类型上就不提供这个字段。
- 角色过滤只影响「能匹配到哪些动作」；动作触发的页面调用仍由网关与后端按身份裁决，copilot 不绕过任何权限（TECH.md §8.5）。
- 第一期不注册写动作；引入时必须 `sensitive: true`，并在本文 §五追加链路描述。
- 不记录用户输入原文；如需统计，只上报动作名与成败到现有 tracker（是否上报待落地时定）。

## 五、三条演示链路

每条链路给出：动作、正则、锚点、`plan()` 展开的步骤、结果文本、当前阻塞。

### 5.1 用户：「帮我查 XX 商品」

- 动作 `search_products`，`roles: [customer]`
- 正则：`/^(?:帮我|请|麻烦)?(?:查|搜|找|搜索|查找)(?:一下|下)?(?:商品)?(?<keyword>.+?)(?:商品|这个商品|的商品)?$/`
- `examples`：「帮我查保温杯」「搜一下保温杯商品」「找保温杯」
- 锚点：`appbar.search-input`（`AppBar.tsx` 的输入框）、`appbar.search-results`（下拉结果容器）、`appbar.search-result-item`（每一项）
- 步骤：`moveCursor(appbar.search-input)` → `highlight(appbar.search-input, "在搜索框输入「XX」")` → `type(appbar.search-input, keyword)` → `press(appbar.search-input, Enter)` → `waitFor(appbar.search-results)` → `highlight(appbar.search-results, "这些是搜索到的商品")` → `say(summarize)`
- 结果文本：数 `appbar.search-result-item`、读 `appbar.search-result-name` 的前 5 个，「找到 N 件商品：…」；命中为 0 时说明并建议换词
- 现状：搜索框是**回车或点放大镜才查**（`handleSearch`），所以要有 `press` 步；没有独立结果页，「列出」发生在下拉与面板两处。若后续做 `/products?q=` 结果页，把最后两步改成 `navigate`

### 5.2 商家：「帮我查看没有发货的订单」

- 动作 `filter_orders`，`roles: [merchant]`
- 正则：`/^(?:帮我|请)?(?:查看|查|看看|看|找|筛选)(?:一下|下)?(?<status>没有发货|未发货|待发货|没发的|没发货|已发货|已完成)(?:的)?订单$/`；同义词映射：`没有发货 / 未发货 / 待发货 / 没发的 / 没发货 → pending`，`已发货 → shipped`，`已完成 → completed`
- `examples`：「帮我查看没有发货的订单」「看看未发货订单」「找待发货的订单」
- 锚点：`orders.status-filter`（MUI `Select`）、`orders.status-option-<value>`（每个 `MenuItem`）、`orders.table`
- 步骤：`navigate("/orders")` → `waitFor(orders.status-filter)` → `moveCursor` → `highlight(orders.status-filter, "切换状态筛选")` → `select(orders.status-filter, orders.status-option-pending)` → `highlight(orders.table, "这些是待发货订单")` → `say(summarize)`
- 结果文本：「共 N 笔待发货订单」，N 取自筛选后表格行数
- 现状：订单页是 mock 数据，`order.proto` 无状态字段。演示链路在 mock 上可以跑通；接真数据时 `status` 枚举要与 order 域的状态机对齐（[order/checkout.md](../order/checkout.md)），届时改同义词表，本文同步

### 5.3 管理员：「帮我查看监控」

- 动作 `open_monitor`，`roles: [admin]`，无参数
- 正则：`/^(?:帮我|请)?(?:查看|打开|看看|看|进入|去)(?:一下|下)?(?:系统|服务)?监控(?:页|页面|面板)?$/`
- `examples`：「帮我查看监控」「打开监控页」「看看服务监控」
- 步骤：`say("带你去监控页")` → `navigate("/monitor")` → `waitFor(monitor.health-grid)` → `highlight(monitor.health-grid, "这里是各服务的健康状态")`
- 新建路由 `frontend/apps/admin/src/routes/monitor/index.tsx`：**第一期只放服务健康卡片**——按 `.service-matrix.yaml` 的 10 个业务服务各一张卡片，显示服务名、网关前缀、状态。状态数据源待确认：网关当前是否向前端暴露各服务的 `readyz` 聚合尚未核实；核实前卡片显示「未接入」态，不显示假数据。可复用 [platform/voxel-construction-site.md](../platform/voxel-construction-site.md) 定义的健康聚合器契约
- 侧栏导航同步加「监控」入口，否则用户不通过助手到不了这页

## 六、分期与验收

| 期 | 交付 | 验收锚点 |
|---|---|---|
| S1 共享包 | `@ecommerce/copilot`：Provider / Panel / 注册表 / IntentMatcher / 执行器 / 视觉层 | `cd frontend && pnpm ready`；包内 vitest：每个动作的 `examples` 全命中且不误命中同角色其他动作；受控 input 赋值后 React `onChange` 被调用；MUI `Select` 经 `mousedown` 打开并选中；`prefers-reduced-motion` 分支；`Esc` 中断 |
| S2 三 app 接线 | 各 app 挂 Provider、标锚点、注册动作；admin `/monitor` 页与侧栏入口 | 三个 app 各一条 vitest：注册动作 → 输入 example → 执行器跑完 → 锚点被点击 / 输入框值正确；现有 a11y 测试不退化 |
| 演示 | dev 环境三条链路人工走通 | 各录一段屏幕录像归 `docs/progress-archive/` |
| 目标态 | 写动作与 `confirm`；健康卡片接真实聚合数据；若固定句式不够用再评估意图解析升级，届时另立设计 | 各自立项时补验收 |

设计稿阶段不改 `TODO.md`；S1 立项时按 TODO 纪律登记到 `docs/todo/` 前端分类并回填计数。

## 七、已定与待确认

已定（2026-09-10 用户裁决）：蒙层与描边用灯市朱红渐变；consumer 对匿名访客也显示面板，角色固定为 `customer`。

待确认：`/monitor` 健康数据来源——网关是否已有可用的聚合端点；核实前卡片显示「未接入」。

## 八、风险

- **句式覆盖不足**：用户换个说法就未命中。缓解：未命中时列出可点的 `examples`；正则表随反馈追加，每加一条补 example 断言。
- **DOM 漂移**：页面改版忘了带上 `data-copilot` 会让链路静默失败。S2 的 vitest 断言锚点存在，并在 `pnpm ready` 里跑。
- **事件派发脆弱**：MUI 升级可能改变 `Select` 的触发事件。S1 的单测用真实 MUI 组件而不是 mock，升级即暴露。
- **z-index 冲突**：蒙层要高于 MUI Modal / Popover，但下拉结果（`appbar.search-results`）又要在蒙层之上可见。做法：蒙层用挖洞而不是遮盖，需要可见的区域一律进挖洞矩形。

## 九、实现与本文的差异（2026-09-10 落地记录）

- **角色来源**：设计写「来自各 app 用户 store」，实现为 app 固定值（consumer=customer / merchant=merchant / admin=admin），因为三个 app 本身就是按角色分的独立 SPA；Provider 的 prop 叫 `copilotRole` 而不是 `role`——jsx-a11y 的 `aria-role` 规则会把自定义组件上的 `role=` 当 ARIA 属性报错。
- **蒙层实现**：没用 `clip-path: polygon`，用挖洞元素的 `box-shadow: 0 0 0 200vmax` 当蒙层，圆角天然跟着洞走，浏览器兼容更省心。
- **锚点矩形跟随**：用 `useSyncExternalStore` 订阅 scroll/resize/ResizeObserver，快照是一串数字；不在 effect 里 setState（oxlint `react/set-state-in-effect`）。
- **右下角冲突**：dev 模式下 TanStack devtools 的悬浮钮也是 fixed 右下角，z-index 到 100000，会截住助手按钮的点击（Playwright 实测）。不跟它比 z-index，把 consumer 的两个 devtools 触发钮挪到左下。
- **e2e 桩网关的坑**：Playwright 路由 glob 若写成「双星 api 双星」，会连 vite 给 `@ecommerce/api` 源码的 URL 也拦掉，应用直接白屏；改用 `url.pathname.startsWith("/api/") || url.port === "8080"` 的函数匹配。
- **e2e 运行方式**：`frontend/e2e/playwright.config.ts` 自起三个 dev server（已在跑则复用），网关代理指到必然拒绝的端口，搜索 RPC 用 `page.route` 桩掉；不需要后端。`@playwright/test` 进 catalog；下载不到配套 Chromium 时用 `E2E_CHROMIUM` 指本机可执行文件。
