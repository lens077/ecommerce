# STACK.md — 技术栈与工程约束真相源

> 本文件回答两个问题：**这个项目用了什么**、**在这个项目里干活必须遵守什么**。
>
> 分工：
> - 技术选型与版本、分层规则、编码约束 → **本文件**
> - 服务拓扑事实（注册名/前缀/依赖/Config Center 键/端口）→ [`.service-matrix.yaml`](.service-matrix.yaml)
> - 架构设计与"为什么" → [`docs/design/`](docs/design/README.md)（按微服务分目录，含 config-center 存档）
> - 实现进度 → [`TODO.md`](TODO.md)
> - AI 协作行为基线 → [`AGENTS.md`](AGENTS.md) + [`context/`](context/INDEX.md)
>
> ⚠️ 同一条事实只写一处。本文件不复制上述文件的内容，只做引用。
> 想按这套栈起一个新项目，见 [`docs/SCAFFOLD.md`](docs/SCAFFOLD.md)。

---

## 一、项目定位与仓库形态

**单仓（single-repo）B2B2C 电商平台**。proto 契约与业务代码同仓，前端 monorepo 与后端微服务并列，不存在多仓分支联动问题。

```
ecommerce/
├── AGENTS.md                  # AI 协作入口（硬规则 + 索引）
├── STACK.md                   # ← 本文件
├── .service-matrix.yaml       # 服务拓扑事实表（AI/CI 查表用，非设计文档）
├── docs/                      # design/ 架构真相源 · architecture/ 交互式架构图
│                              #   DEVOPS / SCAFFOLD / PRIVACY / TESTING / OKTETO / observability/ 也收纳于此
├── TODO.md                    # 进度真相源（✅ / 🟡 / ⬜）
├── context/                   # 三层知识库（team / harness-framework / project）
├── backend/
│   ├── api/{service}/v1/*.proto     # 对外契约（同时生成 Go 与 TS）
│   ├── constants/                   # 跨服务共享枚举与元数据键
│   ├── pkg/                         # 跨服务共享库（gorse / product / types）
│   ├── services/{service}/          # 每服务一个独立 fx 应用
│   ├── buf.yaml · buf.gen.yaml · buf.gen.ts.yaml · sqlc.yaml · Makefile
│   └── go.mod                       # 单一 module，10 个服务共享
├── gateway/                   # go-kratos/gateway fork（独立 module，subtree 到独立仓）
├── frontend/                  # pnpm workspace（apps/* + packages/*）
├── helm/{charts,library}      # 每服务一个 chart + 一个 library chart
└── .github/workflows/         # backend.yml / frontend.yml，tag 触发 GitOps
```

**关键结构决策**

| 决策 | 取舍 |
|---|---|
| 后端 10 个服务共用**一个 go.mod** | 省掉 10 份依赖升级；靠目录 + `internal/` 强制边界 |
| proto 与实现同仓 | 契约改动一个 PR 可见全链路影响；代价是仓库大 |
| 网关是**独立 module 的 fork** | 可 `git subtree push --prefix=gateway gateway main` 推到独立仓复用 |
| 前端 4 个 app 一个 workspace | 靠 `packages/*` 复用拦截器/错误模型/UI，靠 catalog 统一版本 |

---

## 二、技术栈（含实际锁定版本）

> **选型定稿（2026-08-20，三轮对抗评审）**：新一轮选型已逐项定稿——结论与理由见
> [`docs/TECH-RADAR.md`](docs/TECH-RADAR.md)（定稿版），过程证据见 [`docs/技术栈选型对抗/`](docs/技术栈选型对抗/)。
> **已拍板未落地**的选型（NATS JetStream、Meilisearch 代码迁移、VictoriaLogs+Vector、KEDA、
> Argo Rollouts、OpenFGA、trust-manager、ESO+OpenBao、Velero+SeaweedFS、ClickHouse、mirrord、
> casdoor 收编等）以 [`TODO.md`](TODO.md)「技术选型定稿（2026-08-20）」小节为执行真相源；
> **本文件只记录已在用的事实**，各项落地后再更新对应行。

