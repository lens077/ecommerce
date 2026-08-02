# STACK.md — 技术栈与工程约束真相源

> 本文件回答两个问题：**这个项目用了什么**、**在这个项目里干活必须遵守什么**。
>
> 分工：
> - 技术选型与版本、分层规则、编码约束 → **本文件**
> - 服务拓扑事实（注册名/前缀/依赖/KV 键/端口）→ [`.service-matrix.yaml`](.service-matrix.yaml)
> - 架构设计与"为什么" → [`Design.md`](Design.md) / [`CONFIG_CENTER_DESIGN.md`](CONFIG_CENTER_DESIGN.md)
> - 实现进度 → [`TODO.md`](TODO.md)
> - AI 协作行为基线 → [`AGENTS.md`](AGENTS.md) + [`context/`](context/INDEX.md)
>
> ⚠️ 同一条事实只写一处。本文件不复制上述文件的内容，只做引用。
> 想按这套栈起一个新项目，见 [`SCAFFOLD.md`](SCAFFOLD.md)。

---

## 一、项目定位与仓库形态

**单仓（single-repo）B2B2C 电商平台**。proto 契约与业务代码同仓，前端 monorepo 与后端微服务并列，不存在多仓分支联动问题。

```
ecommerce/
├── AGENTS.md                  # AI 协作入口（硬规则 + 索引）
├── STACK.md                   # ← 本文件
├── SCAFFOLD.md                # 新项目脚手架规范（换域即用）
├── .service-matrix.yaml       # 服务拓扑事实表（AI/CI 查表用，非设计文档）
├── Design.md                  # 架构真相源
├── CONFIG_CENTER_DESIGN.md    # 配置中心域设计
├── TODO.md                    # 进度真相源（✅ / 🟡 / ⬜）
├── context/                   # 三层知识库（team / harness-framework / project）
├── backend/
│   ├── api/{service}/v1/*.proto     # 对外契约（同时生成 Go 与 TS）
│   ├── constants/                   # 跨服务共享枚举与元数据键
│   ├── pkg/                         # 跨服务共享库（gorse client / types / product-sku）
│   ├── services/{service}/          # 每服务一个独立 fx 应用
│   ├── buf.yaml · buf.gen.yaml · buf.gen.ts.yaml · sqlc.yaml · Makefile
│   └── go.mod                       # 单一 module，11 个服务共享
├── gateway/                   # go-kratos/gateway fork（独立 module，subtree 到独立仓）
├── frontend/                  # pnpm workspace（apps/* + packages/*）
├── helm/{charts,library}      # 每服务一个 chart + 一个 library chart
└── .github/workflows/         # backend.yml / frontend.yml，tag 触发 GitOps
```

**关键结构决策**

| 决策 | 取舍 |
|---|---|
| 后端 11 个服务共用**一个 go.mod** | 省掉 11 份依赖升级；靠目录 + `internal/` 强制边界 |
| proto 与实现同仓 | 契约改动一个 PR 可见全链路影响；代价是仓库大 |
| 网关是**独立 module 的 fork** | 可 `git subtree push --prefix=gateway gateway main` 推到独立仓复用 |
| 前端 4 个 app 一个 workspace | 靠 `packages/*` 复用拦截器/错误模型/UI，靠 catalog 统一版本 |

---

## 二、技术栈（含实际锁定版本）

### 2.1 后端（Go）

