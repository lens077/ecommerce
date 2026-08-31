# Bugsink 错误监控：容量证据与本仓接入方案

> 决策背景：2026-08-28 拍板错误监控**维持 Bugsink**（[TECH.md](../TECH.md) §11.3），GlitchTip 转条件采纳。
> 本文回答三个问题：占多大内存/性能、本项目如何接入、需要修改或新增什么。
> 事实分三档标注：**官方口径**（附一手来源）、**本仓实测**（node3/仓库检查）、**工程预算**（推断值，须验收校准）。

## 1. 结论先行

1. **容量足够，无需扩容**：现役 node3 实例（2.5.x + PostgreSQL）稳态 **55 MiB RSS / 0.02% CPU / 8 进程**，容器限额 768 MiB；官方单机指南以 2 GiB + 10 worker 支撑约 150 万事件/日为容量参考。本仓前端错误量远低于该量级，现有部署直接复用。
2. **职责边界不变**：Bugsink 只收 Sentry SDK 的**错误事件**（官方明确不处理 traces/metrics，SDK 侧 `tracesSampleRate: 0`）；性能与链路继续由 `@ecommerce/perf`（RUM）+ OTel + VictoriaMetrics/Logs/Traces 承担，互不重叠。
3. **接入主体在前端**：三个 Vite SPA + Tauri 壳接 `@sentry/react`（新建 `@ecommerce/errors` workspace 包统一装配）；后端 10 个 Go 服务**不接**（zap+OTel→VictoriaLogs+vmalert 已覆盖，双写只会制造第二事实源）；consumer-next 随 POC 推进单独接。
4. **两处硬前置**：①`connect-src` CSP 必须加 `https://bugsink.apikv.com`（实测当前只有 casdoor/gateway，不改则事件被浏览器整批拦截且无感知）；②DSN 按仓库规则不得入库，经构建期环境注入。

## 2. 内存与性能

### 2.1 官方口径