### 2.1 后端（Go）

| 类别 | 选型 | 版本 |
|---|---|---|
| 语言 | Go | **1.26.5**（backend 与 gateway 同版，以两个 go.mod 为准） |
| RPC 框架 | `connectrpc.com/connect` | v1.19.2 |
| 协议 | Connect / gRPC / gRPC-Web 三兼容，HTTP/2 h2c 明文 | — |
| IDL | Protobuf + Buf CLI | protobuf v1.36.11 |
| 参数校验 | `buf.build/go/protovalidate` + `connectrpc.com/validate` 拦截器 | v1.2.0 / v0.6.0 |
| 依赖注入 | `go.uber.org/fx` | v1.24.0 |
| 日志 | `go.uber.org/zap` + `otelzap` bridge | v1.28.0 / v0.18.0 |
| DB 驱动 | `jackc/pgx/v5` + `exaring/otelpgx` | v5.9.2 / v0.10.0 |
| DB 代码生成 | **sqlc**（写 SQL → 生成类型安全 Go） | driver `pgx/v5` |
| 缓存 | `redis/go-redis/v9` | v9.21.0 |
| 搜索 | `elastic/go-elasticsearch/v9`（**迁移中 → `meilisearch-go`**，2026-08-16 拍板，ES 已退役） | v9.2.0 |
| 注册发现 | `hashicorp/consul/api`（**定稿退役 → K8s Service DNS**，见 TECH-RADAR §6） | v1.34.2 |
| 认证 | `casdoor/casdoor-go-sdk` | v1.46.0 |
| 支付 | `smartwalle/alipay/v3` | v3.2.29 |
| 金额 | `shopspring/decimal` | v1.4.0 |
| 配置解析 | `spf13/viper` + `mitchellh/mapstructure` | v1.21.0 / v1.5.0 |
| 可观测性 | OpenTelemetry SDK（trace / metric / log 全 OTLP-HTTP） | v1.44.0 |
| 测试 | `stretchr/testify` | v1.11.1 |
| CORS | `rs/cors` + `connectrpc.com/cors` | v1.11.1 / v0.1.0 |
| 推荐引擎 | gorse（官方 SDK 停在 v0.5.0-alpha 且无 PUT，自写 `backend/pkg/gorse`） | — |
| 进程内事件总线 | `Protocol-Lattice/GoEventBus`（仅 order 服务） | v0.2.5 |

### 2.2 网关（独立 Go 服务）

基于 **go-kratos/gateway** fork，module 名保留 `github.com/go-kratos/gateway`。

| 组件 | 版本 | 用途 |
|---|---|---|
| `go-kratos/kratos/v2` + consul registry contrib | v2.8.3 | 服务发现、配置热加载 |
| `casbin/casbin/v2` | v2.103.0 | RBAC 策略引擎 |
| `golang-jwt/jwt/v5` | v5.2.2 | JWT 验签（**必须带 60s leeway**） |
| `quic-go/quic-go` | v0.57.0 | 可选 HTTP/3 |
| `go-kratos/aegis` | v0.2.0 | BBR 自适应限流、熔断 |
| `prometheus/client_golang` | v1.21.0 | 指标暴露 |
| OTel + otelhttp | v1.44.0 | 链路 |

中间件目录（`gateway/middleware/`）：
`ip · cors · jwt · rbac · logging · tracing · bbr · circuitbreaker · rewrite · routerfilter · transcoder`

### 2.3 前端