| 类别 | 选型 | 版本 |
|---|---|---|
| 语言 | Go | **1.26.1**（gateway 1.25.0） |
| RPC 框架 | `connectrpc.com/connect` | v1.19.2 |
| 协议 | Connect / gRPC / gRPC-Web 三兼容，HTTP/2 h2c 明文 | — |
| IDL | Protobuf + Buf CLI | protobuf v1.36.11 |
| 参数校验 | `buf.build/go/protovalidate` + `connectrpc.com/validate` 拦截器 | v1.2.0 / v0.6.0 |
| 依赖注入 | `go.uber.org/fx` | v1.24.0 |
| 日志 | `go.uber.org/zap` + `otelzap` bridge | v1.28.0 / v0.18.0 |
| DB 驱动 | `jackc/pgx/v5` + `exaring/otelpgx` | v5.9.2 / v0.10.0 |
| DB 代码生成 | **sqlc**（写 SQL → 生成类型安全 Go） | driver `pgx/v5` |
| 缓存 | `redis/go-redis/v9` | v9.21.0 |
| 搜索 | `elastic/go-elasticsearch/v9` | v9.2.0 |
| 注册发现 | `hashicorp/consul/api` | v1.34.2 |
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
| 包管理 | pnpm workspace + **catalog**（版本集中管理） | pnpm **11.6.0** |
| Node | — | **>= 22.12.0** |
| 工具链 | **vite-plus (`vp`)** — 一体化 fmt / lint(oxlint) / test / build / dev | ^0.1.24 |
| UI 框架 | React | 19.2 |
| 语言 | TypeScript | 5.9 |
| 组件库 | MUI + emotion | @mui/material 9.1 |
| 路由 | TanStack Router（文件路由 + autoCodeSplitting） | 1.170 |
| 服务端状态 | TanStack Query | 5.101 |
| 客户端状态 | **valtio** | 2.3 |
| RPC 客户端 | `@connectrpc/connect` + `connect-web` | 2.1.1 |
| 代码生成 | `@bufbuild/buf` + `protoc-gen-es` → `src/gen` | 1.70 / 2.12 |
| 环境变量 | `@t3-oss/env-core` + **zod 4** 运行时校验 | — |
| 登录 | `casdoor-js-sdk` / `casdoor-react-sdk` | — |
| 测试 | vitest（vite-plus test）+ Playwright browser mode + testing-library | — |
| 其他 | lucide-react · @fontsource/roboto · web-vitals · jsonc-parser · yaml · smol-toml | — |

**Apps**：`consumer:3000` · `merchant:3002` · `admin:3003` · `config:3005`
**Packages**：`api`（拦截器 + 统一错误模型）· `configs` · `constants` · `tracker`（埋点 SDK）· `ui` · `utils`

### 2.4 数据与中间件

| 组件 | 用途 | 备注 |
|---|---|---|
| PostgreSQL | 主存储 | **每服务一个 schema**，TLS `verify-ca` |
| Redis (Dragonfly) | 缓存 / 游标 / 分布式锁 | TLS `insecure_skip_verify` |
| Elasticsearch | search 服务 | — |
| MinIO | 商品图 | cart 使用 |
| Consul | 服务注册发现 **+ KV 配置源** | — |
| Casdoor | IdP（OAuth2/OIDC + JWT RS256，kid=lens） | — |
| gorse | 推荐引擎 | behavior / product 使用 |
| Kafka | **设计里有，代码里没有** | 见第十节 |

具体主机名端口见 [`context/team/local-env.md`](context/team/local-env.md) 与 `.service-matrix.yaml` 的 `externals` 段。**凭据不进仓库。**

### 2.5 基础设施与 CI/CD

- **镜像**：多阶段 Docker，`golang:1.26.1-alpine3.22` → `alpine:3.22`；非 root（uid/gid 1000）；`CGO_ENABLED=0` 静态编译；`--mount=type=cache` 缓存 go mod 与 build
- **多架构**：`docker buildx --platform linux/amd64,linux/arm64`
- **编排**：Kubernetes + Helm（每服务一个 chart + library chart）+ VPA
- **GitOps**：ArgoCD **ApplicationSet**（list 生成器 + umbrella chart，`prune: true` / `selfHeal: true`）
- **CI**：GitHub Actions，**tag `[0-9]+.[0-9]+.[0-9]+` 触发** → test → buildx 三推（Docker Hub + ghcr.io + Harbor 私有仓）→ `helm package` 推 OCI → `yq` 改 Manifest 仓库 `targetRevision` → Argo 自动同步
- **可观测性栈**：fluent-bit → Loki（日志）／OTel Collector → Jaeger（链路）／VictoriaMetrics（指标）／Grafana（统一面板）
- **集群内开发**：Okteto

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

