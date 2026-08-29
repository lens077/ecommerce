# React Compiler 在 Consumer 的单应用试点报告

> 日期：2026-08-28  
> 代码基线：`0ce0b8948cda`，仅验证当前 `HEAD` 及 Zustand 实现  
> 试点范围：`frontend/apps/consumer`，不改业务代码，Compiler 默认关闭  
> 实测环境：Node.js `24.20.0`、pnpm `11.22.0`、Vite+ `0.2.9`、Vite `8.2.1`、Rolldown `1.2.3`、Oxlint `1.77.0`、React `19.2.8`

## 结论

**接入可行，但现在不值得全量默认启用。最终结论：建议搁置。**

本试点证明了原生 Oxc React Compiler 可以经标准 Vite 插件接入 Vite+，Compiler 开启后的构建、单元测试和未登录首页冒烟均通过。当前 Zustand 订阅组件没有出现 Compiler 诊断。

暂不全量启用的原因不是 Valtio。Valtio 已在 `cb2977d` 完成迁移，当前源码没有 `valtio`、`useSnapshot` 或 `proxy(`。主要卡点是：原生实现仍标记为实验性；生产构建有 2 个显式 bailout；静态诊断另有 3 项；全量 JS gzip 增加 `30.86 kB`，即 `7.97%`；本试点尚未证明运行时收益可以抵消体积增长；TanStack Router 与 Compiler 的插件顺序还造成路由文件诊断行号偏移。

Compiler 保持默认关闭。需要复评时，可用一个环境变量重新运行同一试点。

## Q1—Q8 决策表

| 问题 | 结论 | 关键证据 | 判定 |
|---|---|---|---|
| Q1：接入路径 | 采用 `@vitejs/plugin-react@6.1.0` + `oxc-transform-react@0.145.0` 的原生 Oxc 路径，通过 `react({ compiler: true })` 接入 | Vite+ 接受标准 Vite `plugins`；Vite+ 没有专用 React Compiler 开关；Babel 仍可作为备选，但 plugin-react 6.x 已移除 inline Babel 配置 | GO |
| Q2：Compiler 开启构建 | `REACT_COMPILER=1 pnpm exec vp run consumer#build` 通过 | 最终构建转换 `14,097` 个模块，Vite build 与 `tsc` 均通过；输出 2 个非致命 Compiler TODO/bailout | GO |
| Q3：编译、bailout、错误及状态库交互 | 生成 41 个 memo-cache 函数位点；2 个显式 bailout；0 个 fatal；Oxlint 另报 3 项 Compiler 诊断 | 直接扫描 40 个生产源码文件；`AppBar`、`NotificationsHost` 均生成 memo cache；Zustand store 文件没有 Compiler 诊断 | 有条件 GO |
| Q4：lint 策略 | 当前用 Oxlint 旧版 `react/react-compiler` 做一次性诊断，不加入默认门禁 | 45 个文件得到 3 项诊断；默认 `vp lint` 仍为 0 warning / 0 error；Oxlint `1.79.0` 才换成 22 条细分规则 | GO，但仅作 advisory |
| Q5：构建时间与 bundle | 构建时间差异落在噪声内；bundle 明显增大 | 端到端均值 `2.867s → 2.887s`，`+0.70%`；JS gzip `387.17 kB → 418.03 kB`，`+7.97%` | 价值判定 NO-GO |
| Q6：运行时冒烟 | Compiler 开启后的测试与未登录首页通过 | 3 个测试文件、8 个测试全部通过；Chromium 返回 HTTP 200、标题为 `Lantern Market`、0 个 page error；开启和关闭时均出现同一条 Cart RPC 控制台错误 | 有限 GO |
| Q7：默认关闭与单命令开关 | 仅 `REACT_COMPILER=1` 时注册 Compiler；named catalog 将 plugin-react `6.1.0` 隔离到 Consumer | Consumer 解析 `6.1.0`；Admin、Merchant 仍解析 `6.0.5`；Desktop 无此依赖；`pnpm install --frozen-lockfile` 通过 | GO |
| Q8：其他应用与默认门禁 | 默认路径不包含 Compiler，完整前端门禁通过 | 最终 `pnpm ready` 退出码为 0；`pnpm peers check` 无问题；默认 Consumer 产物没有 `compiler-runtime` chunk，JS 总量与改动前基线完全一致 | GO |

## Q1：接入路径