| 类别 | 选型 | 版本 |
|---|---|---|
| 包管理 | pnpm workspace + **catalog**（版本集中管理） | pnpm **11.22.0** |
| Node | — | **^22.18.0 \|\| >=24.11.0** |
| 工具链 | **vite-plus (`vp`)** — 一体化 fmt / lint(oxlint) / test / build / dev | 0.2.9 |
| UI 框架 | React | 19.2.8 |
| 语言 | TypeScript | 7.0.2 |
| 组件库 | MUI + emotion | @mui/material 9.3.1 |
| 路由 | TanStack Router（文件路由 + autoCodeSplitting） | 1.170.30 |
| 服务端状态 | TanStack Query | 5.101.4 |
| 客户端状态 | **valtio** | 2.3.2 |
| RPC 客户端 | `@connectrpc/connect` + `connect-web` | 2.1.2 |
| 代码生成 | `@bufbuild/buf` + `protoc-gen-es` → `src/gen` | 1.72.0 / 2.14.0 |
| 环境变量 | `@t3-oss/env-core` + **zod 4** 运行时校验 | @t3-oss/env-core 0.13.11 / zod 4.4.3 |
| 登录 | `casdoor-js-sdk` / `casdoor-react-sdk` | — |
| 测试 | vitest（vite-plus test）+ Playwright browser mode + testing-library | — |
| 其他 | lucide-react · @fontsource/roboto · web-vitals · jsonc-parser · yaml · smol-toml | — |

**Apps**：`consumer:3000` · `merchant:3002` · `admin:3003` · `desktop`（Tauri 壳，套 consumer/merchant）
**Packages**（9 个）：`api`（拦截器 + 统一错误模型）· `configs` · `constants` · `i18n` · `perf`（Web Vitals 上报）· `tauri` · `tracker`（埋点 SDK）· `ui` · `utils`

### 2.4 数据与中间件

| 组件 | 用途 | 备注 |
|---|---|---|
| PostgreSQL | 主存储 | **集群内 CloudNativePG `pg-main`**（2026-08-19 起；Pigsty 已关机退役），**每服务一个 schema**，TLS `verify-full`；定稿待办：instances=2 反亲和 + Barman Cloud Plugin 异地 PITR |
| Redis 协议缓存 | 缓存 / 游标 / 分布式锁 | **Dragonfly** `dragonfly.dragonfly.svc:6379`（2026-08-20 切回，**原生 TLS 单口**，cert-manager 签发、客户端 verify CA；密码与 redis 组件同值故切换仅改 host）；redis 组件已关停留备回滚 |
| Meilisearch | search 服务（**代码迁移中**） | v1.53 已装（`search/meilisearch:7700`）；代码仍是 `go-elasticsearch/v9`——ES 已退役，address/search 因此 CrashLoop，迁移见 TODO「搜索引擎切换」 |
| MinIO | 商品图 | **上游仓库已归档（2026-02/04）**；定稿迁 SeaweedFS（4c4G 云箱兼作备份靶），新增备份流量不再写 MinIO（TECH-RADAR 10.6） |
| Consul | **仅**服务注册发现（KV 配置源已退役） | **定稿退役** → K8s Service DNS + Cilium KPR，四步迁移见 TODO |
| Casdoor | IdP（OAuth2/OIDC + JWT RS256，kid=lens） | 现经 Pangolin HTTPS（`casdoor.apikv.com`，8000 明文口已关）；**定稿收编进集群**，迁移方案见对抗第 3 轮 R3-A |
| gorse | 推荐引擎 | behavior / product 使用（留守 node2 云箱，behavior 有三级降级兜底） |
| Kafka / Strimzi / Debezium | **定稿退役**（应用侧零客户端，数据面已非可用前提） | 替代 = NATS JetStream + outbox 自写 relay + CloudEvents（TECH-RADAR §1），见第十节 |

具体主机名端口见 [`context/team/local-env.md`](context/team/local-env.md) 与 `.service-matrix.yaml` 的 `externals` 段。**凭据不进仓库。**

### 2.5 基础设施与 CI/CD