```go
// ① biz 层定义领域错误，带 [模块] 前缀
var ErrUserNotFound = errors.New("[user] user not found")

// ② data 层包装：第三方/不可恢复错误用 %w；业务错误也用 %w 并列，保证 errors.Is 可穿透
return nil, fmt.Errorf("%w: casdoor get oauth token err: %w", biz.ErrAuthFailed, err)

// ③ service 层 switch errors.Is → connect 错误码
switch {
case errors.Is(err, biz.ErrUserAlreadyExists):
    return nil, connect.NewError(connect.CodeAlreadyExists, err)
case errors.Is(err, biz.ErrUserNotFound):
    return nil, connect.NewError(connect.CodeNotFound, err)
default:
    return nil, connect.NewError(connect.CodeUnknown, err)
}
```

落到日志里长这样，排查只看一行：

```
2026-05-07T07:58:52.175+0800  ERROR  LoggingInterceptor  server/logging.go:37  rpc system error
{"rpc.procedure": "/user.v1.UserService/SignIn", "rpc.code": "internal",
 "trace_id": "aed4697...", "error": "internal: [user] authentication failed: casdoor ..."}
```

**网关侧还有一层**：404 / 405 / 无可用节点 / 超时等**非业务错误也按 Connect 规范**返回 `{code, message, details[]}` + `X-Error-Reason` 头 + `Access-Control-Expose-Headers`（跨域下前端才读得到该头）。实现在 `gateway/errors/`。

---

## 四、契约层规则（proto）— 团队级铁律

> 规范本体：[`context/team/proto-design.md`](context/team/proto-design.md)。下面是执行摘要。

### 铁律一：写 proto 前必须先读设计文档

阅读优先级：`Design.md` → 域设计文档 → `TODO.md` → 同域已有 proto 与 sqlc schema。
**设计文档没写清的字段，问，不要猜。**

理由：proto 是服务边界和上下游契约。字段发布后前端 `frontend/packages/api` 和各服务生成代码都依赖它，语义搞错的代价从"改几行文档"升级到"回滚 proto + 重新生成前后端 + 处理已落库数据"。

### 铁律二：每个字段都要有 buf.validate 约束

| 类型 | 强制约束 | 不加的后果 |
|---|---|---|
| 枚举 | `enum.defined_only = true` | 未知枚举穿透成 int，`switch` 落 default 产生静默错 |
| UUID | `string.uuid = true` | — |
| 业务 ID | `min_len` + `max_len` 组合 | 只写 max_len 时空串会通过 |
| 自由文本 | 必须 `max_len`（对齐 DB 列宽） | 无上限的 string 是内存放大攻击面 |
| 分页 | 必须 `lte` 上限 | 一个字段打爆下游的最典型场景 |
| 数组 | 必须 `repeated.max_items` | 批量大小的决定权交给了调用方 |
| 数值/时间戳 | 至少约束符号 `gte = 0` | — |
| 金额 | **禁用 `double` / `float`** | 浮点精度；用 `int64` 分或 decimal 字符串 |

约束值来源优先级：**① 设计文档明写 → ② DB 列宽/类型 → ③ 同域已有 proto → ④ 业务常识与下游承受能力**。
推断不出来就问用户，**不要拍脑袋填数** —— 填错的上限比没有上限更难排查。

### 兼容性四条红线

1. **不删字段** —— 用 `reserved` 占住字段号和名字
2. **不复用字段号** —— 已删除的号永久作废
3. **不改字段类型** —— 包括 `int32 → int64` 这种"看起来兼容"的
4. **不改字段语义** —— 最危险的一条，因为编译不报错

### buf.validate 的职责边界

只管**结构性约束**（格式、长度、范围、枚举合法性）。以下不属于它，必须留在别处：

- 业务不变量（库存够不够、状态机能不能转）→ biz 层
- 复杂跨字段一致性 → biz 层（简单的可用 CEL）
- 谁能改这个字段 → 网关 RBAC

**别因为加了 validate 就省掉 biz 层校验。**

### buf 配置

