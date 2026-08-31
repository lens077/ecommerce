# 前端无障碍性（a11y）实施与验证手册

> 适用范围：`frontend/` 五个 app（consumer / merchant / admin / desktop / consumer-next）与 `packages/ui`。
> 目标标准：**WCAG 2.2 AA**；国内合规锚点为 GB/T 37668-2019 与工信部「互联网应用适老化及无障碍改造」要求（电商属重点行业）。
> 现状基线（2026-08-31 实测）：代码已有约 45 处 ARIA 用法且质量合格——图标按钮 `aria-label` 走 i18n、错误提示用 `role="alert"`、装饰性 SVG 有 `aria-hidden`；jsx-a11y lint 规则**已开启并红测通过**（2026-08-31，见 §四.1）；关键四页的 axe 断言**已落地并红测通过**（2026-08-31，见 §四.2）；Lighthouse 首页基线**桌面/移动双 100**（2026-08-31，见 §四.3）。

## 一、实施原则（按影响排序）

1. **语义化优先，ARIA 是兜底**：能用原生 `<button>`/`<label>`/`<nav>`/`<main>` 就不写 `div onClick + role`。手写 HTML 的 consumer-next 页面尤其注意。
2. **依托 MUI、不破坏 MUI**：Dialog 焦点圈闭、Menu 键盘导航、roving tabindex 等 MUI 已内置。业务侧职责：图标按钮必给 `aria-label`（文案走 i18n）、装饰图 `aria-hidden`、不用裸 `div` 造可点元素。
3. **SPA 路由切换的焦点管理**（最常漏）：TanStack Router 换页后焦点留在旧节点，读屏用户感知不到换页。切换后把焦点移到新页 `<h1>` 或 `main`，并同步更新 `document.title`。
4. **键盘全覆盖**：「搜索 → 商品详情 → 加购 → 结算」全旅程纯 Tab 可达；焦点样式可见（禁 `outline: none`）；Esc 关闭弹层。
5. **表单**：`label` 关联输入；错误文本经 `aria-describedby` 挂到字段；必填标 `aria-required`。
6. **电商语义细节**：商品图 `alt` 用商品名；价格、折扣、库存状态不得只靠颜色区分；促销倒计时等动效尊重 `prefers-reduced-motion`。
7. **多语言**：`<html lang>` 随 zh/en 切换——读屏发音引擎靠它选语言。
8. **对比度**：正文 ≥4.5:1、大字 ≥3:1，在定 MUI theme palette 时即检查，不留到页面层补救。

## 二、实现工具与接入点