- **镜像**：多阶段 Docker，`golang:1.26.5-alpine3.24`（`ARG GO_IMAGE`，以各服务 Dockerfile 为准）；非 root（uid/gid 1000）；`CGO_ENABLED=0` 静态编译；`--mount=type=cache` 缓存 go mod 与 build
- **多架构**：`docker buildx --platform linux/amd64,linux/arm64`
- **编排**：Kubernetes + Helm（每服务一个 chart + library chart）+ VPA
- **GitOps**：ArgoCD **ApplicationSet**（list 生成器 + umbrella chart，`prune: true` / `selfHeal: true`）
- **CI**：GitHub Actions，**tag `[0-9]+.[0-9]+.[0-9]+` 触发** → test → buildx 三推（Docker Hub + ghcr.io + Harbor 私有仓）→ `helm package` 推 OCI → `yq` 改 Manifest 仓库 `targetRevision` → Argo 自动同步
- **可观测性栈**：fluent-bit → Loki（日志，**定稿替换为 Vector → VictoriaLogs**，2026-08-20 拍板，切换走 ≤72h 有界双写，见 TECH-RADAR §8）／OTel Collector → Jaeger（链路，保持）／VictoriaMetrics（指标）／Grafana（统一面板）
- **集群内开发**：Okteto（**定稿降级为特例**：uid/Secret 权限等集群身份场景）；**mirrord 定稿为默认内环**（PoC 验收单见对抗第 3 轮 R3-B，通过后生效）

---

## 三、后端分层架构（必须遵守）

Kratos template 的四层，**用 fx 装配，不是 wire**：

```
cmd/server/main.go          fx.App 组装 + 生命周期 + 优雅关闭
internal/
├── conf/v1/conf.proto      配置 schema（proto 定义，不是 Go struct）→ conf.pb.go
├── server/                 HTTP server、拦截器链、健康检查、CORS
├── service/                proto ⇄ biz 转换 + 错误码映射（唯一接触 proto 的层）
├── biz/                    领域模型（纯 struct）+ Repo 接口 + UseCase
├── data/                   实现 Repo：pgx / redis / ES / 第三方
│   ├── schema/*.sql        建表 DDL（sqlc 输入）
│   ├── queries/*.sql       业务 SQL（sqlc 输入）
│   └── models/             sqlc 生成物（禁止手改）
└── pkg/                    服务内工具：config · log · otel · registry · env · meta · dbutil · money
constants/                  服务级常量（环境变量键等）
```

### 依赖方向铁律

```
server → service → biz ← data
```

**biz 定义接口，data 实现。biz 不导入 data，也不导入任何 proto 生成代码。**
`service` 层是唯一允许 import `api/*/v1` 的层。

### fx 装配模式

每层导出一个 `Module`：

```go
// internal/biz/biz.go
var Module = fx.Module("biz", fx.Provide(NewCartUseCase))
```

`main.go` 的固定装配顺序：

```
logger.Module → config.Module → logger.FxLogger() → registry.Module
→ otel.Module → data.Module → biz.Module → service.Module
→ server.MiddlewareModule → server.Module
→ fx.Supply(appInfo) → fx.Invoke(启动钩子)
```

**四条要点**

1. `appOptions()` 必须单独拆出函数 —— 为了能用 `fx.ValidateApp` **静态校验整张依赖图**。装配错误（少 provide 了一个类型）只在 `Start` 时才炸，那时已经要连数据库了。
2. `OnStart` 里先跑 `d.CheckDatabase(ctx)` / `d.CheckCache(ctx)`，通过后才 `ListenAndServe`。
3. `OnStop` 超时 **7 秒**，顺序：Consul 注销 → `srv.Shutdown` → 关闭空闲 TCP → **OTel flush**（不 flush 会丢未导出的 span / 未落盘的日志）。
4. 启动日志必须打印**本次实际生效的配置数据源**（`config.SourceName()`）—— 否则"改了配置没生效"只能靠猜。

### 拦截器链

服务端 `[]connect.HandlerOption` 组装顺序：

1. `otelconnect`（**仅当** `observability.enable == true`）
2. 自写 `LoggingInterceptor` —— 打 `rpc.procedure` / `rpc.code` / `trace_id` / `error`
3. `validate.NewInterceptor()`（protovalidate，在 `server.go` 里 append）

外层包装：`cors.Handler` → `h2c.NewHandler`（同时吃 HTTP/1.1 与明文 HTTP/2）。