```yaml
# backend/buf.yaml
version: v2
lint:
  use: [STANDARD]
  except: [FIELD_NOT_REQUIRED, PACKAGE_NO_IMPORT_CYCLE]
  disallow_comment_ignores: true
  ignore: [internal/conf]
breaking:
  use: [FILE]
  except: [EXTENSION_NO_DELETE, FIELD_SAME_DEFAULT]
```

两套生成模板：

- `buf.gen.yaml` → Go：`protoc-gen-go` + `protoc-gen-connect-go`，`opt: paths=source_relative`
- `buf.gen.ts.yaml` → TS：`protoc-gen-es`，`target=ts`，**`exclude_paths: [internal/conf/v1]`**（配置 schema 不给前端）

---

## 五、数据层规则（sqlc + PostgreSQL）

### sqlc.yaml 关键选项

```yaml
sql_package: pgx/v5
emit_prepared_queries: true            # 预编译语句
emit_interface: true                   # 生成 Querier 接口（可 mock）
emit_pointers_for_null_types: true     # 可空列 → *string，而非 sql.NullString
emit_enum_valid_method: true
emit_all_enum_values: true
emit_sql_as_comment: true              # 生成代码带原 SQL 注释，排查不用翻两个文件
json_tags_case_style: camel
query_parameter_limit: 1
overrides:
  - { db_type: timestamptz, go_type: time.Time }
  - { db_type: uuid,        go_type: github.com/google/uuid.UUID }
```

`database.uri: ${DB_URI}` —— 凭据走环境变量，不进仓库。

### 建表约定

```sql
CREATE SCHEMA IF NOT EXISTS cart;                    -- 每服务一个 schema，物理隔离
SET search_path TO cart;
CREATE TYPE cart.cart_type AS ENUM ('active','expired','deleted');

CREATE TABLE IF NOT EXISTS cart.cart_item (
    id                BIGSERIAL PRIMARY KEY,          -- 内部自增主键
    user_id           UUID           NOT NULL,        -- 跨服务身份一律 UUID
    merchant_id       UUID           NOT NULL,
    -- 商品快照（加入购物车时的信息），不做跨库 JOIN
    spu_name          VARCHAR(255)   NOT NULL,
    price             DECIMAL(10,2)  NOT NULL,        -- 金额用 DECIMAL，不用 float
    sku_attributes    JSONB          NOT NULL DEFAULT '{}',
    status            cart.cart_type NOT NULL DEFAULT 'active',
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    UNIQUE (user_id, merchant_id, sku_id)             -- 支撑 ON CONFLICT upsert
);
COMMENT ON TABLE cart.cart_item IS '购物车明细表';      -- 表和关键列必须有注释
CREATE INDEX idx_cart_user_id ON cart.cart_item (user_id);   -- 索引显式命名 idx_*
```

### 其余约定

- **跨服务只存 ID + 快照字段**，不做跨库 JOIN、不建跨 schema 外键
- 查询用命名参数 `@user_id`，配合 `-- name: XxxYyy :one|:many|:exec`
- Upsert 走 `ON CONFLICT ... DO UPDATE`（配合上面的 UNIQUE 约束）
- PG 错误码映射交给 `internal/pkg/dbutil.Handler`（`23505` 唯一冲突、`23503` 外键）
- 领域枚举在 `backend/constants/` 定义为 Go string 常量，与 PG enum 字面量**一一对应**
- 列表分页用**游标（keyset）**，不用 `OFFSET` + `COUNT`：省 count，且翻页期间不会重复/漏项（见 `Design.md` 的 `ListProducts` 设计）

---

## 六、配置体系（本项目最有特色的部分）

### 6.1 配置 schema 用 proto 定义

`internal/conf/v1/conf.proto` 定义 `message Bootstrap`。通用块（除 config 服务外都有）：

```
server · data · auth · observability · discovery · search · log
```

服务特有块：cart → `store`（MinIO）；behavior / product → `recommend`（gorse）；payment → `pay`（支付宝）。

字段同样带 `buf.validate` 约束：`log.level` 用 `string.in: [debug,info,...]`，`ssl_mode` 用 `in: [disable,...,verify-full]`，超时 `duration.gte = {seconds:1}`。

### 6.2 双配置源，**不做失败自动降级**