| 层 | 工具 | 接入点 | 状态 |
|---|---|---|---|
| 静态检查 | oxlint 内置 jsx-a11y 规则集（`alt-text`、`aria-props` 等） | 根 `frontend/vite.config.ts` 的 `lint` 块——实测为 oxlint 配置直通。⚠️ `plugins` 字段是**整体替换**语义：必须连同默认四项（react/unicorn/typescript/oxc）一并列出，否则会静默关掉现有规则；验证方法是看规则计数上升（112→166）而非下降 | 已开启（2026-08-31） |
| 组件层 | MUI（WAI-ARIA APG 模式已内置） | `packages/ui` 与各 app；仅自绘组件（如 `DemoArt`）需手写 ARIA，对照 [APG 模式库](https://www.w3.org/WAI/ARIA/apg/patterns/) | 已具备 |
| 开发时 | axe DevTools / Accessibility Insights 浏览器扩展；可选 `@axe-core/react`（dev 模式 console 报违规） | 本地开发流程 | 按需 |
| 设计侧 | [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) | theme 定色环节 | 按需 |

## 三、分层验证

| # | 层 | 手段 | 说明 |
|---|---|---|---|
| 1 | lint 门禁 | jsx-a11y 规则开启后由 `vp check --fix` 承载 | 已在 pre-commit `staged` 链路里，规则开启即自动生效 |
| 2 | 运行时自动扫描 | `vitest-axe`（jest-axe 的 vitest 移植）对关键页断言零 axe 违规 | 已落地 `apps/consumer/src/a11y/pages.a11y.test.tsx`。consumer 默认测试环境实测为 jsdom（`test` script 显式 `--environment=jsdom`），正是 vitest-axe 主场；vitest 4 下 matcher 类型需本地补 `Matchers` 接口合并（vitest-axe 0.1.0 只增强旧版 Assertion，且类型参数必须与 vitest 的 `<T = any>` 完全一致）。将来若建独立 Playwright E2E 套件，改用 `@axe-core/playwright` 扫整条旅程 |
| 3 | Lighthouse accessibility 审计 | 本地 dev server 起后跑一次拿基线分并存档；CI 化用 lhci | 与性能审计同工具不同维度 |
| 4 | 手动键盘走查 | 每迭代对改动页纯键盘过主旅程 | 自动化抓不到焦点顺序合理性 |
| 5 | 读屏实测 | macOS VoiceOver（Cmd+F5）+ Safari；移动端 iOS VoiceOver / Android TalkBack | 只盯关键旅程，控制成本 |
| 6 | 低视力场景 | 200% 缩放不出横向滚动条；`prefers-reduced-motion` 生效 | 浏览器手测 |

**自动化上限**：axe/Lighthouse 只能发现一部分问题（经验上约三分之一到一半；焦点顺序合理性、读屏播报语义、认知负荷判断不了）。第 4/5 层手动验证不可省，但可以只覆盖关键旅程。

## 四、落地顺序与验收判据

按「静默失效要实测」的仓库纪律（同 Vector VRL 脱敏的 CI 红测先例，见 `docs/TECH-RADAR.md` §8.5），每一步都要先证明门禁会红：

1. **开启 jsx-a11y 规则**（根 `vite.config.ts`）。验收：对一个故意违规样本（如无 `alt` 的 `<img>`）`vp lint` 必须报错；删除样本后全绿。✅ 2026-08-31 完成：canary 命中 `jsx-a11y(alt-text)` 且退出码 1，删除后 0 警告 0 错误。存量 3 条告警同轮清零——`exhaustive-deps`（随插件数组顺带激活的 react-hooks 规则，指出的是真问题，AuthProvider 补入恒稳定依赖修复）、`prefer-tag-over-role`（对内联 SVG 的 `role="img"` 系统性误报，规则关闭并在配置注释说明）、`no-autofocus`（对话框打开聚焦首个输入符合 APG dialog 模式，行内豁免）。
2. **vitest-axe 断言关键页**（首页、商品详情、购物车、结算）。验收：注入违规的页面用例红，修复后绿。✅ 2026-08-31 完成：jsdom + 真 routeTree（内存 history）+ `createRouterTransport` 服务桩整页渲染，axe 扫 `document.body`（portal 一并覆盖）；范围限 WCAG A/AA 标签、color-contrast 显式关闭（归 §四.3）。红测双重达成——①常驻 canary（用 `createElement` 搭违规 DOM，刻意绕开 §四.1 的静态门禁，两层门禁互不拆台）检出 `image-alt`/`label`；②四页首轮真红：PrivacyConsent 关闭按钮无可及名称（`button-name`），因对话框默认打开且挂在 `__root`，一个缺陷同时打红商品/购物车/结算三页，已修（`aria-label` 走 i18n，新增 `privacy.close` 词条）。查询技巧沉淀：对话框打开时 MUI Modal 会给应用根容器标 `aria-hidden`，testing-library 的 role 查询须加 `hidden: true` 才等得到主内容。
3. **Lighthouse 基线**：consumer 起 dev server 跑一次 accessibility 审计，分数与逐项结果存档，作为后续迭代的对照基线。✅ 2026-08-31 完成（仅 consumer，dev server 3000 端口，Lighthouse CLI）。首访态（隐私弹窗开）桌面/移动均 **98**，唯一违规 `heading-order`——DialogTitle 默认渲染 `h2`、小节标题 `subtitle1` 渲染 `h6` 层级跳跃，加 `component="h3"` 修复后**双端 100**。已同意态（`addInitScript` 预置 localStorage，主内容不被弹窗 aria-hidden）另跑 axe `color-contrast` 专项：**0 违规**、66 个节点因渐变/发光背景自动判定不了〔转 §四.4 手动抽查项〕。操作事实：dev server 实测只监听 IPv6，审计地址要写 `http://[::1]:3000/`；本机无系统 Chrome，`CHROME_PATH` 指向 Playwright 的 Chromium 即可；匿名审计需 `GATEWAY_PROXY_TARGET` 指死端口——网关可达时匿名首页会被全局「401→重新登录」逻辑重定向到 `/api/auth/login`（404），这是独立于 a11y 的产品问题，待入 TODO。购物车/结算页需登录态，Lighthouse navigation 模式带不上会话，留给已登录浏览器的 snapshot 审计。
4. **手动走查清单**：主旅程键盘走查 + VoiceOver 过一遍，问题按页面记录进对应迭代。

## 五、参考

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- GB/T 37668-2019《信息技术 互联网内容无障碍可访问性技术要求与测试方法》
- [MUI Accessibility](https://mui.com/material-ui/getting-started/accessibility/) · [oxlint jsx-a11y 规则](https://oxc.rs/docs/guide/usage/linter/rules.html) · [axe-core](https://github.com/dequelabs/axe-core)