健康检查：`GET /healthz` 聚合 DB/Cache 状态，不健康返回 503。

### 三层错误处理规范

biz 定义领域错误（`[模块]` 前缀）→ data 用 `%w` 双包装保证 `errors.Is` 可穿透 → service
`switch errors.Is` 映射 connect 错误码。**代码样例与逐层规范见
[`docs/design/platform/error-handling.md`](docs/design/platform/error-handling.md)（全服务通用规范，此前本节整段抄录已删）**；
工具层的 PG 错误码映射用法见 `backend/services/inventory/internal/pkg/dbutil/README.md`。

**网关侧还有一层**：404 / 405 / 无可用节点 / 超时等**非业务错误也按 Connect 规范**返回 `{code, message, details[]}` + `X-Error-Reason` 头 + `Access-Control-Expose-Headers`（跨域下前端才读得到该头）。实现在 `gateway/errors/`。

---

## 四、契约层规则（proto）— 团队级铁律

> 规范本体：[`context/team/proto-design.md`](context/team/proto-design.md)（含约束表、反例、
> 值来源优先级）。此前本章 60% 复述其内容，已压缩——只留三条最高频踩的：

1. **写 proto 前先读设计文档**（`docs/design/<service>/` → `platform/` → `TODO.md`），设计没写清的字段问，不要猜。
2. **每个字段都要有 buf.validate 约束**；**金额禁用 `double`/`float`**（用 `int64` 分或 decimal 字符串）——这条是当前仍在违反的活约束（见第十节）。
3. **兼容性四红线**：不删字段（`reserved` 占号）、不复用字段号、不改类型、不改语义。

buf.validate 只管结构性约束；业务不变量在 biz 层、权限在网关 RBAC——**别因为加了 validate 就省掉 biz 校验**。
buf 的 lint/breaking/生成配置**直读 `backend/buf.yaml` 与 `buf.gen*.yaml`**（此前粘贴的副本已删，唯一要记的非显然项：`buf.gen.ts.yaml` 的 `exclude_paths: [internal/conf/v1]`——配置 schema 不给前端）。

## 五、数据层规则（sqlc + PostgreSQL）

### sqlc 与建表约定

`backend/sqlc.yaml` 直读即可，值得记的只有三个**非显然**选项的为什么：
`emit_pointers_for_null_types: true`（可空列 → `*string` 而非 `sql.NullString`）、
`emit_sql_as_comment: true`（生成代码带原 SQL，排查不用翻两个文件）、
`query_parameter_limit: 1`（强制命名参数结构体）。`database.uri: ${DB_URI}`，凭据走环境变量。

建表四条硬约定（完整样例看任一 `internal/data/schema/*.sql`，如 cart）：

1. **每服务一个 schema** 物理隔离（`CREATE SCHEMA cart; SET search_path`）
2. **金额用 `DECIMAL`**，跨服务身份一律 UUID，商品信息存**快照字段**不做跨库 JOIN
3. 索引显式命名 `idx_*`；upsert 依赖显式 `UNIQUE` 约束
4. **表和关键列必须有 `COMMENT`**

### 其余约定

- **跨服务只存 ID + 快照字段**，不做跨库 JOIN、不建跨 schema 外键
- 查询用命名参数 `@user_id`，配合 `-- name: XxxYyy :one|:many|:exec`
- Upsert 走 `ON CONFLICT ... DO UPDATE`（配合上面的 UNIQUE 约束）
- PG 错误码映射交给 `internal/pkg/dbutil.Handler`（`23505` 唯一冲突、`23503` 外键）
- 领域枚举在 `backend/constants/` 定义为 Go string 常量，与 PG enum 字面量**一一对应**
- 列表分页用**游标（keyset）**，不用 `OFFSET` + `COUNT`：省 count，且翻页期间不会重复/漏项（见 `docs/design/product/listing.md`）

---

## 六、配置体系（本项目最有特色的部分）