- 官方**没有**最低 CPU/RAM/磁盘规格表；单机生产指南以 **2 GiB 服务器 + 10 个 Gunicorn worker** 为示例，称**每 worker 远低于 100 MiB**，并建议稳态内存保持在可用内存 50% 以下（[single-server-production](https://www.bugsink.com/docs/single-server-production/)）。
- 同一指南声称单台廉价服务器可达约 **150 万事件/日**——容量参考，不是最低规格承诺。
- 摄入限流与保留期由服务端配置承担（[ingestion-rate-limits-and-retention](https://www.bugsink.com/docs/ingestion-rate-limits-and-retention/)）；数据库支持 SQLite/MySQL/PostgreSQL，后台任务由内置 Snappea 进程处理（[installation](https://www.bugsink.com/docs/installation/)）。
- 版本活跃度：近 12 个月 25 个稳定 Release，最新 2.5.0（[releases](https://github.com/bugsink/bugsink/releases)）。

### 2.2 本仓实测（node3，2026-08-28）

| 指标 | 实测值 | 说明 |
|---|---|---|
| 内存 | **55.1 MiB / 768 MiB 限额（7.2%）** | `docker stats`，含 web + Snappea worker 共 8 进程 |
| CPU | **0.02%** | 低事件量稳态，非压测值 |
| 数据库 | PostgreSQL（`DATABASE_URL`） | 非 SQLite 快速路径，符合官方生产建议 |
| worker | `SNAPPEA_NUM_WORKERS` 已显式配置 | 值在 node3 env，不入文档 |
| 保留期 | `MAX_EVENT_AGE_DAYS` 已配置 | 磁盘增长有上界 |
| 告警 | `ALERTS_WEBHOOK_*` 白名单 → 本机 Slack-compatible bridge → 认证 ntfy | New Issue 已实测送达 |
| 入口 | 容器仅发布 `127.0.0.1:8010`，公网经 Pangolin `bugsink.apikv.com`（SSO off） | SDK 直接 POST 可达；访问控制=登录+项目成员+DSN |
| 重启策略 | `unless-stopped`，运行 21h healthy | — |

### 2.3 工程预算（推断，须校准）

- 前端错误事件量级：三个 SPA 当前用户量下，预计日常 **<1 万事件/日**，与 150 万/日参考值差两个数量级——**容量不是本次接入的风险点**。
- 真正的风险是**事件风暴**（某个渲染循环错误每秒抛几十条）：双层防线——SDK 侧 `sampleRate`（错误采样，初期 1.0，风暴后可降）+ `ignoreErrors`/`beforeSend` 过滤，服务端侧 Bugsink 项目级摄入限流与 `MAX_EVENT_AGE_DAYS`。
- node3 单点是既有残余风险（[INFRASTRUCTURE-OPERATIONS.md](../INFRASTRUCTURE-OPERATIONS.md) §8）：Bugsink 不可达时 Sentry SDK 静默丢弃事件，**不影响业务页面**；靠异机 Gatus 探针发现，不需要为错误监控做 HA。

## 3. 接入方案

### 3.1 总体拓扑

```text
consumer / merchant / admin (Vite SPA + Tauri 壳)
  └─ @ecommerce/errors（新包：@sentry/react 装配 + PII 过滤 + Connect 错误分类）
       └─ POST https://bugsink.apikv.com（DSN 按 app 分项目；environment=dev/pre/prod；Tauri 加 desktop 标记）
            └─ New Issue → ALERTS webhook → ntfy（现有链路，零新增）
consumer-next（POC）→ 随 POC 单独接（服务端 per-request，勿共享全局 scope）
Go 后端 10 服务 → 不接（zap+OTel→VictoriaLogs 已覆盖错误；vmalert 告警）
```

- **项目划分**：Bugsink 侧按 app 建 3 个项目（consumer/merchant/admin），`environment` 字段区分 dev/pre/prod；Tauri 复用 consumer 项目 + `runtime:desktop` tag。理由：告警路由按 app 分流，避免 admin 噪声淹没 consumer。
- **与 TanStack Query 的衔接（关键）**：三 app 的 QueryClient 均 `throwOnError: false`——查询错误不会冒泡到 window/ErrorBoundary，**只挂全局 handler 会漏掉全部 API 错误**。必须在 `QueryCache`/`MutationCache` 的 `onError` 统一捕获，并按 ConnectError code 分类：`Internal/Unknown/DataLoss/Unimplemented` 上报；`Unauthenticated`（登出常态）、`Canceled`、以及已由 retry 覆盖的瞬时 `Unavailable/DeadlineExceeded` 不上报（避免把网关抖动刷成 Issue 噪声）。
- **ErrorBoundary 现状**：`@ecommerce/ui` 的 `ErrorBoundary` 有 `onError` 钩子但目前只 `console.error`，且**三个 app 的根组件都没有挂它**——接入时在 bootstrap 根部包上并接 `captureException`，一举补掉白屏无上报的缺口。
- **PII 红线**（对齐 `docs/PRIVACY.md` 与 OBSERVABILITY 硬规则）：`sendDefaultPii: false`；`beforeSend` 剥离 cookie/授权头/URL query 中的 token；`setUser` 最多 `{id}`，不放 email/昵称；面包屑关闭 fetch body 采集。
- **Source Map**（Bugsink 2.0.14+ 官方链路）：`vite build.sourcemap: 'hidden'` → `sentry-cli sourcemaps inject ./dist` 注入 debug ID → `sentry-cli sourcemaps upload --url=https://bugsink.apikv.com` 上传 artifact bundle。事件按 debug ID 匹配源文件，不依赖 release 名（[sourcemaps](https://www.bugsink.com/docs/sourcemaps/)）。`.map` 不进镜像（Dockerfile COPY 前删除）。release 命名 `<app>@<git-sha>`，与现镜像 tag `sha-<7位>` 同源。

### 3.2 需要修改/新增的文件（精确清单）

**新增**

| 文件 | 内容 |
|---|---|
| `frontend/packages/errors/package.json` | 新 workspace 包 `@ecommerce/errors`；deps：`@sentry/react`（catalog） |
| `frontend/packages/errors/src/index.ts` | `initErrorMonitoring({app})`：DSN 判空即禁用（dev 默认不报）、`tracesSampleRate:0`、environment/release 装配、`beforeSend` PII 过滤、ConnectError 分类器、`isTauri()` 加 desktop 标记 |
| `frontend/packages/errors/src/react.tsx` | 根 ErrorBoundary 接线 helper + `QueryCache/MutationCache onError` 工厂（三 app 复用同一套分类规则） |

**修改**

| 文件 | 改动 | 备注 |
|---|---|---|
| `frontend/pnpm-workspace.yaml` | catalog 增加 `@sentry/react` 版本钉 | Renovate 后续接管 |
| `frontend/apps/{consumer,merchant,admin}/package.json` | 增加 `@ecommerce/errors` 依赖 | — |
| `frontend/apps/consumer/src/bootstrap.tsx` | ①`initErrorMonitoring()`（render 前）②QueryClient 补 QueryCache/MutationCache onError ③根部包 ErrorBoundary | 约 10 行 |
| `frontend/apps/merchant/src/bootstrap.tsx`、`frontend/apps/admin/src/bootstrap.tsx` | 同上 | 结构同构 |
| `frontend/apps/consumer/src/env.ts` | client 段加 `VITE_BUGSINK_DSN: z.string().url().optional()` | merchant/admin 无 env.ts，由 errors 包内读 `import.meta.env` 统一兜底 |
| `frontend/apps/{consumer,merchant,admin}/vite.config.ts` | `build.sourcemap: 'hidden'` | 产物不引用 map |
| `frontend/apps/consumer/Dockerfile:123` | CSP `connect-src` 追加 `https://bugsink.apikv.com` | **不改则事件全被拦**；merchant/admin 的部署 CSP 同步检查（当前仅 consumer Dockerfile 带 CSP，另两端部署链尚未建 CSP，接入时一并核对） |
| 前端构建/发布链（重建时） | 增加 sourcemaps inject/upload 步骤 + `BUGSINK_AUTH_TOKEN` secret | 现状 `frontend.yml` 构建段已删、前端为手工 `kubectl apply`；CI 重建前可先在本地发布脚本执行 |
| Bugsink 服务端（node3，不入库） | 建 consumer/merchant/admin 三项目、发 DSN、接 ntfy bridge、核对项目级限流 | 凭据只存 node3/CI secret |

**不修改**：`@ecommerce/perf`（RUM 职责不同）、后端 10 服务与 `control-tower`（不接 sentry-go）、`.service-matrix.yaml`、`@ecommerce/tracker`。

**环境注入约束**：`VITE_BUGSINK_DSN` 经 CI build arg 或本地 `.env.production.local`（已 gitignore）注入；**DSN/token 不进仓库**（OBSERVABILITY 硬规则）。前端 DSN 在产物中本就公开可见，该规则防的是仓库泄露面与历史追溯，不是运行时保密。

### 3.3 分阶段与验收门禁

| 阶段 | 内容 | 工作量（预算） | 验收门禁 |
|---|---|---:|---|
| P1 | errors 包 + consumer 接入 + CSP + dev 手抛错验证 | 0.5–1 天 | ①手抛错 → Bugsink Issue（2 events→1 issue 分组）②QueryCache 路径：桩一个 `Internal` ConnectError 能到、`Unauthenticated` 不到 ③ntfy 收到 New Issue ④event payload 抽查无 cookie/token/PII |
| P2 | merchant/admin + Tauri desktop 标记 + release 注入 | 0.5 天 | 三项目各自收到事件；environment/release 字段正确；Tauri 事件带 desktop 标记 |
| P3 | Source Map 真实构建验收（挂前端发布链重建） | 0.5 天 | 生产构建的压缩栈在 Bugsink 还原出**准确源码行号**；镜像内无 `.map`；上传失败时构建仍可发布（上传是软步骤） |

对应 `TODO.md`「错误监控 Source Map」与 `INFRASTRUCTURE-OPERATIONS.md` 残余风险「Source Map 上传路径尚未做真实前端构建验收」两条，P3 完成即核销。

## 4. 风险与边界

- **不承诺**：Bugsink 不做 APM/transaction/span/uptime——出现这些需求走 TECH.md §11.3 的 GlitchTip 条件采纳触发器，不在 Bugsink 上加戏。
- **广告拦截器**会拦截部分用户的上报（Sentry 系 SDK 常态）——错误监控是抽样视角，不是全量审计。
- **consumer-next**：SSR 端若接，必须 per-request scope（禁止模块级全局 Hub 混串请求），随 Next POC 单列，不阻塞本三阶段。
- **回退**：任何阶段出问题，删 `initErrorMonitoring` 调用即完全退场；服务端无需变更。

## 5. 来源清单

**官方**：[single-server-production](https://www.bugsink.com/docs/single-server-production/) · [installation](https://www.bugsink.com/docs/installation/) · [settings](https://www.bugsink.com/docs/settings/) · [ingestion-rate-limits-and-retention](https://www.bugsink.com/docs/ingestion-rate-limits-and-retention/) · [sdk-recommendations](https://www.bugsink.com/docs/sdk-recommendations/) · [sentry-sdk-compatible](https://www.bugsink.com/sentry-sdk-compatible/) · [sourcemaps](https://www.bugsink.com/docs/sourcemaps/) · [alerts](https://www.bugsink.com/docs/alerts/) · [releases](https://github.com/bugsink/bugsink/releases)

**本仓实测/证据**：node3 `docker stats/inspect`（2026-08-28）· `frontend/apps/consumer/Dockerfile:123`（CSP）· `frontend/apps/*/src/bootstrap.tsx`（QueryClient `throwOnError:false`）· `frontend/packages/ui/src/ErrorBoundary.tsx`（onError 未接线）· `.github/workflows/frontend.yml`（构建段已删）· [`2026-08-27-infrastructure-audit.md`](2026-08-27-infrastructure-audit.md) · [`../INFRASTRUCTURE-OPERATIONS.md`](../INFRASTRUCTURE-OPERATIONS.md) §6
