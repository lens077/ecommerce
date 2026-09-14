# 首页性能：从 SPA 首屏到 SSR 静态页

> 适用范围：`shop.apikv.com` 首页 `/`（consumer-next 服务端渲染）与 consumer SPA 的首屏加载链。
> 与 [`semantic-html.md`](semantic-html.md)、[`accessibility.md`](accessibility.md) 的分工：那两份管语义与可达性，本份管**加载性能**——PageSpeed / Lighthouse 性能分背后的字节量、请求波次与字体策略。
> 现状基线（2026-09-15 实测）：线上首页移动端 Lighthouse 性能 100（本机 Chrome for Testing 有 91–100 抖动，真实 Chromium 首绘 236–332ms），SEO / 最佳做法 / 无障碍 100，智能体浏览 3/3。改造前 PageSpeed 移动端 61、桌面 88。

## 一、先读分数，再找瓶颈

Lighthouse 性能分 = 五个指标各自得分 × 权重。改造前的移动端：

| 指标 | 值 | 得分 | 权重 | 贡献 |
|---|---|---|---|---|
| FCP | 4.9 s | 0.10 | 10% | 1 |
| LCP | 6.7 s | 0.08 | 25% | 2 |
| Speed Index | 7.5 s | 0.27 | 10% | 2.7 |
| TBT | 140 ms | 0.95 | 30% | 28.5 |
| CLS | 0.001 | 1.00 | 25% | 25 |

TBT 与 CLS 合计 55 分已拿满，丢分全在「多久能看到东西」。这类分数**不要从 JS 执行层面找**（memo、虚拟列表都改善 TBT），要看首屏前必须下载的字节与请求波次。移动端与桌面端跑同一份代码，差 20 分是因为移动端模拟 1.6 Mbps / 150 ms RTT 把字节量暴露出来，桌面 10 Mbps 掩盖了它。

## 二、根因（SPA，改造前实测）

| 问题 | 实测 | 来源 |
|---|---|---|
| 渲染阻塞 CSS 162 KB（gzip） | 解压 363 KB，**100% 是 303 条 `@font-face`**：Noto Serif SC 3 字重 × 101 个 unicode-range 切片，每条带 woff2 + woff；小切片被 Vite `assetsInlineLimit`（4 KB）内联成 base64，占 63 KB | `main.tsx` 三行 `import "@fontsource/noto-serif-sc/{400,700,900}.css"` |
| 启动三段瀑布 | HTML → `index.js` + 7 个 modulepreload + CSS → `await import("./bootstrap")` 第二波 **45 个 chunk**（bootstrap 130 KB + 40 多个 0–2 KB 的 MUI 小 chunk）→ 才 render | 动态 import 让 Vite 无法在 HTML 里预加载第二波 |
| `src-D8Yp*.js` 114 KB gzip（解压 453 KB） | 整套 lucide：`import * as icons from "lucide"` 再按名字动态取，tree-shaking 失效；首页只用 4–5 个图标 | `packages/icons/src/index.tsx` |
| 字体本体 674 KB / 19 个文件 | 首屏渲染后才开始下，`swap` 保住 FCP 但 Speed Index 被拖到 7.5 s | 同上 |
| 静态资源无 `Cache-Control` | `/assets/*` 带 hash 却无 `immutable`，每次回访全量重下 | consumer `Dockerfile` 内嵌 Caddyfile |

`#app` 为空意味着 FCP 永远 ≥ 全部 JS 下载 + 执行。这是架构上限，改字体和分包只能逼近它。

## 三、决策：首页迁到 consumer-next（路线 B）

两条路都能让 `#app` 不空：

| | 路线 A：SPA 构建期预渲染 | 路线 B：首页迁到 consumer-next |
|---|---|---|
| 改动面 | 只改 `apps/consumer`，Caddy 不动 | HTTPRoute、组件共享、SPA 跨 app 跳转 |
| 新增渲染模式 | 第三种（SPA / Next SSR / SPA 预渲染） | 无，归入既有 SSR 轨道 |
| emotion SSR、hydration 边界 | 要在 Vite 侧从零踩 | 商品页已踩过 |
| 登录态 / 语言 / Tauri 差异 | 全部要挪进 effect，否则 hydration mismatch | 首页只有三个小岛 |

选 B。理由：`docs/reports/2026-08-28-nextjs-poc.md` 已定「公开可收录页归 consumer-next」，首页本来就在这条轨道上；A 会让仓库多一种渲染模式且坑要重踩。

## 四、实现要点

代码入口：`frontend/apps/consumer-next/app/[lang]/page.tsx`、`src/home/`、`frontend/packages/lantern/`。