### 6.1 配置 schema 用 proto 定义

`internal/conf/v1/conf.proto` 定义 `message Bootstrap`。10 个业务服务的通用块：

```
server · data · observability · discovery · log
```

按实际消费者追加：user / search / behavior / address / merchant → `auth`；address / search →
`search`；cart → `store`（MinIO）；behavior / product → `recommend`（gorse）；payment →
`pay`（支付宝）。

字段同样带 `buf.validate` 约束：`log.level` 用 `string.in: [debug,info,...]`，`ssl_mode` 用 `in: [disable,...,verify-full]`，超时 `duration.gte = {seconds:1}`。

### 6.2 Config Center 是唯一 Bootstrap 来源

```
CONFIG_SOURCE_FILE=/path/to/source.yaml
  → SDK selector(type=config_center)
  → Config Center: {service}/{dev|pre}/bootstrap.yaml
```

selector 只保存 Config Center 地址、namespace/environment/key 与机器 token；本地文件必须
gitignore，集群通过 `ecommerce-config-source-<env>` Secret 挂载。Consul 只负责服务注册发现。

**selector 缺失、token 无效、key 不存在或 selector 不是 `config_center` 都直接启动失败。**
不存在 Consul KV 回退；`CONFIG_SOURCE=file` 仅保留给显式本地测试。

### 6.3 热更新链路（配置中心路径）

```
PutKey / DeleteKey / Rollback ── 在写入事务内 ──> pg_notify('config_changed', ns/env/key/version)
        │  （回滚不会误发；payload 只带定位信息，值由订阅方回查
        │    —— 顺带避开 8000 字节上限，也不把密钥塞进通知）
        ▼
独立 pgx 连接 LISTEN（不占连接池槽位）
  + 进程内扇出（每订阅者 cap 16 的 channel，满了丢事件不阻塞监听协程）
  + 断线重连前先 Fail() 掉全部订阅者（宁可让客户端重连重取快照，
    也不留一条"还连着但永远收不到事件"的死流）
        ▼
WatchKeys server-stream RPC（先订阅再发快照，反过来会漏掉两步之间的变更；30s 心跳）
        ▼
客户端指数退避 1s → 30s 重连
```

**读取路径必须同步改造**（只推不改等于没改 —— 原先所有消费者都在构造期拿走了 `*Bootstrap` 快照）：

- `config.Live` = `atomic.Pointer[Bootstrap]` + 订阅
- `data.PgPool` 实现 `models.DBTX` 与 `otelpgx.PoolStats` 的**壳** —— 指标注册在壳上，换池后一直有效，`Queries` 与全部调用点零改动
- `data.LiveRedis` 同理；`pkg/log` 改用 `zap.AtomicLevel`

换池策略：**Ping 通过才换池** → 旧池**延迟 30s 关闭**（立刻 Close 会掐断 in-flight 查询）→ 建池失败记 ERROR 并保留旧池。

**有意不热生效的三段**（变更时打 WARN 明确告知需重启，绝不让人以为改了就生效）：

| 段 | 原因 |
|---|---|
| `server` | 重新绑端口会切断 in-flight 连接 |
| `discovery` | 需摘节点重注册，滚动重启更可控 |
| `observability` | 重建 tracer provider 会丢未导出的 span |

**踩过的坑**：流式 RPC 会被 `http.Server.WriteTimeout`(5s) 在第一个心跳上打断 —— 表面看客户端每 30s 重连一切正常，实则一直在抖。需要 `withoutWriteTimeout` 只对流式路由清写截止时间。

---

## 七、认证鉴权（集中在网关，微服务零重复）

```
浏览器 ──Casdoor OAuth2/OIDC──▶ JWT (RS256, kid=lens)
   │
   └─ POST /svc.v1.Service/Method ──▶ 网关
          ├ ip → cors → jwt → rbac → tracing → logging → bbr → circuitbreaker
          ├ jwt : 公钥验签 + WithLeeway(60s)
          │       ← 不加会因时钟偏移导致 nbf 判定失败 → 401 → 前端退登死循环
          ├ rbac: Casbin keyMatch2 + 角色继承
          └ 注入 x-md-global-user-id / x-md-global-name 到下游
                    │
                    ▼
          discovery:///{service}-name（Consul）
```

