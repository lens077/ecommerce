# 前端 monorepo

pnpm workspace + [vite-plus](https://viteplus.dev)（`vp`）。2026-03-18 从单体前端迁过来，
迁移提交是 `75f57beb`。

## 结构

```
frontend/
├── vite.config.ts        # workspace 根配置：staged / fmt / lint（只认这一份）
├── pnpm-workspace.yaml   # catalog 统一版本
├── .vite-hooks/          # git 钩子（vp config 装的，见下）
├── apps/
└── packages/
```

### apps

| app        | 端口 | 说明                                                  | 启动                |
| ---------- | ---- | ----------------------------------------------------- | ------------------- |
| `consumer` | 3000 | 消费者端：商品、购物车、下单、地址、订单              | `pnpm dev`          |
| `merchant` | 3002 | 商家端：店铺、商品、订单、报表                        | `pnpm dev:merchant` |
| `admin`    | 3003 | 管理端：用户、商家、品类、报表                        | `vp run admin#dev`  |
| `desktop`  | —    | Tauri 壳，按配置文件套在 consumer / merchant 之一外面 | `pnpm desktop`      |

`desktop` 不是第五个前端，它只是 Rust 侧的窗口 + 系统能力，页面仍然来自
`consumer` / `merchant` 的 dev server（config app 已随配置中心迁出）。所以这两个 app 的
`server.strictPort` 必须是 `true`：端口被占时要报错，不能静默换号，否则壳会连到一个空窗口。

### packages

| package     | 职责                                                                |
| ----------- | ------------------------------------------------------------------- |
| `api`       | Connect 传输层：transport、拦截器（认证/日志）、错误归一化          |
| `configs`   | 跨端共享的静态配置（Casdoor 等）                                    |
| `constants` | 跨端共享的枚举与常量（订单状态、搜索字段）                          |
| `i18n`      | i18next 实例、语言探测、格式化、共享 locales                        |
| `perf`      | Web Vitals / 长任务 / 接口耗时采集，经网关 `telemetry.v1` 上报      |
| `tauri`     | 桌面端专属胶水：环境探测、Rust 侧 fetch、本地设置、OAuth 子窗口桥接 |
| `tracker`   | 浏览行为埋点，上报给 behavior 服务喂给 gorse                        |
| `ui`        | 与业务无关的展示组件与 hook（错误边界、懒加载图、虚拟列表、防抖）   |
| `utils`     | 纯函数：JWT 解析、Casdoor 跳转拼装、通知                            |

分包原则：**被两个以上 app 用到，且不含业务语义**才进 `packages/`。
只有一个 app 用的东西留在那个 app 里 —— 提前抽包换来的是每次改动都要跨两个目录。

## app 内部的四层

这张表是从旧单体前端沿用下来的，四个 app 都按它组织：

| 目录        | 职责                                | 存活周期                           | 能否持有状态？                                    |
| ----------- | ----------------------------------- | ---------------------------------- | ------------------------------------------------- |
| `conf`      | 静态声明。环境地址、常量。          | 编译时确定。                       | ❌ 纯静态                                         |
| `utils`     | 纯逻辑计算。格式化、加密。          | 随调随用，执行完即销毁。           | ❌ 无状态。                                       |
| `hooks`     | 逻辑复用。封装请求、表单逻辑。      | 随组件挂载而生，卸载而死。         | ✅ 有状态，但不共享（每个组件一份独立的 state）。 |
| `providers` | 依赖注入。提供全局唯一的实例/状态。 | 应用生命周期级别（从打开到关闭）。 | ✅ 全局唯一状态共享。                             |

判断一段代码该放哪一层，先问它的存活周期，再问它能不能持有状态 —— 这两列比「职责」
那列更能一刀切开。`providers` 之外再想放全局状态，就说明该建一个新的 provider 了。

`routes/` 是 TanStack Router 的文件式路由，`routeTree.gen.ts` 与 `src/gen/`
（buf 生成的 protobuf 客户端）都是生成物，已在根 `vite.config.ts` 里排除出 lint 和 fmt。

## 命令

```bash
pnpm i           # 安装；prepare 会跑 vp config 装 git 钩子
pnpm dev         # consumer
pnpm ready       # vp fmt && vp lint && vp run -r test && vp run -r build，提 PR 前跑它
```

单独跑某个包的任务用 `vp run <包名>#<任务>`，全仓递归用 `vp run -r <任务>`。
注意 `-r` 要放在任务名**前面**，`vp run test -r` 会报 `Task "test" not found`。

## 工具链

vite-plus 一个包覆盖了 dev server、构建、测试（vitest）、lint（oxlint）、
格式化（oxfmt）、任务运行器和 git 钩子。所以这里没有 husky、没有 biome、
没有独立的 eslint / prettier / lint-staged。

`staged` / `fmt` / `lint` 三块只能写在 `frontend/vite.config.ts`：

- `lint.options.typeAware` 被 oxlint 硬性限制为只允许根配置，写进 app 层会直接报错；
- `vp staged`（pre-commit 调的）只读 workspace 根配置。

### git 钩子

`frontend/package.json` 的 `prepare: "vp config"` 负责安装，它会把仓库级的
`core.hooksPath` 指到 `frontend/.vite-hooks/_`。**因此整个仓库（含后端 Go）的提交都走这里。**

| 钩子         | 做什么                                                      |
| ------------ | ----------------------------------------------------------- |
| `pre-commit` | `cd frontend && vp staged` —— 对暂存文件跑 `vp check --fix` |
| `commit-msg` | `pnpm exec commitlint --edit "$1"` —— 规则在仓库根          |

vite-plus 不提供提交信息校验，所以 commitlint 仍装在仓库根，只是改由 vp 的钩子目录来调。
不要把钩子挪回仓库根的 `.husky/`：`vp config` 会主动接管任何以 `.husky` 开头的
`core.hooksPath`，两套钩子抢同一个 git 配置，抢输的那套静默失效。
详见 `frontend/.vite-hooks/commit-msg` 里的注释和 `context/team/git-commit.md`。