```
CONFIG_SOURCE=consul        → Consul KV: ecommerce/{service}/{dev|prod}.yml
CONFIG_SOURCE=configcenter  → 自建配置中心服务（Postgres 存储）
```

抽出 `Source` 接口，`source_consul.go` / `source_configcenter.go` 各自独立（删掉任一个另一个仍能编译）。

**显式二选一，拼错值直接启动失败。** 静默降级会让服务用一份已废弃的配置跑起来，比启动失败更难查。

⚠️ **Consul KV 是启动前置条件**：`ecommerce/<service>/dev.yml` 不存在服务就起不来。新增服务时第一件事是上传 KV，不是写代码。

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

```ini
[request_definition] r = sub, obj, act
[policy_definition]  p = sub, obj, act, eft
[role_definition]    g = _, _
[policy_effect] e = some(where (p.eft == allow)) && !some(where (p.eft == deny))
[matchers] m = g(r.sub, p.sub) && keyMatch2(r.obj, p.obj) && regexMatch(r.act, p.act)
```

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

```
apps/consumer/
├── src/
│   ├── routes/          TanStack 文件路由（autoCodeSplitting）
│   ├── api/{domain}/    每域一个 Connect client + RPC DTO ⇄ 领域模型映射
│   ├── gen/             buf 生成的 TS（禁止手改）
│   ├── store/           valtio 状态
│   ├── components/ hooks/ providers/ themes/ styles/
│   └── env.ts           @t3-oss/env-core + zod 校验
├── buf.gen.yaml         → out: src/gen
├── vite.config.ts       vite-plus 配置（staged / fmt / lint / test / plugins / alias）
├── Dockerfile · deploy/ · Makefile
```

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
pnpm dev:config     # vp run config#dev
pnpm ready          # vp fmt && vp lint && vp run test -r && vp run build -r
```

---

## 九、通用规则与限制

### AGENTS.md 五条硬规则（不可跳过）

1. **改代码前先读对应知识** —— 按 `context/INDEX.md` 逐层缩小范围，不要全仓 grep 猜
2. **写/改 proto 前必须先读设计文档**，并为每个字段推断出校验约束
3. **提交前先更新 `TODO.md`**，再 `git commit`
4. **不要把凭据写进仓库** —— 密码/密钥只在 Consul KV 和本地环境，仓库只写主机名和端口
5. **踩到坑要沉淀** —— 判断是「模式性教训」还是「一次性 diff」，前者写进 `context/`

### 三层知识库判定

| 层 | 判据 | 更新频率 |
|---|---|---|
| `context/team/` | 换个模块、换个服务，它依然成立 | 最低 |
| `context/harness-framework/` | 约束的是 AI 协作机制本身，不是业务 | 中 |
| `context/project/{proj}/{module}/` | 只对某一个模块成立 | 最高、量最大 |

`{module}` 用**代码目录名**（`gateway` / `behavior` / `consumer`），不是中文名也不是 proto package 名。

**experience 文件四段式（硬要求）**：

```markdown
**症状**：能观察到的现象，越具体越好（日志原文、报错文本、界面表现）
**关键陷阱**：为什么容易误判 —— 这段最值钱
**根因**：真正的原因
**修复**：改了哪个文件的什么
```

文件名用 kebab-case 的**症状**而非原因 —— 下次遇到时你先看到的是症状。

**反模式**：同一条约束写两处（口径会漂移，只写一处其余用链接）／把 `Design.md` 内容复制进 `context/`／写一次性 diff／凭据进仓库。

### Git 规范

- **Conventional Commits**：`type(scope): subject`，type ∈ `feat / fix / perf / docs / chore`，subject 中英混用
- husky + commitlint + cz-git 校验（`.husky/commit-msg`）
- **直接提交到 `main`**，不走分支 / PR（除非用户明确要求）
- **按逻辑分组提交**：前端 / 后端 / 文档分开，不要一次 `git add -A` 混在一起
- 开始新改动前，工作区已有的未提交改动**先分组提交干净**，否则新旧改动混在一个提交里无法单独回滚

### 事实表 vs 知识

`.service-matrix.yaml` 只记**结构事实**（注册名、网关前缀、依赖关系、外部依赖、KV 键、端口），不记设计理由（在 `Design.md`）也不记进度（在 `TODO.md`）。

判据：**"AI 每次都要现搜一遍的结构性事实" → 进 matrix；"需要解释为什么的经验" → 进 `context/`**。

⚠️ 严格区分 `depends_on`（代码里真的接线了）与 `depends_on_planned`（设计要求但未接线）。

---

## 十、设计 ≠ 现实（照抄前必读）

以下是本项目**已知的缺陷或未落地项**。新项目要么补齐，要么明确不做，别不知情地继承。

| 事项 | 现状 |
|---|---|
| **Kafka / 领域事件** | `Design.md` 写了 `OrderCreatedEvent` 等 6 个领域事件，**代码里一行 Kafka 都没有**。只有 order 服务有一个进程内 `GoEventBus`；behavior 用内存队列 + `synced_at IS NULL` 当 outbox 补偿。所谓"事件驱动"目前是纸面设计 |
| **服务间调用** | 11 个服务里只有 `cart → config` 真的接线了。order→inventory/product/address、payment→order、product→search 全是 `depends_on_planned` |
| **protovalidate 从不作用于配置** | `conf.proto` 的 `required = true` 形同虚设 —— 配置加载只做 mapstructure 解码，**从不调用 `protovalidate.Validate`**；mapstructure 也没开 `ErrorUnused`。结果：KV 缺块 → 不报错 → nil-safe getter → 功能被**静默关掉而不是启动失败**（gorse 就这么被静默关过，见 [`consul-kv-missing-key-silent-disable.md`](context/project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md)） |
| **buf breaking 未接 CI** | proto 破坏性变更目前**没有门禁** |
| **CI 与实际不匹配** | `.github/workflows/backend.yml` 的 `IMAGE_NAME` 还是 `connect-example-backend`，只构建单个 `SERVICE=server`，与 Makefile 里逐服务 `docker-deployx` 的实际做法不一致 |
| **前端测试未接门禁** | Playwright 步骤在 workflow 里被注释掉；biome/oxlint 未全量接入 |
| **金额类型不一致** | 规范说金额禁用 double，但 `cart.proto` / biz 里 `Price` 仍是 `float64`；DB 侧是 `DECIMAL(10,2)` |
| **配置逻辑 10 份复制** | `internal/pkg/config` 在每个服务里各复制一份，尚未抽成共享包 |
| **`backend/services/consul-kv.json` 是 0 字节空文件** | — |

### 新项目应做的修正

1. 配置解码后调用 `protovalidate.Validate(bootstrap)`，`mapstructure.DecoderConfig` 开 `ErrorUnused`
2. `buf lint` + `buf breaking` 接进 CI（低成本高收益的门禁）
3. 从第一天就把 `internal/pkg/{config,log,otel,registry,env,meta,dbutil}` 抽成 `backend/pkg/*` 共享包
4. 金额统一用 `int64`（分）或 decimal 字符串，**在 proto 层面就定死**
5. 要么真上 Kafka/NATS，要么在设计文档里明确写"当前不做事件驱动，用同步 RPC + outbox 表"
6. CI 的镜像名与服务列表跟 Makefile 的 `SERVICES` 对齐，避免两处漂移

---

## 十一、相关文档

| 文档 | 内容 |
|---|---|
| [`SCAFFOLD.md`](SCAFFOLD.md) | 按这套栈起新项目的脚手架规范（含模板与生成提示词） |
| [`AGENTS.md`](AGENTS.md) | AI 协作硬规则与知识索引 |
| [`.service-matrix.yaml`](.service-matrix.yaml) | 服务拓扑事实表 |
| [`Design.md`](Design.md) | 架构设计真相源 |
| [`CONFIG_CENTER_DESIGN.md`](CONFIG_CENTER_DESIGN.md) | 配置中心域设计 |
| [`TODO.md`](TODO.md) | 实现进度真相源 |
| [`context/INDEX.md`](context/INDEX.md) | 三层知识库导航 |