### Casbin 模型

直读 `gateway/configs/policies/model.conf`（此前粘贴的副本已删）。要点一句话：
`keyMatch2` 匹配路径 + `g` 角色继承 + deny 优先（`!some(where p.eft == deny)`）。

### 策略编写纪律

```csv
p, consumer, /cart.v1.CartService/*, POST, allow
p, consumer, /order.v1.orderService/CreateOrder, POST, allow     # proto 里 service 名大小写敏感
p, merchant, /order.v1.orderService/CompleteOrder, POST, allow   # 履约动作不给消费者
p, consumer, /merchant.v1.MerchantService/SubmitApplication, POST, allow
p, admin,    /merchant.v1.MerchantService/ApproveApplication, POST, allow  # 否则申请人自批自
p, admin,    /inventory.v1.InventoryService/*, POST, allow       # 服务间调用，不是前端接口
p, anyone, /*, .*, deny                                          # 默认拒绝兜底

g, consumer, public
g, merchant, consumer      # 角色继承链：admin ⊃ merchant ⊃ consumer ⊃ public
g, admin, merchant
```

六条规则：

1. **默认拒绝 + 白名单**，`p, anyone, /*, .*, deny` 收底
2. 涉及**审批 / 履约 / 服务间调用**的，必须 **RPC 粒度**授权，禁止整段 `/svc.v1.*` 放行
3. 匿名路径（登录、搜索、商品详情、支付回调、埋点）必须在 `jwt` 和 `rbac` **两处 router_filter 都排除**
4. 埋点接口刻意匿名放行 —— 匿名浏览正是最该采集的时段，要求登录等于把冷启动数据全丢了
5. 但服务端仍以**网关注入的 `x-md-global-user-id` 优先于请求体的 `anon_id`**（后者客户端可伪造）
6. **service 层从 header 取身份，绝不信任请求体里的 userId**

---

## 八、前端规则

### 每个 app 的目录约定

见 [`frontend/README.md`](frontend/README.md)「app 内部的四层」（此前抄录的目录树已删）。

### 硬约定

- **版本统一走 pnpm `catalog:`**，各包 `package.json` 只写 `"catalog:"`，禁止写死版本号；内部包用 `workspace:*`
- 别名 `@` → `./src`
- transport 统一构造：

  ```ts
  const transport = createConnectTransport({
    baseUrl: env.VITE_GATEWAY_URL ?? "http://localhost:8080",
    interceptors: [authInterceptor, loggerInterceptor, errorInterceptor],
  })
  ```

- 拦截器与统一错误模型收敛在 `@ecommerce/api`：`toAppError(e) → { code, codeName, reason, message, metadata, raw }`
  - **message 保证非空** —— 空 message 会让 connect-web 整个错误体退化成"未知错误"
  - 区分 `AUTH_REASONS`（退登）与 `PERMISSION_REASONS`（仅提示，不退登）—— 无差别退登会把"无权限"误判成"未登录"
- **生成的 proto 类型不直接进 store**，`api/` 层做 RPC DTO → 领域模型映射
- **MUI 陷阱**：`sx` 的 spacing 数值会 ×8，要用字符串 token（见 [`context/project/ecommerce/consumer/experience/mui-spacing-tokens-8x.md`](context/project/ecommerce/consumer/experience/mui-spacing-tokens-8x.md)）
- 埋点用**手写 Connect unary JSON 线格式**而不是生成的 connect-web 客户端 —— `navigator.sendBeacon` 不允许设自定义头（`Connect-Protocol-Version`），而页面关闭时那一次上报带着最完整的停留时长，只有 beacon 送得出去

### 命令

```bash
pnpm dev            # vp run consumer#dev
pnpm dev:merchant   # vp run merchant#dev
pnpm ready          # vp fmt && vp lint && vp run test -r && vp run build -r
```

