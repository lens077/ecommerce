# 前端预发布依赖收益评估

核查日期：2026-09-05。范围：React / React DOM、Next.js、TypeScript、Playwright、vitest-axe。先核对官方源码、Release 与 PR，再对有明确适用路径的 Next.js 和 TypeScript 候选运行本项目 A/B。

## 结论

**采用精确锁定的 Next.js canary 和 TypeScript nightly。** 两者在本项目 A/B 中分别得到可重复的构建与内存收益，功能验证通过。React canary 的界面能力目前没有调用点，React experimental 没有已确认的项目需求；Playwright 指定 alpha 只有开发版本号切换；vitest-axe pre 的改动不能消除本仓现有类型补丁，后三组维持稳定版。

| 包                    | 稳定版基线 | 核查的预发布版本                       | 官方可核实的收益                                                                                  | 本项目判断                                                                                        |
| --------------------- | ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `next`                | `16.3.4`   | `16.4.0-canary.18`                     | Turbopack 缓存更小、生产导出名压缩、减少 server tracing 工作；内置新 React RSC 去重和生命周期清理 | 6 轮 A/B 有构建与缓存收益，SSR、JSON-LD、hydration 与请求边界验证通过；采用精确版本               |
| `typescript`          | `7.0.2`    | `7.1.0-dev.20260904.1`                 | checker 按 import 关联度分配，官方其他项目约快 10%、内存少 10%；大量 paths 的缓存优化             | 6 轮 A/B 的峰值 RSS 降低 17%～20%，诊断一致；采用精确版本                                         |
| `react` / `react-dom` | `19.2.8`   | `19.3.0-canary-8425b691-20260904`      | `ViewTransition`、Fragment refs；服务端 Flight 优化                                               | SPA 没有调用新 API；RSC 收益应通过 Next 内置 runtime 评估，不能靠升级 SPA 的 React 获得           |
| `react` / `react-dom` | `19.2.8`   | `0.0.0-experimental-8425b691-20260904` | Gesture Transition、taint、其他仍受实验标志保护的 API                                             | 没有明确功能需求或本仓性能证据，保持稳定版                                                        |
| `playwright`          | `1.63.0`   | `1.64.0-alpha-2026-09-04`              | 该构建的唯一分支新增提交是版本号切换                                                              | 不升级；已有有用功能在 `1.63.0` 稳定版中                                                          |
| `vitest-axe`          | `0.1.0`    | `1.0.0-pre.5`                          | `extend-expect` 同时扩展运行时与类型，修复 color contrast 相关检查，更新依赖                      | 本仓用 jsdom 并关闭 color contrast；pre 仍增强旧接口，不解决 Vitest 4 `Matchers` 类型差异，不升级 |

「官方其他项目更快」与「本项目实测更快」是不同证据。后文明确区分官方 PR 数据与本项目 A/B；采纳只依据本项目结果。

## 本项目 A/B 与采纳结果

### Next.js

在两个仓外隔离副本中使用同一份 `consumer-next` 源码、Node `24.20.0`、pnpm `12.3.4`、TypeScript `7.1.0-dev.20260904.1`，仅切换 Next.js 版本。每轮先删除 `.next` 做 cold build，再复用缓存做 warm build；稳定版与 canary 交替先后顺序，共 6 轮。

| 指标              |     `16.3.4` | `16.4.0-canary.18` |   变化 |
| ----------------- | -----------: | -----------------: | -----: |
| cold build 中位数 |      3.024 s |            2.447 s | -19.1% |
| warm build 中位数 |      1.328 s |            1.225 s |  -7.8% |
| `.next/cache`     | 48,962,370 B |       32,005,783 B | -34.6% |
| 客户端 JS raw     |    806,943 B |          799,995 B | -0.86% |
| 客户端 JS gzip    |    235,632 B |          234,558 B | -0.46% |
| standalone 产物   | 36,428,835 B |       36,291,791 B | -0.38% |

两个版本都通过现有 `verify-runtime.mjs` 的 SSR、i18n 与 JSON-LD 断言；使用本机 Microsoft Edge 的 `verify-browser.mjs` 也都通过 hydration、零 page error、公开 SSR 不携带个性化 Cookie、客户端个性化请求携带 Cookie 的断言。原始结果和测量脚本见 `frontend/.scratch/next-bench/`。因此采用 `16.4.0-canary.18`，并精确锁定版本。

该 canary 的 `next dev` 还会自动生成 app 级 `AGENTS.md` 与引用它的 `CLAUDE.md`；删除后下次启动会重新创建。两份文件只把 Next.js 任务指向安装包内的同版本文档，不复制项目规范，因此保留为 branch-specific context pointer。

