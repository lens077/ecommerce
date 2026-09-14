---
name: mobile-pagespeed-gap-is-bytes-not-js
module: consumer
description: PageSpeed 移动端比桌面低 20 分而 TBT/CLS 满分——丢分在首屏字节量，罪魁是 @fontsource 的 303 条 @font-face 进了阻塞 CSS，不是 JS 执行
---

# PageSpeed 移动端比桌面低 20 分，TBT 和 CLS 却是满分

**症状**

同一份代码，PageSpeed 桌面 88、移动端 61。移动端五项里 TBT 0.95、CLS 1.00，
FCP 4.9 s / LCP 6.7 s / Speed Index 7.5 s 三项几乎零分。首页 HTML 只有 4 KB、TTFB 174 ms。

**根因**

移动端模拟 1.6 Mbps / 150 ms RTT，把「首屏前必须下载多少字节、分几波」暴露出来；桌面 10 Mbps 把它掩盖了。
实测首屏前约 650 KB、三波串行，其中最大一块是**渲染阻塞的 CSS 162 KB（gzip）**——解压 363 KB，
全部是 `@font-face`：`main.tsx` 里三行 `import "@fontsource/noto-serif-sc/{400,700,900}.css"`
带来 3 字重 × 101 个 unicode-range 切片 = 303 条声明，每条 woff2 + woff 两个 URL；
小于 4 KB 的切片还被 Vite `assetsInlineLimit` 内联成 base64（63 KB）。
应用自身样式走 emotion 在 JS 里，这份 CSS 对首屏零贡献却挡在渲染前。

第二块是 `await import("./bootstrap")`：动态 import 让 Vite 无法把第二波 45 个 chunk 写进 HTML 的 modulepreload，
多一整个 RTT 波；其中 114 KB gzip 是整套 lucide（`import * as icons` 让 tree-shaking 失效）。

**修复**

首页整页迁到 consumer-next 静态渲染，字体按真正以宋体渲染的槽位生成子集（19 KB）经 `next/font/local` 自托管。
移动端 61 → 100。完整方案与 SPA 页仍待做的四项见 [`docs/frontend/web-performance.md`](../../../../../docs/frontend/web-performance.md)。

**关键陷阱：不要从 JS 执行层面找**

TBT 满分说明主线程没问题，memo / 虚拟列表 / 减少 re-render 对这个分数**一分不加**。
看到「TBT、CLS 满分，FCP/LCP/SI 低」的组合，直接量三样：阻塞 CSS 的解压体积、HTML 里 modulepreload 之外还有几波请求、字体总字节。
`@fontsource` 的按切片 CSS 适合 `<link>` 异步加载，**不适合 import 进入口**——入口里的 CSS 一定是阻塞的。