---

## 九、通用规则与限制（全部是指针，本章不复述）

此前本章抄录过 AGENTS.md 硬规则（且漂移到只剩五条、缺了「不可逆动作授权」这条安全关键规则）、
三层知识库判定、experience 四段式、Git 规范、事实表判据——2026-08-13 全部删除，以下真相源直读：

| 主题 | 真相源 |
|---|---|
| 硬规则（7 条）+ E3 执行策略 + 验收锚点 | [`AGENTS.md`](AGENTS.md) |
| 三层知识库判定 + experience 四段式 | [`AGENTS.md`](AGENTS.md) §知识索引 + [`context/harness-framework/self-refinement.md`](context/harness-framework/self-refinement.md) |
| Git 规范（Conventional Commits 十一类 type、vite-plus 钩子、直接提 main、分组提交） | [`context/team/git-commit.md`](context/team/git-commit.md) |
| 事实表 vs 知识的判据、`depends_on` 与 `depends_on_planned` 的区分 | [`.service-matrix.yaml`](.service-matrix.yaml) 文件头纪律段 |

## 十、设计 ≠ 现实（照抄前必读）

以下是本项目**已知的缺陷或未落地项**。新项目要么补齐，要么明确不做，别不知情地继承。

| 事项 | 现状 |
|---|---|
| **Kafka / 领域事件** | 设计写了 6 个领域事件，**应用侧无任何 Kafka 客户端**（`go.mod` 零依赖）；CDC 基础设施（Strimzi kafka-connect + Debezium PG connector）已部署但应用未消费。只有 order 服务有进程内 `GoEventBus`；behavior 用内存队列 + `synced_at IS NULL` 当 outbox 补偿。落地方案定稿在 `docs/design/order/consistency.md`（Outbox + relay），尚未开工 |
| **服务间调用** | 10 个服务的 `depends_on` 目前**全部为空**（matrix 实测；曾经的 cart→config 已随配置中心拆仓断开）。order→inventory/product/address、payment→order 等全是 `depends_on_planned` |
| **protovalidate 从不作用于配置** | `conf.proto` 的 `required = true` 形同虚设 —— 配置加载只做 mapstructure 解码，**从不调用 `protovalidate.Validate`**；mapstructure 也没开 `ErrorUnused`。结果：KV 缺块 → 不报错 → nil-safe getter → 功能被**静默关掉而不是启动失败**（gorse 就这么被静默关过，见 [`consul-kv-missing-key-silent-disable.md`](context/project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md)） |
| **buf breaking 未接 CI** | proto 破坏性变更目前**没有门禁** |
| **前端测试未接门禁** | Playwright 步骤在 workflow 里被注释掉；biome/oxlint 未全量接入 |
| **金额类型不一致** | 规范说金额禁用 double，但 `cart.proto` / biz 里 `Price` 仍是 `float64`；DB 侧是 `DECIMAL(10,2)` |
| **配置逻辑 10 份复制** | `internal/pkg/config` 在每个服务里各复制一份，尚未抽成共享包 |

### 新项目应做的修正

1. 配置解码后调用 `protovalidate.Validate(bootstrap)`，`mapstructure.DecoderConfig` 开 `ErrorUnused`
2. `buf lint` + `buf breaking` 接进 CI（低成本高收益的门禁）
3. 从第一天就把 `internal/pkg/{config,log,otel,registry,env,meta,dbutil}` 抽成 `backend/pkg/*` 共享包
4. 金额统一用 `int64`（分）或 decimal 字符串，**在 proto 层面就定死**
5. 要么真上 Kafka/NATS，要么在设计文档里明确写"当前不做事件驱动，用同步 RPC + outbox 表"
6. CI 的镜像名与服务列表跟 Makefile 的 `SERVICES` 对齐，避免两处漂移

---

## 十一、相关文档

文档导航统一看根 [`README.md`](README.md) §文档导航与文件头的分工块，本章不再维护第三份副本。
