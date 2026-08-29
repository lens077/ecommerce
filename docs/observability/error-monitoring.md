# 错误监控接入手册（Bugsink）

> 定稿：错误监控**维持 Bugsink**（[TECH.md](../TECH.md) §11.3，2026-08-28 复核）。
> 本文是**可执行接入手册**：边界、前置、改动清单、验收门禁与回退。
> 容量证据、官方一手来源与方案论证见调研报告 [`../reports/2026-08-28-bugsink-integration-research.md`](../reports/2026-08-28-bugsink-integration-research.md)；服务端部署与运维（node3）见 [`../INFRASTRUCTURE-OPERATIONS.md`](../INFRASTRUCTURE-OPERATIONS.md) §6。

## 1. 边界（先读，防止接歪）

- Bugsink 只收 **Sentry SDK 错误事件**；官方明确不处理 traces/metrics，SDK 一律 `tracesSampleRate: 0`。
- 性能与链路不归它：RUM 归 `@ecommerce/perf`，链路/指标/日志归 OTel + VictoriaMetrics/Logs/Traces。出现 APM/transaction/uptime 需求走 TECH.md §11.3 的 GlitchTip 条件采纳触发器，不在 Bugsink 上加戏。
- 接入主体是**前端三个 Vite SPA + Tauri 壳**；后端 10 个 Go 服务**不接**（zap+OTel→VictoriaLogs+vmalert 已覆盖错误，双写制造第二事实源）；consumer-next 随 Next POC 单列（SSR 端必须 per-request scope）。
- 现役容量足够（node3 实测 55 MiB/768 MiB、CPU 0.02%），**不需要扩容**；风险防的是事件风暴，不是容量。

## 2. 硬前置（不满足则接了也白接）

1. **CSP**：`frontend/apps/consumer/Dockerfile:123` 的 `connect-src` 当前只有 casdoor/gateway，必须追加 `https://bugsink.apikv.com`——否则事件被浏览器整批拦截且页面无感知。merchant/admin 部署链建 CSP 时同步带上。
2. **DSN/token 不入仓库**（[OBSERVABILITY.md](OBSERVABILITY.md) 硬规则）：`VITE_BUGSINK_DSN` 经 CI build arg 或本地 `.env.production.local`（已 gitignore）注入；`BUGSINK_AUTH_TOKEN` 只存 CI secret。前端 DSN 在产物中本就公开，规则防的是仓库泄露面。
3. **QueryClient 现状**：三 app 均 `throwOnError: false`，API 错误不会冒泡到全局 handler——不接 `QueryCache/MutationCache.onError` 就会漏掉全部 API 错误。

## 3. 改动清单

**新增** `frontend/packages/errors/`（workspace 包 `@ecommerce/errors`）：

- `src/index.ts`：`initErrorMonitoring({app})`——`@sentry/react` 装配；DSN 判空即整体禁用（dev 默认不报）；`tracesSampleRate:0`、`sendDefaultPii:false`；`beforeSend` 剥 cookie/授权头/URL token；`environment`（dev/pre/prod）与 `release`（`<app>@<git-sha>`，与镜像 tag `sha-<7位>` 同源）；`isTauri()` 时加 `runtime:desktop` 标记。
- `src/react.tsx`：根 ErrorBoundary 接线 helper + `QueryCache/MutationCache onError` 工厂。ConnectError 分类：`Internal/Unknown/DataLoss/Unimplemented` 上报；`Unauthenticated`（登出常态）、`Canceled`、瞬时 `Unavailable/DeadlineExceeded`（retry 已覆盖）不报。

**修改**：

| 文件 | 改动 |
|---|---|
| `frontend/pnpm-workspace.yaml` | catalog 钉 `@sentry/react` |
| `frontend/apps/{consumer,merchant,admin}/package.json` | 加 `@ecommerce/errors` 依赖 |
| `frontend/apps/{consumer,merchant,admin}/src/bootstrap.tsx` | render 前 `initErrorMonitoring()`；QueryClient 补两个 cache 的 `onError`；根部包 `@ecommerce/ui` 的 `ErrorBoundary` 并把 `onError` 接 `captureException`（该组件现存但三 app 均未挂载，顺带补掉白屏无上报缺口） |
| `frontend/apps/consumer/src/env.ts` | client 段加 `VITE_BUGSINK_DSN: z.string().url().optional()`（merchant/admin 无 env.ts，包内读 `import.meta.env` 兜底） |
| `frontend/apps/{consumer,merchant,admin}/vite.config.ts` | `build.sourcemap: 'hidden'` |
| `frontend/apps/consumer/Dockerfile` | CSP `connect-src` 追加 bugsink 域；COPY 前删除 `.map`（不进镜像） |
| 前端发布链（重建时） | `sentry-cli sourcemaps inject ./dist` → `sentry-cli sourcemaps upload --url=https://bugsink.apikv.com`（Bugsink 2.0.14+ debug ID + artifact bundle 链路；上传失败不阻断发布） |

**服务端（node3，不入库）**：按 app 建 consumer/merchant/admin 三个项目，`environment` 区分环境；DSN 从项目页发；New Issue 告警走现有 ALERTS webhook → ntfy bridge（零新增）；核对项目级摄入限流与 `MAX_EVENT_AGE_DAYS`。

**不修改**：`@ecommerce/perf`、`@ecommerce/tracker`、后端 10 服务、`control-tower`、`.service-matrix.yaml`。

## 4. 分阶段与验收门禁

| 阶段 | 内容 | 门禁（全过才算完成） |
|---|---|---|
| P1（0.5–1 天） | errors 包 + consumer + CSP + dev 验证 | ①手抛错 → Bugsink Issue，2 events→1 issue 分组 ②桩 `Internal` ConnectError 能到、`Unauthenticated` 不到 ③ntfy 收到 New Issue ④event payload 抽查无 cookie/token/PII |
| P2（0.5 天） | merchant/admin + Tauri 标记 + release 注入 | 三项目各自收到事件；environment/release 正确；Tauri 事件带 desktop 标记 |
| P3（0.5 天，挂前端发布链重建） | Source Map 真实构建验收 | 生产构建压缩栈还原**准确源码行号**；镜像内无 `.map`；上传失败构建仍可发布 |

P3 完成即核销 `TODO.md`「错误监控 Source Map」与 `INFRASTRUCTURE-OPERATIONS.md` 残余风险「Source Map 上传路径尚未验收」两条。

## 5. 红线与回退

- `setUser` 最多 `{id}`，不放 email/昵称；面包屑关闭 fetch body 采集（对齐 [`../PRIVACY.md`](../PRIVACY.md)）。
- 事件风暴双层兜底：SDK `sampleRate`（初期 1.0，风暴后降）+ 服务端限流/保留期。
- node3 单点是既有残余风险：Bugsink 不可达时 SDK 静默丢弃，不影响业务页面；靠异机探针发现，不为错误监控做 HA。
- 广告拦截器会拦截部分上报——错误监控是抽样视角，不是全量审计。
- **回退**：删 `initErrorMonitoring()` 调用即完全退场，服务端零变更。