| 项 | 做法 | 为什么 |
|---|---|---|
| 共享 | 灯市 token / 演示数据 / 墨线插画抽成 `@ecommerce/lantern`（无 MUI 依赖），SPA 与 Next 共用 | 两边各维护一份 AppBar/token 已经是漂移风险 |
| 渲染 | 整页静态：`generateStaticParams` 预渲染 `/zh`、`/en`；`next.config` `rewrites` 把 `/` 改写到 `/zh`（不是 redirect） | redirect 多一跳 RTT 直接吃 LCP |
| 客户端 JS | 三个岛：灯阵入视点亮（`LitGrid`）、顶栏搜索（RPC 客户端在首次提交时 `import()`）、登录态（`/auth/me`） | 首屏 JS 不带 connect-web / protobuf 运行时 |
| Providers | `TransportProvider` + `QueryClientProvider` 只包商品页，不进 layout | 放 layout 会把 react-query 塞进首页首屏 |
| 字体 | `scripts/subset-home-fonts.sh` 按 `scripts/home-font-text.ts` 列出的**真正以宋体渲染的槽位**生成 700 / 900 子集（合计 19 KB），经 `next/font/local` 自托管 + preload；缺字落系统宋体 | 首页文案是构建期常量，字形集合可枚举 |
| 路由 | helm 与裸 manifest 的 consumer-next HTTPRoute 加 `/` **Exact**；Gateway API 规定 Exact 优先于 frontend 的 PathPrefix `/` | 两份真相源受 `verify-deploy-parity.sh` 约束 |
| SPA 侧 | `src/lib/home.ts` 的 `goHome()`：生产 web 整页跳转，dev / Tauri 仍走 SPA 首页路由 | 客户端路由到 `/` 只会得到 SPA 自己那份旧首页 |
| SEO | canonical / hreflang 用 Metadata API 输出绝对 URL，域名取构建期 `NEXT_PUBLIC_SITE_URL`（Dockerfile ARG，默认线上域名） | 静态页无法在请求期读 Host；dev 的 canonical 指向线上是对的 |
| 智能体浏览 | `consumer/public/llms.txt`（H1 + 摘要 + 链接）；图标链接补 `aria-label` | `/llms.txt` 之前落到 Caddy 的 SPA 兜底返回 `index.html` |

## 五、踩过的坑

1. **workspace 包的 `node_modules` 要单独 COPY**：consumer-next Dockerfile 只拷了 `/workspace/node_modules` 与 `apps/consumer-next/node_modules`，`packages/lantern/node_modules`（react 符号链接）没带，CI 里 tsc 报 `Cannot find module 'react'`。本地能过是因为目录本来就在。
2. **静态页里的 `<link rel="preload">` 会被丢掉**：在服务端组件手写 `<link>`、以及在客户端组件里调 `ReactDOM.preload()`，最终 HTML 都没有；`next/font/local` 才会正确输出 preload 并生成 size-adjust 回退。
3. **字体子集不要按「文件里出现过的字符」采集**：第一版把两种语言全部文案塞进 700 字重，单个子集 65 KB，线上 LCP 3.5 s；按渲染槽位列出后 19 KB，LCP 1.4 s。
4. **首页不能设 `revalidate`**：线上 Pod 的 `.next/server/app` 只读，只有 `app/zh`、`app/en` 两个子目录挂了可写卷，首页产物 `app/zh.html` 不在其中。ListProduct 接通改 ISR 时要同时改卷挂载。
5. **调度死锁**：node3 带 `workload` 污点 + pod 反亲和 + 拓扑偏差 `maxSkew: 1` 叠加，consumer-next 新 Pod 无节点可去；靠删旧 Pod 让位，`/` 中断约 10 s。只要 node3 再被污点，consumer-next 就只能跑 1 副本。
6. **Lighthouse 本机测线上有抖动**：Chrome for Testing 偶发把观测首绘拖到 ~2.3 s（性能 91–94），真实 Chromium 五次 236–332 ms。判断站点是否退化以 Playwright 真实浏览器读 `performance` 条目为准，不以单次 Lighthouse 为准。
7. **发布 tag 不可移动**：三次 CI 红都不是代码（GitHub 下载 504、proxy.golang.org 流错误），处理方式是 `gh run rerun --failed`；只有 Dockerfile 那次才切新号。

## 六、验证

```bash
# 本机 Lighthouse（与 PageSpeed 同参数），Chrome 用 Playwright 缓存里的
CHROME_PATH="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
npx lighthouse https://shop.apikv.com/ --form-factor=mobile --screenEmulation.mobile \
  --output=json --output-path=/tmp/lh.json --chrome-flags="--headless=new"

# 本地构建后测（standalone 需手动补 static / public）
cd frontend/apps/consumer-next && pnpm build \
  && cp -r .next/static .next/standalone/apps/consumer-next/.next/ \
  && cp -r public .next/standalone/apps/consumer-next/ \
  && PORT=3004 node .next/standalone/apps/consumer-next/server.js

# 改文案 / 演示数据后重生成字体子集（依赖 uvx）
frontend/apps/consumer-next/scripts/subset-home-fonts.sh
```

线上验收：`curl -sI https://shop.apikv.com/` 有 `x-powered-by: Next.js` 与 `x-nextjs-prerender: 1`；`/cart` 仍返回 Caddy 的 `accept-ranges: bytes`；`/zh/product/*` SSR 不变。

## 七、未做（对 SPA 页仍有效）

首页迁走后，§二的四个问题对 `/cart`、`/checkout` 等 SPA 页仍然存在。按收益排序：

1. `@ecommerce/icons` 改具名 import + 静态映射表（省 ~110 KB gzip）。
2. `main.tsx` 的字体 import 移到首次 render 之后动态加载；`assetsInlineLimit` 排除字体。
3. `await import("./bootstrap")` 改为静态 import 链（`init.ts` 顶层 await 保证顺序），让 Vite 把第二波写进 modulepreload。
4. Caddyfile 给 `/assets/*` 加 `Cache-Control: public, max-age=31536000, immutable`，`encode zstd gzip`。