### TypeScript

稳定版与 nightly 对同一份 consumer、merchant 源码和同一组 `tsconfig.json` 运行 `--noEmit --incremental false`。先预热，再交替顺序运行 6 轮；两版均用故意错误参数验证命令能红，所有正式运行 `rc=0`、无诊断，非内置输入文件集合一致，源码与 lockfile 快照未变化。峰值 RSS 取 macOS `/usr/bin/time -l` 的 `maximum resident set size`。

| 应用     | 指标             |   `7.0.2` | `7.1.0-dev.20260904.1` |   变化 |
| -------- | ---------------- | --------: | ---------------------: | -----: |
| consumer | wall time 中位数 |   0.580 s |                0.576 s |  -0.8% |
| consumer | 峰值 RSS 中位数  | 555.3 MiB |              442.4 MiB | -20.3% |
| merchant | wall time 中位数 |   0.401 s |                0.408 s |  +1.6% |
| merchant | 峰值 RSS 中位数  | 397.7 MiB |              328.0 MiB | -17.5% |

wall time 没有整体提速证据；内存结果在两组应用的每一轮都低于稳定版，区间不重叠。原始结果和基准脚本见 `frontend/.scratch/ts-bench/measurement/results.json` 与 `frontend/.scratch/ts-bench/benchmark.py`。因此采纳 nightly 的理由仅是可重复的内存下降，并精确锁定该构建。

## Vite+ 与稳定依赖升级结果

项目固定到 pnpm `12.3.4`。Vite+ 从 `0.2.9` 升到 `0.3.0`，并按其实际 toolchain 对齐 `@voidzero-dev/vite-plus-core@0.3.0`、Vitest 与 `@vitest/browser-playwright@4.1.11`。`vp toolchain` 实测还包含 Vite `8.2.2`、Rolldown `1.2.5`、Oxlint `1.79.0`、Oxfmt `0.64.0`、Oxc `0.146.0` 与 tsdown `0.22.14`。最终 `pnpm ready` 覆盖格式化、lint、5 个 workspace test task、4 个 Web app 构建及 consumer/merchant TypeScript 检查，全部通过。

其余直接依赖升级到 npm registry 的最新稳定版后，`pnpm outdated --recursive --include-workspace-root` 只剩三项：Vitest `5.0.0`、`@vitest/browser-playwright@5.0.0` 和 `oxc-transform-react@0.148.0`。前两项不能越过 Vite+ `0.3.0` 内置的 Vitest `4.1.11`；后者超出 `@vitejs/plugin-react@6.1.1` 的 peer 范围 `^0.145.0`，因此继续精确使用 `0.145.0`。这三项均不是漏升。

Vite+ 0.3 的新 Oxlint 规则发现 3 处同步 effect state 更新，已改为渲染期派生值并清零 lint。仓库级 lint 棘轮也已兼容 Vite+ 0.3 的单行诊断格式，并用故意加入的 `debugger` 证明会返回 rc=1。依赖清理同时消除了 3 条 Casdoor SDK knip 债务，基线由 38 条收紧到 35 条。

可选的 `REACT_COMPILER=1` production build 已通过；同模式下的 jsdom a11y 测试仍会在结算页 mock 数据上触发 BigInt 类型混用，`oxc-transform-react@0.145.0` 与 `0.148.0` 都能复现，因此不是本次版本升级造成的回归。默认关闭该试点，正式的 `pnpm ready` 路径全绿。

## Next.js：两个直接优化方向与一个 RSC 优化方向

### Turbopack 生产构建

