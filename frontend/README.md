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

| app             | 端口 | 说明                                                  | 启动                                        |
| --------------- | ---- | ----------------------------------------------------- | ------------------------------------------- |
| `consumer`      | 3000 | 消费者端：商品、购物车、下单、地址、订单              | `vp run -F consumer dev`                    |
| `merchant`      | 3002 | 商家端：店铺、商品、订单、报表                        | `vp run -F merchant dev`                    |
| `admin`         | 3003 | 管理端：用户、商家、品类、报表                        | `vp run -F admin dev`                       |
| `consumer-next` | 3004 | Next.js 消费者端；独立于 Vite consumer app            | `vp run -F @ecommerce/consumer-next dev`    |
| `desktop`       | —    | Tauri 壳，按配置文件套在 consumer / merchant 之一外面 | `vp run -F @ecommerce/desktop dev:consumer` |

workspace 当前有 5 个 app。`desktop` 不是独立的页面应用，而是 Rust 侧的窗口 + 系统能力，页面仍然来自
`consumer` / `merchant` 的 dev server（config app 已随配置中心迁出）。所以这两个 app 的
`server.strictPort` 必须是 `true`：端口被占时要报错，不能静默换号，否则壳会连到一个空窗口。
`consumer-next` 使用 Next.js 独立构建和运行，不参与 Vite consumer app 的 dev server。

### packages

| package     | 职责                                                                |
| ----------- | ------------------------------------------------------------------- |
| `api`       | Connect 传输层：transport、拦截器（认证/日志）、错误归一化          |
| `configs`   | 跨端共享的静态配置（Casdoor 等）                                    |
| `constants` | 跨端共享的枚举与常量（订单状态、搜索字段）                          |
| `copilot`   | 页内智能助手：固定句式转页面动作，并在页面内引导操作                |
| `i18n`      | i18next 实例、语言探测、格式化、共享 locales                        |
| `icons`     | 跨端共享的 React 图标组件                                           |
| `lantern`   | 商品展示和设计演示所需的共享模型、token 与素材                      |
| `perf`      | Web Vitals / 长任务 / 接口耗时采集，经网关 `telemetry.v1` 上报      |
| `tauri`     | 桌面端专属胶水：环境探测、Rust 侧 fetch、本地设置、OAuth 子窗口桥接 |
| `tracker`   | 浏览行为埋点，上报给 behavior 服务喂给 gorse                        |
| `ui`        | 与业务无关的展示组件与 hook（错误边界、懒加载图、虚拟列表、防抖）   |
| `utils`     | 纯函数：JWT 解析、Casdoor 跳转拼装、通知                            |

分包原则：**被两个以上 app 用到，且不含业务语义**才进 `packages/`。
只有一个 app 用的东西留在那个 app 里 —— 提前抽包换来的是每次改动都要跨两个目录。

## app 内部的四层