### 事实

React 官方给出的 Vite 路径分为两类：

1. Babel 路径：对 `@vitejs/plugin-react@6.0.0` 及以上，使用独立的 `@rolldown/plugin-babel` 与 `reactCompilerPreset()`。plugin-react 6.x 已移除 `react({ babel: ... })` 的 inline Babel 选项。来源：[React Compiler 安装指南](https://react.dev/learn/react-compiler/installation#vite)、[@vitejs/plugin-react changelog](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md#600-beta0-2026-03-03)。
2. 原生 Oxc 路径：从 `@vitejs/plugin-react@6.1.0` 起，安装可选包 `oxc-transform-react`，然后使用 `react({ compiler: true })`。该能力仍标记为实验性。来源：[Oxc React Compiler Support](https://oxc.rs/blog/2026-08-18-react-compiler-support#vite)、[@vitejs/plugin-react 6.1.0](https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react%406.1.0)。

Vite+ `0.2.9` 没有 React Compiler 专用开关，但其构建沿用标准 Vite 配置和插件模型。来源：[Vite+ Build](https://viteplus.dev/guide/build)、[Vite+ v0.2.9](https://github.com/voidzero-dev/vite-plus/releases/tag/v0.2.9)。

本试点选择原生 Oxc 路径，最终配置为：

```ts
const reactCompilerEnabled = process.env.REACT_COMPILER === "1";

plugins: [
  tanstackRouter({ /* ... */ }),
  ...(reactCompilerEnabled ? [react({ compiler: true })] : []),
];
```

TanStack Router 必须位于 JSX transform 插件之前。若将 `react()` 放在 `tanstackRouter()` 前面，构建会直接报 `Plugin order error`。调整顺序后，Compiler 开启构建通过。

原生入口还带来一个版本约束：`@vitejs/plugin-react@6.1.0` 的可选 peer 是 `oxc-transform-react@^0.145.0`。由于 `0.x` 的 caret 范围不会覆盖 `0.147.0`，试装 `0.147.0` 时 `pnpm peers check` 失败；固定为 `0.145.0` 后通过。

为避免把 Admin 和 Merchant 一并升级到 plugin-react `6.1.0`，试点使用 pnpm named catalog：

- 默认 catalog 保持 `@vitejs/plugin-react: ^6.0.5`。
- `catalogs.react-compiler-pilot` 精确固定 `6.1.0`。
- 仅 Consumer 引用 `catalog:react-compiler-pilot`。

Named catalog 正是 pnpm 为工作区分批迁移依赖版本提供的机制。来源：[pnpm Catalogs](https://pnpm.io/catalogs#named-catalogs)。

### 推断

- 「Vite+/Rolldown 已使用 Oxc」不等于「React Compiler 已自动启用」。当前可靠入口仍是框架插件显式注册。
- 原生路径的改动和构建开销较小，但版本耦合比 Babel 路径更紧。plugin-react `6.1.1` 已再次调整 diagnostics 行为，说明该接口仍在快速演进。来源：[@vitejs/plugin-react 6.1.1](https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react%406.1.1)。

## Q2、Q3：构建与诊断

### Compiler 开启构建

最终命令：

```bash
cd frontend
REACT_COMPILER=1 pnpm exec vp run consumer#build
```

结果：退出码为 0，Vite build 与 `tsc` 均通过。构建输出 2 个 Compiler TODO，并明确写出 `React Compiler skipped optimizing this component or hook`；没有 fatal，也没有中止构建。

| 当前源码位置 | 诊断 | 结果 |
|---|---|---|
| `apps/consumer/src/providers/AuthProvider.tsx:70` | `BuildHIR::lowerExpression` 尚不支持当前 `import()` 表达式 | `AuthProvider` 跳过优化 |
| `apps/consumer/src/routes/profile/addresses/index.tsx:144` | `BuildHIR::lowerStatement` 尚不支持带 `finally` 的 `try` | `RouteComponent` 跳过优化 |

构建日志对第二项显示的是转换后行号 `99`；对当前原始源码直接运行 Oxc `transformSync` 时，诊断位置是第 `144` 行。事实层面可以确认两者指向同一处 `finally`。推断上，这与 TanStack Router 必须先于 React 插件执行、路由代码先被改写有关。该行号偏移会降低构建诊断的可操作性。

### 编译计数方法

`oxc-transform-react` 的 JS `TransformResult` 提供 `fatal`、`code` 与 `errors`，不提供结构化的「成功编译组件」事件。因此本报告用以下可复现代理指标计数：

1. 扫描 Consumer 的 39 个非测试、非生成生产源码文件，并额外包含 `packages/utils/src/notifications.ts`，共 40 个文件。
2. 对每个文件调用 `transformSync`。
3. 统计生成代码中由 `react/compiler-runtime` 导入函数产生的 `_c(...)` memo-cache 初始化位点。
4. 单独记录 `errors` 和 `fatal`，不把「没有 memo-cache 输出」自动算作 bailout。

结果：

| 指标 | 数量 |
|---|---:|
| 扫描文件 | 40 |
| 生成 memo-cache 的文件 | 26 |
| memo-cache 函数位点 | 41 |
| 显式 Compiler diagnostics / bailout | 2 |
| fatal 文件 | 0 |
| 未生成 memo-cache 的文件 | 14 |

`41` 表示成功生成的 memo-cache 函数位点，不等同于「41 个唯一命名组件」。14 个未生成 memo-cache 的文件包含类型、store、路由入口等非组件模块；没有诊断时，本报告不把它们记为 bailout。

### Zustand 交互

当前代码使用 Zustand vanilla store 与 selector，不再使用 Valtio。直接 transform 结果如下：

| 文件 | 结果 | 诊断 |
|---|---|---|
| `apps/consumer/src/components/AppBar.tsx` | 1 个 memo-cache 位点 | 0 |
| `apps/consumer/src/components/NotificationsHost.tsx` | 1 个 memo-cache 位点 | 0 |
| `apps/consumer/src/store/users.ts` | 0 个 memo-cache 位点 | 0 |
| `packages/utils/src/notifications.ts` | 0 个 memo-cache 位点 | 0 |

`AppBar` 和 `NotificationsHost` 均通过 selector 订阅 Zustand store，并成功生成 Compiler 输出。两个 vanilla store 模块没有 memo-cache 输出，也没有 bailout。**当前证据没有显示 Zustand 造成 Compiler 摩擦。**

### 限制

- 当前 Oxlint `1.77.0` 的旧规则支持 `reportAllBailouts`，但 `vp lint` 不接受临时 `--config`，而把 cwd 切到工作区外又会被 Vite+ 拒绝。因此本次没有启用「报告所有静默 bailout」。
- 2 个 bailout 是构建与 Oxc `errors` 明确报告的数量，不宣称覆盖 Compiler 可能静默跳过的所有函数。
- 当前只测试 `HEAD`。已删除的 `Loading.tsx` 和迁移前 Valtio 文件不在统计范围内。

## Q4：lint 策略

当前 Vite+ 捆绑 Oxlint `1.77.0`。该版本仍有旧的单条实验规则 `react/react-compiler`；Oxlint `1.79.0` 才把它替换为 22 条 Compiler-powered 细分规则。来源：[Oxc React Compiler Support](https://oxc.rs/blog/2026-08-18-react-compiler-support#oxlint)、[Oxlint 1.79.0](https://github.com/oxc-project/oxc/releases/tag/oxlint_v1.79.0)。

一次性诊断命令：

```bash
cd frontend
pnpm exec vp lint apps/consumer/src packages/utils/src \
  --react-plugin -A all -D react/react-compiler -f json
```

结果：检查 45 个文件，退出码为 1，得到 3 项诊断。

| 位置 | 诊断 |
|---|---|
| `apps/consumer/src/components/PrivacyConsent.tsx:42` | `EffectSetState` |
| `apps/consumer/src/providers/AuthProvider.tsx:78` | `MemoDependencies`，缺少 `applyIdentity` |
| `apps/consumer/src/routes/checkout/index.tsx:89` | `EffectSetState` |

其中 `PrivacyConsent` 和 checkout 路由仍生成了 memo cache。这说明「lint 发现规则问题」与「原生 transform 发生 bailout」不是同一组指标，不能合并计数。

建议：

1. 当前只把上述命令用于升级前的一次性 advisory 诊断，不纳入默认 `pnpm ready`。
2. Vite+/Oxlint 升级到包含 `1.79.0` 或更高版本后，重新评估 22 条原生细分规则，再决定哪些进入门禁。
3. 若需要与 React 上游完全对齐，再使用 `eslint-plugin-react-hooks@latest` 的 `recommended-latest` 做一次对照；不要新装已被合并替代的 `eslint-plugin-react-compiler`。来源：[React Compiler 1.0 lint 迁移说明](https://react.dev/blog/2025/10/07/react-compiler-1#migrating-from-eslint-plugin-react-compiler-to-eslint-plugin-react-hooks)、[React Compiler 安装指南](https://react.dev/learn/react-compiler/installation#eslint-integration)。

默认 `vp lint` 不启用旧 Compiler 规则。最终 `pnpm ready` 的常规 lint 结果为 0 warning、0 error。

## Q5：构建时间与 bundle

### 测量方法

- Compiler 关闭与开启各连续运行 3 次 `pnpm exec vp run consumer#build`。
- `vp` 报告 cache disabled。
- 外层用 `/usr/bin/time -p` 记录完整任务墙钟时间；内层用 Vite 的 `built in` 记录 bundler 阶段。
- 每次读取构建日志中的所有 JS chunk，累计 raw 与 gzip 大小。
- 未清理操作系统文件缓存，因此 3 次样本只能判断量级，不能作为稳定 benchmark。

### 结果

| 指标 | Compiler 关闭 | Compiler 开启 | 变化 |
|---|---:|---:|---:|
| 完整任务 3 次墙钟 | `3.29s / 2.74s / 2.57s` | `3.22s / 2.75s / 2.69s` | — |
| 完整任务均值 | `2.867s` | `2.887s` | `+0.020s / +0.70%` |
| 完整任务中位数 | `2.74s` | `2.75s` | `+0.01s / +0.36%` |
| Vite build 3 次 | `1.60s / 1.20s / 1.08s` | `1.49s / 1.18s / 1.14s` | — |
| Vite build 均值 | `1.293s` | `1.270s` | `-0.023s / -1.80%` |
| JS chunk 数 | `73` | `73` | `0` |
| JS raw 总量 | `1,176.94 kB` | `1,248.86 kB` | `+71.92 kB / +6.11%` |
| JS gzip 总量 | `387.17 kB` | `418.03 kB` | `+30.86 kB / +7.97%` |
| 最大 bootstrap raw | `358.57 kB` | `375.05 kB` | `+16.48 kB / +4.60%` |
| 最大 bootstrap gzip | `116.16 kB` | `122.90 kB` | `+6.74 kB / +5.80%` |
| `compiler-runtime` chunk | 无 | `8.61 / 3.32 kB` raw/gzip | 新增 |

构建时间没有可判定回退：外层轻微变慢、Vite 阶段轻微变快，幅度均小于首轮与后续轮次的波动。Bundle 变化则稳定且明显：gzip 增加约 `8%`。增加部分不只来自 runtime chunk，也来自各组件生成的 memo-cache 代码。

在配置改动完成后重新运行默认关闭构建，仍得到 73 个 JS chunk、`1,176.94 kB` raw、`387.17 kB` gzip；主要 chunk hash 与试点前基线相同，且没有 `compiler-runtime` chunk。这验证了默认开关没有改变现有产物。

## Q6：测试与运行时冒烟

### 单元测试

```bash
env -u REACT_COMPILER pnpm exec vp run consumer#test
REACT_COMPILER=1 pnpm exec vp run consumer#test
```

两种模式结果相同：3 个测试文件通过，8 个测试通过。覆盖现有 `users` store、`useCart` 和 `NotificationsHost` 测试。

### Chromium 冒烟

在 `REACT_COMPILER=1 pnpm exec vp run consumer#dev` 下，用本机 Playwright Chromium 访问 `http://localhost:3000/`：

- HTTP 200。
- 页面标题为 `Lantern Market`。
- 首页、商品卡片与隐私对话框均完成渲染。
- 0 个 `pageerror`。
- Dev 模式下获取的 `AppBar.tsx` 转换结果包含 `react_compiler-runtime` 与 `react.memo_cache_sentinel`，确认不是只启动了未编译页面。

浏览器控制台有 1 条 `CartService/GetCart` 的 RPC abort 错误。以 Compiler 默认关闭启动同一页面时，也得到同类错误；两种模式均正常渲染。因此该错误不是本试点引入的 Compiler 差异。

### 待验证

- 登录、退出与 Tauri 桌面登录路径。
- checkout、地址管理及两个 bailout 所在组件的交互回归。
- React Profiler 的 commit 数、CPU 时间，以及真实设备上的 INP/LCP。当前冒烟只能证明页面可运行，不能证明 Compiler 带来性能收益。

## Q7：默认关闭、单命令开关与回退

Compiler 默认关闭。试点命令如下：

```bash
cd frontend
REACT_COMPILER=1 pnpm exec vp run consumer#build
REACT_COMPILER=1 pnpm exec vp run consumer#test
REACT_COMPILER=1 pnpm exec vp run consumer#dev
```

未设置 `REACT_COMPILER=1` 时，配置不会注册 `react({ compiler: true })`。没有模糊的 truthy 判断；`REACT_COMPILER=true` 也不会误开。

依赖隔离实测：

| 工作区 | `@vitejs/plugin-react` |
|---|---:|
| `@ecommerce/consumer` | `6.1.0` |
| `@ecommerce/admin` | `6.0.5` |
| `@ecommerce/merchant` | `6.0.5` |
| `@ecommerce/desktop` | 无此依赖 |

`pnpm install --frozen-lockfile` 与 `pnpm peers check` 均通过，证明上述隔离可由锁文件重建，不依赖本机残留的 `node_modules`。

若只回退依赖隔离，执行以下步骤：

1. 删除 `pnpm-workspace.yaml` 中的 `catalogs.react-compiler-pilot`。
2. 把 Consumer 的 `@vitejs/plugin-react` 声明改回 `catalog:`。
3. 运行 `pnpm install`。

若完整撤销试点，再同时删除 `oxc-transform-react` 的 catalog/Consumer 声明，以及 `vite.config.ts` 中的 import、环境变量判断和条件插件。

## Q8：默认门禁与其他应用

在 named catalog 和最终锁文件落定后运行：

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm peers check
env -u REACT_COMPILER pnpm ready
```

结果全部通过：

- frozen install：无锁文件漂移。
- peer check：`No peer dependency issues found`。
- `vp fmt`、默认 `vp lint`：通过，lint 为 0 warning、0 error。
- recursive tests：通过；其中 Merchant 为 12 个测试，Consumer 为 8 个测试。
- recursive builds：6 个任务全部通过，包含 Admin、Merchant、Consumer 与 Consumer Next.js POC。
- 默认 Consumer 产物不包含 Compiler runtime，大小与试点前基线一致。

因此，试点配置在默认关闭时没有破坏其他应用或现有 `pnpm ready`。

## 总判断与复评条件

本报告选择「建议搁置」。这里的「搁置」指不把 Compiler 改为默认开启；保留默认关闭的 POC 开关，供后续复测。

满足以下条件后再讨论全量启用：

1. 原生 Oxc React Compiler 与 plugin-react 的接口进入稳定状态，或项目接受当前实验性 API 与精确版本耦合。
2. 修复或明确接受 2 个构建 bailout，并确认 TanStack Router 链上的原始 source map/诊断行号问题。
3. 升级到包含 Oxlint 细分 Compiler 规则的 Vite+/Oxlint 版本，重新清点当前 3 项 lint 诊断及全部 bailout。
4. 补齐登录、checkout、地址管理和 Tauri 路径的回归测试。
5. 在目标设备上证明 commit 次数、CPU 或 INP 有可重复的改善，且收益足以接受当前 `+30.86 kB / +7.97%` 的 JS gzip 增量。

Valtio→Zustand 迁移已经完成，不再是复评前置条件。当前证据只支持「可以接入」，不支持「现在全量启用值得」。

## 主要官方来源

- [React Compiler 安装指南](https://react.dev/learn/react-compiler/installation)
- [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1)
- [@vitejs/plugin-react 6.1.0](https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react%406.1.0)
- [@vitejs/plugin-react 6.1.1](https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react%406.1.1)
- [@vitejs/plugin-react README / changelog](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react)
- [Oxc React Compiler 文档](https://oxc.rs/docs/guide/usage/transformer/react-compiler.html)
- [Oxc React Compiler Support](https://oxc.rs/blog/2026-08-18-react-compiler-support)
- [Oxlint 1.79.0](https://github.com/oxc-project/oxc/releases/tag/oxlint_v1.79.0)
- [Vite+ v0.2.9](https://github.com/voidzero-dev/vite-plus/releases/tag/v0.2.9)
- [pnpm Named Catalogs](https://pnpm.io/catalogs#named-catalogs)