1. **导出名压缩。** [PR #97676](https://github.com/vercel/next.js/pull/97676) 在 canary 的 production build 默认启用 export mangling，开发模式默认关闭。作者的小应用 A/B：总 emitted JS 从 `966,519 B` 降至 `959,174 B`，gzip 从 `294,963 B` 降至 `293,407 B`，分别约少 0.76% 和 0.53%。这属于产物体积收益，不能据此断言页面加载快了相同比例。PR 明确说明扩大 canary 覆盖是为了继续发现兼容性问题。
2. **server tracing 跳过忽略文件。** [PR #97475](https://github.com/vercel/next.js/pull/97475) 在 trace 前剔除本来最终就会拒绝的文件，避免无效分析。作者对 Hello World 应用报告 compile time 快 `28.0% ± 1.7%`，full clean build 快 `15.9% ± 1.2%`；收益主要是构建时固定开销。`consumer-next` 的 standalone 产物需要 server tracing，因此有实际适用路径；本项目结果见前文 A/B。

已核对精确 tag 的配置：[16.3.4 config-shared.ts](https://github.com/vercel/next.js/blob/v16.3.4/packages/next/src/server/config-shared.ts) 没有 `turbopackMangleExportNames`；[16.4.0-canary.18 config-shared.ts](https://github.com/vercel/next.js/blob/v16.4.0-canary.18/packages/next/src/server/config-shared.ts) 中它为 `isStableBuild() ? false : undefined`，生产模式默认值由 Turbopack 补齐。两版均默认启用 build filesystem cache。

### 持久缓存压缩

[PR #97714](https://github.com/vercel/next.js/pull/97714) 将大头 `TaskData` 从 LZ4 改为 zstd level 3，其他 family 继续 LZ4。最终方案的三个小应用 fixture，缓存目录大小合计中位数从 `96.79 MiB` 降至 `78.00 MiB`，约少 **19.41%**。作者把 cold/write `+0.23%`、warm/read `-1.19%` 当作噪声，不能宣传为可靠提速。

PR 还有早期 Vercel Site「约少 25%」的结果，但那是移除 LZ4 HC4 之前的实现；不应拿它当最终实现的保证。早期实现还出现写入 CPU 和部分耗时上升，最终保留的是以小幅压缩成本换磁盘空间的方案。

已核对 [16.3.4 key_value_database.rs](https://github.com/vercel/next.js/blob/v16.3.4/turbopack/crates/turbo-tasks-backend/src/database/key_value_database.rs) 与 [16.4.0-canary.18 同文件](https://github.com/vercel/next.js/blob/v16.4.0-canary.18/turbopack/crates/turbo-tasks-backend/src/database/key_value_database.rs)：后者明确为 `TaskData` 配置 `Compression::Zstd3`。

### 内置 React RSC

Next App Router 使用 Next 自带的 React runtime，不完全由 workspace 顶层 `react` 版本决定。[Turbopack import map](https://github.com/vercel/next.js/blob/v16.3.4/crates/next-core/src/next_import_map.rs) 与 [编译 alias](https://github.com/vercel/next.js/blob/v16.3.4/packages/next/src/build/create-compiler-aliases.ts) 将 App Router 的 React、React DOM、RSC 导向 `next/dist/compiled` / `vendored`。

精确源码中，稳定 [Next 16.3.4 内置 React](https://github.com/vercel/next.js/blob/v16.3.4/packages/next/src/compiled/react/cjs/react.production.js) 的 `exports.version` 是 `19.3.0-canary-cbb046ab-20260731`；[Next 16.4.0-canary.18 内置 React](https://github.com/vercel/next.js/blob/v16.4.0-canary.18/packages/next/src/compiled/react/cjs/react.production.js) 则为 `19.3.0-canary-f4e439e1-20260902`。保持 Next 稳定版与「它内部从未采用 React canary」不是同一个概念。

这次 Next canary 包含两个可核实的新变化：

- [React PR #37147](https://github.com/react/react/pull/37147)：Flight import metadata 的重复 chunk URL 字符串去重。官方示例 dashboard 的 Flight 原始体积少 48.4%、gzip document 少 7.8%、serial req/s 多 16.9%；另两个页面收益较小。不重复的字符串需要额外 map/引用处理，作者也展示了没有去重机会时可能有轻微开销。`consumer-next` 有 RSC + Client Components，但目前主要是商品页 POC，不能套用大型 dashboard 的数字。
- [React PR #37315](https://github.com/react/react/pull/37315)：渲染结束时移除外部 AbortSignal 上的 listener，避免 caller signal 持有整个已完成 render。它改善特定 signal 生命周期下的内存保留，不等于当前项目已经出现这个泄漏。

已直接对比 Next 的 compiled production RSC 文件：[稳定版](https://github.com/vercel/next.js/blob/v16.3.4/packages/next/src/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-server.node.production.js) 不含 `writtenImportStrings` / `attachAbortSignal`；[canary](https://github.com/vercel/next.js/blob/v16.4.0-canary.18/packages/next/src/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-server.node.production.js) 包含这两条实现。因此上述差异确实进入候选包，而非只存在于上游未发布分支。

本仓 `apps/consumer-next/next.config.ts` 只有 standalone output 和 dev origins，没有开启 Cache Components、React Compiler 或其他 experiment。因此本报告不把各种 `use cache` / Partial Prefetching 新能力算成「升包即得」的收益。

## TypeScript：确有编译器优化，不是浏览器性能升级

通过 `npm view typescript@7.1.0-dev.20260904.1 gitHead repository --json` 核实，候选构建对应官方 `microsoft/TypeScript` 的 commit [`e73c923cb58e9ea8cd75ba41c51b8d8886af3076`](https://github.com/microsoft/TypeScript/commit/e73c923cb58e9ea8cd75ba41c51b8d8886af3076)。官方 [7.0.2 Release](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2) 已是原生 TypeScript 7 系列；不能把 TypeScript 7 相对旧 JavaScript 编译器的整体收益再次算作 7.1 的增量。

### 通用 checker 分配优化

[PR microsoft/typescript-go#4313](https://github.com/microsoft/typescript-go/pull/4313) 把 source file 与 checker 的 round-robin 分配改为基于 import 关联度的加权图分配。相互依赖的文件更可能共享 checker 的类型、符号和实例缓存，同时控制并行负载倾斜。作者报告 Notion、Slack 等项目约快 **10%**、内存约少 **10%**，并对 VS Code、MUI docs、XState 等工作负载验证过。

这项优化已核对到精确版本：[7.0.2 checkerpool.go](https://github.com/microsoft/TypeScript/blob/v7.0.2/tsc/internal/compiler/checkerpool.go) 仍执行 `p.checkers[i%checkerCount]`；[nightly checkerpool.go](https://github.com/microsoft/TypeScript/blob/e73c923cb58e9ea8cd75ba41c51b8d8886af3076/tsc/internal/compiler/checkerpool.go) 包含 weighted FENNEL 分配。稳定版默认多 checker，因此本仓类型检查有可测试的适用路径。

本项目按同一源码、Node、CPU 并发条件和缓存状态比较了类型检查时间与峰值内存，并确认诊断结果不变。该优化不会使已输出的浏览器 JavaScript 自动更快。

### 大型 paths / project references 场景

[PR #63998](https://github.com/microsoft/TypeScript/pull/63998) 复用解析后的 paths pattern，减少跨 project-reference redirect 时重复分配。作者的 Kibana「Find All References」示例从 `2.518777125 s` 降至 `1.461889542 s`；[原 issue #63997](https://github.com/microsoft/TypeScript/issues/63997) 明确针对大量 paths 与 references。精确 [7.0.2 cache.go](https://github.com/microsoft/TypeScript/blob/v7.0.2/tsc/internal/module/cache.go) 与 [nightly cache.go](https://github.com/microsoft/TypeScript/blob/e73c923cb58e9ea8cd75ba41c51b8d8886af3076/tsc/internal/module/cache.go) 存在该差异。

本仓 `tsconfig.json` / 各 workspace `tsconfig.json` 是少量路径别名，没有声明 project `references`；不应因「也是 monorepo」就套用 Kibana 的约 42% 延迟降幅。其他新增 Compiler API、语言服务修复也不能直接折算成当前构建速度。

## React：新界面能力存在，当前没有采用需求

候选 canary / experimental 的共同源码 commit 为 [`8425b691`](https://github.com/react/react/commit/8425b6915e8ebe2b12bf4bd42975bfccfa62fc5c)。官方 [feature flags](https://github.com/react/react/blob/8425b6915e8ebe2b12bf4bd42975bfccfa62fc5c/packages/shared/ReactFeatureFlags.js) 区分所有预发布可用能力与 `__EXPERIMENTAL__` 能力。

- **`ViewTransition`**：官方 [API 文档源码](https://github.com/reactjs/react.dev/blob/main/src/content/reference/react/ViewTransition.md) 标注仅 Canary / Experimental，支持与 Transitions、Suspense 协作的组件树过渡动画。需要组件接入和交互验收；只升版本不会为现有界面自动设计动画。
- **Fragment refs**：官方 [Fragment 文档源码](https://github.com/reactjs/react.dev/blob/main/src/content/reference/react/Fragment.md) 描述无需额外 wrapper DOM 即可绑定事件、管理 focus、接 observer 或查询几何信息。这是 API 能力，当前没有要求本项目为它重写 DOM 结构。
- **Experimental 能力**：feature flags 中包括 Gesture Transition、taint、async iterable children 等。本仓未发现相关调用点，也没有手势导航或其他必须采用它们的已知需求。

已在 `apps/consumer/src` 与 `apps/consumer-next/src` 搜索新 API，未命中现有调用。React 19.2 已包含 `Activity`、`useEffectEvent` 与 React Performance Tracks，见官方 [React 19.2 发布文档](https://github.com/reactjs/react.dev/blob/main/src/content/blog/2025/10/01/react-19-2.md)；[React 19.2.8 Release](https://github.com/react/react/releases/tag/v19.2.8) 又已包含 RSC decoding 性能改进。这些不能列作本次升级 canary 才获得的能力。

自动 memoization 属于 React Compiler，官方 [Compiler 1.0 文档](https://github.com/reactjs/react.dev/blob/main/src/content/blog/2025/10/07/react-compiler-1.md) 已说明它是独立构建期工具并支持 React 17+。本仓 consumer 由 `REACT_COMPILER=1` 显式开启 Oxc Compiler 试点，默认关闭。升级 React runtime canary 不会自动打开它，也不能把 Rust/Oxc Compiler 的编译速度变化算作 React runtime 的收益。

## Playwright：指定 alpha 没有新增功能收益

通过 `npm view playwright@1.64.0-alpha-2026-09-04 gitHead repository --json` 核实，该 alpha 对应 [`d1dcd6bc0a138ec0fd943df19e07458dc426ee22`](https://github.com/microsoft/playwright/commit/d1dcd6bc0a138ec0fd943df19e07458dc426ee22)。[相对稳定版 1.63.0 的 GitHub compare](https://github.com/microsoft/playwright/compare/v1.63.0...d1dcd6bc0a138ec0fd943df19e07458dc426ee22) 返回 `ahead_by: 1`、`behind_by: 4`，新增提交仅是 `chore: mark v1.64.0-next`，修改 package 版本号。

因此不能把该 alpha 名字中的 `1.64` 当作功能领先的证据，更不能把之后 main 分支的 Chromium/WebKit roll 算入这个精确构建。

[Playwright 1.63.0 Release](https://github.com/microsoft/playwright/releases/tag/v1.63.0) 已包含 named test locks、跨 frame locator、visible-only locator、ARIA/screen trace snapshots、Perfetto reporter 等。这些稳定能力足够作为本次升级方向。本仓 consumer 使用的是 Vite+ 的 Playwright browser provider，锁调度等 `@playwright/test` 特性也不会仅凭升 `playwright` 自动进入 Vitest 测试。

## vitest-axe：pre 不能解决现有类型补丁

预发布对应 [2025-01-22 的 `v1.0.0-pre.5` commit](https://github.com/chaance/vitest-axe/commit/60124b45b266f6caaa283c643984952454fe665e)。官方 [CHANGELOG](https://github.com/chaance/vitest-axe/blob/60124b45b266f6caaa283c643984952454fe665e/CHANGELOG.md) 的主要变化是 peer 放宽到 Vitest `>=1`、`extend-expect` 同时增强类型与运行时、修复 color contrast 相关检查。

但精确版本的 [extend-expect.ts](https://github.com/chaance/vitest-axe/blob/60124b45b266f6caaa283c643984952454fe665e/src/extend-expect.ts) 仍只增强 `Assertion` 与 `AsymmetricMatchersContaining`；它没有本仓 Vitest 4 需要的 `Matchers` 增强。因此不能宣传为「升 pre 就能删掉本地 matcher 类型补丁」。[package.json](https://github.com/chaance/vitest-axe/blob/60124b45b266f6caaa283c643984952454fe665e/package.json) 的开发验证版本也是 Vitest 3.0.3，peer `>=1` 不等于已验证 Vitest 4 / 5。

本仓 `apps/consumer/src/a11y/pages.a11y.test.tsx` 显式关闭 jsdom 无法可靠测量的 `color-contrast`，已有 `expect.extend(matchers)` 和已知违规样本 canary。没有性能测量或实际缺口支持为这个长期预发布切换版本。

## 验证与版本纪律

1. pnpm 12、Vite+ 及稳定依赖升级后的 `pnpm ready`、peer 检查和 frozen-lockfile 安装均通过。
2. Next.js 与 TypeScript 的 A/B 分开执行，避免把编译器变化错误归因给框架。两项只锁定本报告验证过的精确构建，不跟随可变的 `canary` / `next` 标签。
3. React canary / experimental、Playwright alpha、vitest-axe pre 不安装。需要 ViewTransition / Fragment refs 或出现特定已修复问题时，再以具体用例重新评估。
4. Vite+ `0.3.0` 内置 Vitest `4.1.11`，因此项目继续使用 Vitest 与 browser provider `4.1.11`；等 Vite+ 升级内置 runner 后再评估 Vitest 5。

核查使用 `agent-reach` 的 GitHub / `gh` 路由读取官方 Release、PR 和精确 tag 源码；npm CLI 只读查询用于确认发布包的 `gitHead`。`agent-reach check-update` 本次返回 `v1.5.0` 已是最新版本。