这张表是从旧单体前端沿用下来的，适用于 `consumer`、`merchant` 和 `admin`：`desktop` 是 Rust 壳，不适用这套目录；`consumer-next` 使用 Next.js 的 `app/` 目录。

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
vp install              # 安装；prepare 会跑 vp config 装 git 钩子
vp run -F consumer dev   # consumer，端口 3000
vp run -r build          # 构建 admin、consumer、consumer-next、merchant；desktop 需单独构建
vp run -F @ecommerce/desktop dev:merchant  # desktop merchant，端口由 Tauri 配置决定
vp run -w ready          # vp fmt && vp lint && vp run -r test && vp run -r build，提 PR 前跑它
```

根目录没有 `build` script，因此不要在 `frontend/` 直接运行 `pnpm build`；全仓 Web 构建使用 `vp run -r build`。
`desktop` 不参与这个递归任务，按目标平台单独运行 `vp run -F @ecommerce/desktop build:consumer`（consumer）或
`vp run -F @ecommerce/desktop build:merchant`（merchant）。

单独跑某个包的任务用 `vp run -F <包名> <任务>`，全仓递归用 `vp run -r <任务>`。
`-F` 用于筛选 workspace package；`-r` 要放在任务名**前面**，`vp run test -r` 会报 `Task "test" not found`。

## 部署到 EdgeOne Pages（consumer）

`consumer` 是静态 SPA，产物 `apps/consumer/dist` **直传** EdgeOne Pages（中国站），不走云端构建。
两条路径并存，互不影响，也不动现有 CI（GitLab 侧门禁 `.gitlab-ci.yml` 不涉及发布）：

| 路径    | 触发方式                                                                                                                                                           | 入口                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| CI 自动 | push 到 `main`，且改动命中 `frontend/apps/consumer/**`、`frontend/packages/**`、`vite.config.ts`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`frontend/package.json` | `.github/workflows/edgeone-pages.yml`（Actions 页也可手动 dispatch） |
| 手动    | 在 `frontend/` 目录下执行                                                                                                                                          | `export EDGEONE_TOKEN=<token> && make deploy-edgeone`                |

凭据：EdgeOne Pages **中国站**控制台 → API Token 生成，写入 GitHub Secrets `EDGEONE_TOKEN`（自动路径）
或本地环境变量 `EDGEONE_TOKEN`（手动路径）。**Token 不写进仓库**（AGENTS.md 硬规则 4）。

可调变量（Makefile，均有默认值）：`EDGEONE_PROJECT`（`ecommerce-consumer`）、`EDGEONE_SITE`（`china`）、
`EDGEONE_AREA`（`global`）、`EDGEONE_CLI`（`edgeone`）。`edgeone makers deploy` 要求项目为「直接上传」
类型——当前项目即按此创建，后续接入其它前端时同样以产物直传方式建项目。

只部署已有产物（本地已构建、跳过构建步）：`make deploy-edgeone-dist`。

当前线上项目：EdgeOne Pages 项目 ID `makers-sdv6nubcmox9`（域名 `ecommerce-consumer-4c3rycx9.edgeone.cool`）。
已知坑：`edgeone pages deploy`（已废弃）与 `edgeone makers deploy` 的项目名查找互不可见——2026-10-15
首次用 `makers deploy` 时它按名字找不到旧项目（`makers-gjtjsbxtu4yy`，域名 `ecommerce-consumer-ydl1jxno.edgeone.cool`），
**另建了同名新项目**。本仓库 CI 与 Makefile 统一走 `makers deploy`，目标是新项目；再次执行会复用同一项目
（已验证幂等），不会继续新建。旧项目已在控制台列为待清理项，建议删除以免混淆。

## 部署到 EdgeOne Pages（consumer-next，Next.js SSR）

`consumer-next` 是 Next.js SSR（App Router），部署链路和 `consumer`（静态直传）**不一样**，关键事实（均经实测）：

- **不能**用 `edgeone makers deploy <目录>` 直传：该命令创建的是「静态直传」型项目，不识别 SSR 运行时。
  实测——建项目成功、文件上传成功，但部署步 `Deploying... → Failed`（2026-10-15，项目 `makers-1go5woasjust`
  已废弃/失败，控制台可删除）。
- 可行路径是 **EdgeOne Git 集成云端构建**：在 EdgeOne 控制台把本仓库连到 Pages 项目，根目录设为 `frontend`
  （必须带 workspace 上下文，否则 `@ecommerce/lantern` 等 workspace 依赖解析不到），push 到 `main` 即自动构建部署。

构建配置集中在 `frontend/edgeone.json`：

| 字段              | 值                                                  | 说明                     |
| ----------------- | --------------------------------------------------- | ------------------------ |
| `installCommand`  | `corepack enable && pnpm install --frozen-lockfile` | 用 pnpm 装整个 workspace |
| `buildCommand`    | `pnpm --filter @ecommerce/consumer-next build`      | 只构建 consumer-next     |
| `outputDirectory` | `apps/consumer-next/.next`                          | Next.js 构建产物         |
| `nodeVersion`     | `22.11.0`                                           | 与本地一致               |

还需在控制台项目设置里配置两个环境变量（**不要写进仓库**）：

- `EDGEONE_BUILD=1`：让 `next.config.ts` 关闭 `output: "standalone"`，改用 EdgeOne 的无服务器源码构建形态
  （`output: standalone` 是给 K8s 容器用的，EdgeOne 无 Docker 支持）；
- `CONSUMER_NEXT_GATEWAY_URL=https://gateway.apikv.com`：consumer-next 的 `/api/*` 反代与 SSR 取数都读这个运行期变量
  （`app/api/[...path]/route.ts` 第 16 行），填公网网关地址，否则 SSR 取数与 API 反代会 502。

### 两条路径

| 路径 | 触发方式                                                                                                                 | 说明                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 自动 | push 到 `main` 且改动命中 `frontend/apps/consumer-next/**`、`frontend/packages/**`、`frontend/edgeone.json`、lockfile 等 | EdgeOne Git 集成自动云端构建部署（非 GitHub Actions 部署）                                   |
| 手动 | 在 `frontend/` 目录下执行                                                                                                | `export EDGEONE_BUILD=1 && make deploy-edgeone-next`，本地构建后按提示 push 或控制台重新部署 |

- GitHub workflow `.github/workflows/edgeone-pages-consumer-next.yml` 是**构建门禁**：push 时先在本仓库 CI 跑一次
  `next build` 快速暴露类型/构建错误；真正的生产部署由 EdgeOne Git 集成完成（职责分离、不触碰凭据）。
- Makefile 目标：`consumer-next-build`（仅本地构建）、`deploy-edgeone-next`（构建 + 上线指引）。
- 已知限制：`next.config.ts` 里 `/` → `/zh` 的 `rewrites()` 在 EdgeOne 上不被 Next.js 适配层支持
  （官方文档：Next.js 的 rewrite/redirect 暂不支持，建议用 `edgeone.json`；而 `edgeone.json` 的 `rewrites`
  仅适用静态资源、不支持 SPA 路由重写）。故访问根 `/` 可能不走改写——临时可用 `/zh` 直达，根治需在 app 层处理
  （如新增 `app/page.tsx` 做 `redirect("/zh")`）。待 EdgeOne 支持 Next.js rewrite 或改 app 路由后解决。

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

| 钩子         | 做什么                                                                     |
| ------------ | -------------------------------------------------------------------------- |
| `pre-commit` | `cd frontend && vp staged` —— 对暂存文件跑 `vp check --fix`                |
| `commit-msg` | `pnpm exec commitlint --config frontend/commitlint.config.mjs --edit "$1"` |

vite-plus 不提供提交信息校验，所以 commitlint 由 frontend workspace 承载，规则在
`frontend/commitlint.config.mjs`；仓库根不再有 Node workspace。
不要把钩子挪回仓库根的 `.husky/`：`vp config` 会主动接管任何以 `.husky` 开头的
`core.hooksPath`，两套钩子抢同一个 git 配置，抢输的那套静默失效。
详见 `frontend/.vite-hooks/commit-msg` 里的注释和 `context/team/git-commit.md`。
