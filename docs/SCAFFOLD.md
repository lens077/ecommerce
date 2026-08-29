# SCAFFOLD.md — 新项目脚手架规范（换个领域即可复用）

> 本文件是**可执行的项目生成规范**：把技术栈、分层约束、模板文件和落地顺序打包成一份，
> 换掉占位符就能让 AI 生成一个新项目的完整骨架。
>
> 技术选型真相源为 [docs/TECH.md](TECH.md)。现行工程事实可参考 [`STACK.md`](../STACK.md)，选型冲突以 `TECH.md` 为准。
>
> 用法：
> 1. 填好第一节的占位符表
> 2. 把第九节的「生成提示词」连同本文件一起喂给 AI
> 3. 按第三节的阶段顺序生成，每阶段过一遍验收标准再往下走

---

## 一、占位符表（开工前先填满）

| 占位符 | 含义 | 本项目的值（示例） | 你的值 |
|---|---|---|---|
| `{{PROJECT}}` | 项目/仓库名，同时是 Config Center namespace 与 npm scope | `ecommerce` | |
| `{{DOMAIN}}` | 业务领域一句话描述 | B2B2C 电商平台 | |
| `{{ORG}}` | GitHub / GitLab 组织名 | `lens077` | |
| `{{GO_MODULE}}` | 后端 Go module 路径 | `github.com/lens077/ecommerce/backend` | |
| `{{NPM_SCOPE}}` | 前端内部包 scope | `@ecommerce` | |
| `{{K8S_NAMESPACE}}` | Kubernetes 命名空间 | `ecommerce` | |
| `{{REGISTRY}}` | 主镜像仓库（如 TCR，集群直连拉取） | `ccr.ccs.tencentyun.com/example` | |
| `{{HELM_REGISTRY}}` | Helm 制品仓库（Harbor OCI） | `harbor.example.com/example` | |
| `{{IDP_URL}}` | Casdoor 地址 | — | |
| `{{OPENFGA_URL}}` | OpenFGA 地址 | — | |
| `{{CONFIG_CENTER_URL}}` | control-tower Config Center 地址 | `http://config-center:8080` | |
| `{{SERVICES}}` | 后端服务清单 | user search product order inventory cart merchant address behavior payment | |
| `{{APPS}}` | 前端 app 清单 + 端口 | consumer:3000 merchant:3002 admin:3003 desktop:—(Tauri 壳) | |
| `{{RELATIONS}}` | OpenFGA 领域关系模型摘要 | `merchant: admin/staff；store: manager/member` | |

**领域替换的最小改动面**：`{{SERVICES}}` / `{{APPS}}` / `{{RELATIONS}}` 决定业务形态，其余基础设施骨架原样复用。

---

## 二、目标仓库布局

```
{{PROJECT}}/
├── AGENTS.md                  # 模板 A（第四节）
├── STACK.md                   # 从本项目的 STACK.md 改占位符
├── docs/SCAFFOLD.md           # 本文件（供下一个项目再复用；本项目里已收纳进 docs/）
├── .service-matrix.yaml       # 模板 B（第五节）
├── docs/design/               # 架构与领域设计（按服务分目录；人写，AI 只读不猜）
├── TODO.md                    # 模板 D（第七节）
├── context/                   # 模板 C（第六节）
│   ├── INDEX.md
│   ├── team/{INDEX,runbook,git-commit,proto-design,go-testing,local-env}.md   # runbook 是可执行入口，必带
│   ├── harness-framework/{INDEX,knowledge-layering,self-refinement}.md
│   └── project/{{PROJECT}}/INDEX.md
├── backend/
│   ├── go.mod                       # 单一 module：{{GO_MODULE}}
│   ├── buf.yaml · buf.gen.yaml · buf.gen.ts.yaml · sqlc.yaml · Makefile · Dockerfile
│   ├── api/{service}/v1/*.proto
│   ├── constants/                   # 跨服务共享枚举与元数据键
│   ├── pkg/                         # ★ 跨服务共享库（本项目的教训：第一天就抽出来）
│   │   ├── gorse/  product/  types/    # 注意：config/log/otel/dbutil 等 8 个包在本项目实际住在各服务 internal/pkg/（10 份同构复制），并未做到「第一天抽到 pkg/」——新项目应真的抽出来
│   └── services/{service}/
│       ├── cmd/server/main.go
│       ├── constants/
│       ├── internal/{conf/v1, server, service, biz, data, pkg}
│       ├── configs/  deploy/{dev,prod}/  Makefile  Dockerfile  compose.yaml
├── platform/
│   └── control-tower/         # 同级仓 control-tower 的版本/路由契约指针；网关与 Config Center 不复制进业务仓
├── frontend/
│   ├── pnpm-workspace.yaml    # catalog 版本表
│   ├── package.json
│   ├── apps/{app}/            # 每 app 一个 vite-plus 工程
│   └── packages/{api,configs,constants,i18n,perf,tauri,tracker,ui,utils}
├── deploy/k8s/                # CiliumNetworkPolicy、HPA/KEDA、PDB、Argo Rollouts（P1）
└── .github/{workflows/{backend.yml,frontend.yml},renovate.json}
```

---

## 三、生成顺序（分阶段，每阶段可独立验收）

> 顺序不是建议而是依赖约束：跳过 ② 直接做 ⑥ 会得到 N 份复制粘贴的工具代码。

### 阶段 ① 骨架层

产出：`go.mod` · `buf.yaml` · `buf.gen.yaml` · `buf.gen.ts.yaml` · `sqlc.yaml` · 根 `Makefile` · `pnpm-workspace.yaml`（catalog）· 根 `package.json` · `AGENTS.md` · `STACK.md` · `.service-matrix.yaml` · `TODO.md` · `context/` 骨架 · `docs/design/` 大纲

**验收**：`buf lint` 通过（哪怕还没有 proto）；`pnpm i` 成功；`context/INDEX.md` 三层入口齐全。

### 阶段 ② 共享层（这一步做扎实，后面每个服务都是复制粘贴）

产出：
- `backend/pkg/{config,log,otel,registry,env,meta,dbutil,types}`
- `backend/constants/`
- `frontend/packages/{api,configs,constants,utils,ui}`

其中 `pkg/config` 必须包含：`Source` 接口 + Config Center SDK selector（`type=config_center`）+ `Live`（`atomic.Pointer` + 订阅）+ **解码后调用 `protovalidate.Validate`** + `mapstructure` 开 `ErrorUnused`；`pkg/registry` 暴露 `ServiceRegistry`，生产使用 K8s Service + CoreDNS，本地使用 Docker Compose 服务名。

**验收**：`go build ./...` 通过；`pkg/config` 有单测覆盖「缺必填块 → 启动失败」这一条（这是本项目最贵的教训，见 `STACK.md` 第十节）。

### 阶段 ③ 第一个竖切服务（选依赖最少的，如 user 或 cart）

顺序严格照此：

```
conf.proto → api/{svc}/v1/*.proto → buf generate
→ internal/data/migrations/*.sql（goose 注解，`make migrate-create` 取号）→ internal/data/queries/*.sql → sqlc generate
→ internal/data → internal/biz → internal/service → internal/server → cmd/server/main.go
→ Dockerfile + Makefile(dev/test/sqlc/api/docker-*) + deploy/{dev,prod} + compose.yaml
```

**验收**（缺一不可）：
- [ ] `make dev` 起得来，启动日志打印了实际生效的配置数据源
- [ ] `GET /healthz` 返回 200 且 DB/Cache 都绿
- [ ] K8s Service / Compose DNS 可解析，`GET /healthz` 通过
- [ ] 使用 HTTP/2（H2C）直连服务端口打通一个 ConnectRPC，且不存在 HTTP/1.1 降级
- [ ] 故意传一个越界参数，被 protovalidate 拦在 biz 层之前
- [ ] `fx.ValidateApp` 在测试里跑通

### 阶段 ④ 网关

产出：同级仓 control-tower 的路由与匿名清单、Casdoor Stateful Session 配置、Dragonfly Session Store、OpenFGA 关系模型、租户路由、可信身份头注入与路由超时配置；生产入口位于 Cilium Gateway API 之后。

**验收**：分别验证匿名路径 200 / 缺 Session 401 / OpenFGA 拒绝 403 / 未定义前缀 404；错误体符合 Connect 规范（带 `X-Error-Reason` 头），后端只收到网关注入的 `X-User-ID` / `X-Merchant-ID`，全链路保持 HTTP/2（H2C）。

### 阶段 ⑤ 第一个前端 app

```
buf.gen.yaml → src/gen → env.ts(zod) → api/{domain} → routes → components
```

**验收**：`前端 → 网关 → 服务` 全链路打通；`vp lint` + `vp run build` 通过；错误路径能拿到非空 message。

### 阶段 ⑥ 横向复制其余服务

每个服务重复阶段 ③，只改 `proto` / `schema` / `biz` / `data`；`server` / `pkg` 从共享层引用。
**每加一个服务，同步更新 `.service-matrix.yaml` 和 `TODO.md`。**

### 阶段 ⑦ 可观测性 + CI/CD + Kubernetes/Argo

产出：OTel SDK / Vector / VMAgent（K8s 内轻量采集）→ 外置 OTel Collector → VictoriaLogs / VictoriaMetrics / VictoriaTraces 的接入验证 · Docker Buildx 多架构 `.github/workflows/*` · Renovate · Kubernetes 清单 · CiliumNetworkPolicy default-deny · HPA / KEDA（Kafka lag scaler）· Argo Rollouts（P1）

**验收**：GitHub Actions 打一个 tag 后，通过 Docker Buildx 生成多架构镜像并推送到主镜像仓库（`{{REGISTRY}}`，如 TCR）；Helm 制品推送 `{{HELM_REGISTRY}}`（Harbor OCI）；GHCR 可选双存，是否推送由 CI 按网络决定。K8s 部署健康，default-deny 策略生效，trace 能在 VictoriaTraces（Grafana）看到跨服务链路。

---

## 四、模板 A — `AGENTS.md`

> 放仓库根。这是所有 AI 编码工具的共同行为基线，**保持简短**，规范本体在 `context/`。
> ⚠️ 本模板落后于本仓现行 `AGENTS.md` 一代（现行已 7 条硬规则 + E3 执行策略 + 验收锚点 +
> 中文文案约定 + Agent skills）——生成新项目时以**根目录真 `AGENTS.md` 为蓝本**，本模板只当骨架参考。

````markdown
# AGENTS.md — AI 协作入口

> 本文件是所有 AI 编码工具（Claude Code / Codex CLI / Cursor / Gemini CLI …）的**共同行为基线**。
> 规范本体在 `context/`，本文件只做索引和硬规则。改规范请改 `context/`，不要改这里的副本。

## 硬规则（不可跳过）

1. **改代码前先读对应知识**：按 `context/INDEX.md` 的路径逐层缩小范围，不要全仓 grep 猜。
2. **写/改 proto 前必须先读设计文档**，并为每个字段推断出校验约束。见 `context/team/proto-design.md`。
3. **提交前先更新 `TODO.md`**，再 `git commit`。见 `context/team/git-commit.md`。
4. **不要把凭据写进仓库**。密码/密钥只存在配置中心和本地环境，仓库里只写主机名和端口。
5. **踩到坑要沉淀**：判断是「模式性教训」还是「一次性 diff」，前者写进 `context/`。见 `context/harness-framework/self-refinement.md`。

## 知识索引

| 层 | 路径 | 范围 |
|---|---|---|
| 团队级 | `context/team/` | 所有工作都要遵循（最稳定） |
| 框架工程级 | `context/harness-framework/` | AI 协作机制本身（中频更新） |
| 服务级 | `context/project/{{PROJECT}}/{module}/` | 特定模块（高频演进、量最大） |

完整导航见 **[context/INDEX.md](../context/INDEX.md)**。

**查服务拓扑不要现搜**：服务注册名、网关前缀、依赖关系、外部依赖、配置键，
一律查 **[.service-matrix.yaml](../.service-matrix.yaml)**。里面区分了 `depends_on`（已接线）
和 `depends_on_planned`（设计要求但未接线），不要把后者当成已实现。

**查技术选型与分层约束**：技术选型见 **[docs/TECH.md](../docs/TECH.md)**，现行工程约束见 **[STACK.md](../STACK.md)**。不要从代码里反推约定；两者冲突时以 `docs/TECH.md` 为准。

## 项目速览

- 领域：{{DOMAIN}}
- 后端：Go + ConnectRPC 微服务（`backend/services/`），Fx 装配，proto 契约在 `backend/api/`；网关由同级仓 control-tower 承载
- 前端：pnpm workspace（`frontend/apps/*` + `frontend/packages/`），React + TanStack Router / Query + 本地状态库 **Zustand** + Connect Query ES / Connect Web / Protobuf-ES，使用 vite-plus（`vp`）构建
- 配置：`CONFIG_SOURCE_FILE` 指向 Config Center SDK selector（`type=config_center`），key 为 `{service}/{env}/bootstrap.yaml`
- 鉴权：Casdoor Stateful Session + Dragonfly Session Store + OpenFGA 关系授权，不保留 JWT 双轨
- 进度真相源：`TODO.md`；架构真相源：`docs/design/`；技术选型真相源：`docs/TECH.md`
````

---

## 五、模板 B — `.service-matrix.yaml`

> 放仓库根。**只记结构事实**，不记设计理由（那在 `docs/design/`）也不记进度（那在 `TODO.md`）。
> 判据：凡是「AI 每次都要现搜一遍的结构性事实」，都应该在这里查表拿到。

````yaml
# .service-matrix.yaml — 服务拓扑真相源
#
# 作用：让 AI 和 CI 不再靠搜设计文档猜服务关系、路径和配置键。
#
# ⚠️ 纪律：
#   1. 本文件只记录**结构事实**，不记录设计理由（docs/design/）也不记录进度（TODO.md）
#   2. depends_on = 代码里真的接线了；depends_on_planned = 设计要求但尚未接线。不要混
#   3. 必需配置键**不在本文件重复** —— 由各服务 internal/conf/v1/conf.proto 的
#      (buf.validate.field).required 声明，重复会漂移。见 config_validation 段
#   4. 不写凭据

version: 1

layout:
  mode: single-repo
  backend_service: "backend/services/{service}"
  backend_proto: "backend/api/{service}/v1"
  service_conf: "backend/services/{service}/internal/conf/v1/conf.proto"
  frontend_app: "frontend/apps/{app}"
  frontend_package: "frontend/packages/{pkg}"
  gateway: "../control-tower/services/gateway"

conventions:
  config_center_key: "{service}/{env}/bootstrap.yaml" # env: dev | prod
  config_source_file: "CONFIG_SOURCE_FILE"             # 指向 type=config_center 的 SDK selector
  config_center_url: "{{CONFIG_CENTER_URL}}"
  service_registry: "K8s Service + CoreDNS（生产）/ Docker Compose 服务名（本地）"
  transport: "ConnectRPC over HTTP/2 (H2C)，严禁降级 HTTP/1.1"
  # 各服务通用的配置块：
  common_config_blocks: [server, data, auth, observability, discovery, log]

config_validation:
  declared_in: "backend/services/{service}/internal/conf/v1/conf.proto → message Bootstrap"
  enforced_by: "backend/pkg/config 解码后调用 protovalidate.Validate(bootstrap)"
  # ↑ 新项目必须真的实现这一行。只声明不执行的话，KV 缺块会让功能被静默关掉
  #   而不是启动失败 —— 这是最难查的一类故障。
  decoder: "mapstructure，必须开启 ErrorUnused（多余键要报错）"

# ── 外部基础设施（不是本仓的服务）────────────────────────────────────
externals:
  postgres: { host: "<pigsty-pgbouncer-host>", note: "Pigsty / Patroni HA；TLS 模式写这里，凭据不写；UUIDv7 主键" }
  dragonfly_session: { host: "<host:port>", note: "noeviction + 持久化" }
  dragonfly_cache: { host: "<host:port>", note: "allkeys-lru，与 Session/限流实例隔离" }
  dragonfly_ratelimit: { host: "<host:port>", note: "独立限流实例" }
  config_center: { host: "{{CONFIG_CENTER_URL}}" }
  casdoor: { host: "{{IDP_URL}}", note: "Stateful Session 身份源" }
  openfga: { host: "{{OPENFGA_URL}}", note: "关系授权真相源" }
  kafka: { host: "<brokers>", note: "外部非 K8s 集群；partition key=aggregate_id" }
  elasticsearch: { host: "<host>", note: "只读投影，隐藏于 SearchCatalog 接口" }
  silo: { host: "<s3-endpoint>", note: "基于 MinIO 的 S3 兼容对象存储；使用预签名 URL" }
  # 按需增删：支付渠道 / 推荐引擎 …

# ── 网关 ────────────────────────────────────────────────────────────
gateway:
  path: "../control-tower/services/gateway"
  upstream: "Cilium Gateway API"
  transport: "ConnectRPC over HTTP/2 (H2C)"
  session:
    provider: casdoor
    store: dragonfly_session
  authorization:
    provider: openfga
    relations: "{{RELATIONS}}"
  trusted_identity_headers: [X-User-ID, X-Merchant-ID]
  tenant_routing: true
  route_timeout: required
  # 匿名路径只在网关路由匿名清单声明；不保留旧式双轨鉴权。
  anonymous_paths:
    - /<svc>.v1.<Svc>Service/SignIn
    - # …回调 / 公开查询 / 埋点

# ── 后端服务 ─────────────────────────────────────────────────────────
# discovery: K8s Service / Compose DNS 服务名（≠ 目录名，网关 target 用它）
# extra_config: 通用块之外的配置块
services:
  <service-a>:
    discovery: <service-a>-service
    gateway_prefix: /<service-a>*
    extra_config: []
    depends_on: []              # 代码里真的接线了
    depends_on_planned: []      # 设计要求但未接线
    external: [postgres]
    note: ""

  # …按 {{SERVICES}} 逐个补全

# ── 前端 ─────────────────────────────────────────────────────────────
frontend:
  workspace: "frontend" # pnpm workspace + vite-plus
  apps:
    <app-a>: { port: 3000, module_key: <app-a> }
    # …按 {{APPS}} 补全；⚠️ 若 app 名与后端服务名重名，module_key 加后缀区分
  packages: [api, configs, constants, ui, utils]
  transport: "Connect Query ES / Connect Web / Protobuf-ES → VITE_GATEWAY_URL（默认 http://localhost:8080）"

# ── 已知缺口（详情以 TODO.md 为准，本段只列影响拓扑的）─────────────────
known_gaps: []
````

---

## 六、模板 C — `context/` 三层知识库骨架

### `context/INDEX.md`

````markdown
# context/ — 知识库索引

三层知识体系。AI 按 **团队 → 框架 → 项目 → 模块** 的路径逐层缩小范围，不需要遍历全仓。
每一层都有 `INDEX.md` 作为入口。

```
context/
├── team/                       团队级（最稳定）—— 所有工作必须遵循
├── harness-framework/          框架工程级（中频）—— AI 协作机制本身
└── project/{{PROJECT}}/        服务级（高频、量最大）—— 各模块的架构与踩坑
```

## 团队级 · context/team/

| 文件 | 一句话 |
|---|---|
| git-commit.md | Conventional Commits + 提交前必须先更新 TODO.md |
| proto-design.md | 写 proto 前先读设计文档，每个字段都要有 buf.validate 约束 |
| local-env.md | 本地集群地址约定（只写主机名端口，不写凭据） |

## 框架工程级 · context/harness-framework/

| 文件 | 一句话 |
|---|---|
| knowledge-layering.md | 一条知识该写进哪一层的判定规则 |
| self-refinement.md | 纠错 → 判断模式性 → 沉淀 → 下次复用的闭环 |

## 服务级 · context/project/{{PROJECT}}/

按模块分目录，每个模块下的 `experience/` 放踩坑记录。

## 结构真相源 · `.service-matrix.yaml`（仓库根）

判据：**AI 每次都要现搜一遍的结构性事实** → 进 matrix；
**需要解释「为什么」的经验** → 进 `context/`。

## 检索约定

- **不要全仓 grep 找规范**。先看本文件 → 进对应层的 `INDEX.md` → 再进具体文件。
- **不要全仓 grep 找服务拓扑**。查 `.service-matrix.yaml`。
- **不要从代码反推技术约定**。技术选型查 `docs/TECH.md`，现行工程事实查 `STACK.md`；冲突时以 `docs/TECH.md` 为准。
- 找模块知识时路径是 `context/project/{{PROJECT}}/{module}/`，`{module}` 用**代码目录名**。
- 找不到对应知识 ≠ 没有约束。先读 `docs/design/` / `TODO.md`，读完把结论沉淀回来。
````

### `context/harness-framework/knowledge-layering.md`（判定规则，原样复用）

````markdown
---
name: knowledge-layering
layer: harness-framework
description: 一条知识该写进 team / harness-framework / project 哪一层的判定规则
---

# 知识分层规则

| 层 | 路径 | 判据 | 更新频率 |
|---|---|---|---|
| 团队级 | `context/team/` | **换个模块、换个服务，它依然成立** | 最低 |
| 框架工程级 | `context/harness-framework/` | 约束的是 **AI 协作机制本身**，不是业务 | 中 |
| 服务级 | `context/project/{{PROJECT}}/{module}/` | 只对**某一个模块**成立 | 最高、量最大 |

## 判定流程

```
新知识
  │
  ├─ 它约束的是「知识怎么组织 / 错误怎么沉淀」？
  │     └─ 是 → context/harness-framework/
  │
  ├─ 换个服务它还成立吗？
  │     ├─ 成立 → context/team/
  │     └─ 不成立 → context/project/{{PROJECT}}/{module}/
  │                   ├─ 是踩过的坑 / 事故复盘 → experience/
  │                   ├─ 是稳定的架构说明     → architecture.md
  │                   └─ 是可重复的操作步骤   → sop/
  │
  └─ 它是一次性的调试细节吗？（某次的临时端口、某个已删分支）
        └─ 是 → 不要写。这类内容会污染知识库
```

## experience 文件的写法

一个坑一个文件，文件名是 kebab-case 的**症状**（不是原因），因为下次遇到时你先看到的是症状。

必须包含四段：

```markdown
**症状**：能观察到的现象，越具体越好（日志原文、报错文本、界面表现）
**关键陷阱**：为什么容易误判 —— 这段最值钱
**根因**：真正的原因
**修复**：改了哪个文件的什么
```

有「关键陷阱」这一段是硬要求。踩坑之所以是坑，往往不是因为难，
而是因为**第一直觉会指向错误的方向**。

## 反模式

- ❌ 同一条约束写两处 —— 口径会漂移。只写一处，另一处用链接指过去
- ❌ 把 docs/design/ / STACK.md 的内容复制进 context/
- ❌ 写「一次性 diff」
- ❌ 凭据进仓库
````

### `context/harness-framework/self-refinement.md`（闭环，原样复用）

````markdown
---
name: self-refinement
layer: harness-framework
description: 用户纠错后，判断是模式性教训还是一次性 diff，前者沉淀进 context/ 形成闭环
---

# Self-Refinement —— 让纠错变成资产

LLM 没有跨会话记忆。但**每一次用户纠正，都是一个信号**：说明 AI 的默认行为和本项目的真实约束之间有偏差。

## 闭环

```
① 用户纠正了 AI 的某个做法
        ↓
② 判断：这是「模式性教训」还是「一次性 diff」？
        ↓ （模式性）
③ 按 knowledge-layering.md 判定该写哪一层
        ↓
④ 主动向用户提议沉淀，得到确认后写入 context/
        ↓
⑤ 下次同类场景，AI 从 context/ 读到并主动引用
```

第 ④ 步的**「主动提议」**很关键。AI 不应该等用户说"记一下"才记。

## 模式性 vs 一次性 —— 怎么判

**自检**：如果这条知识只能写成「把 X 改成 Y」，那是一次性 diff；
如果能写成「凡是遇到 A 场景，就要 B」，那是模式性教训。

## 沉淀纪律

1. 先查重 —— 已有文件覆盖了就更新它，不要新建重复的
2. 写清楚 Why —— 只写「要这么做」，遇到边界情况时无法判断能否变通
3. 记下关键陷阱 —— 尤其是「第一直觉会指向哪个错误方向」
4. 发现旧知识是错的就删掉 —— 过期的知识比没有知识更危险
5. 不写凭据

## 已知的失效模式

- **知识库膨胀**：什么都沉淀 → 检索成本上升 → 没人看 → 等于没有
- **口径漂移**：同一约束在两处、逐渐分叉
- **文档腐化**：沉淀的知识要引用**稳定的东西**（约束、原理），少引用**易变的东西**（行号、数值）
````

### `context/team/` 三份

- `git-commit.md` — Conventional Commits + **提交前先更新 TODO.md** + 分组提交 + 分支策略
- `proto-design.md` — 两条铁律 + 按类型的约束清单 + 兼容性红线 + validate 边界（内容见 `STACK.md` 第四节，展开写成规范）
- `local-env.md` — 本地集群主机名端口 + 「配置源是启动前置条件」+ **不写凭据**

---

## 七、模板 D — `TODO.md` 骨架

````markdown
# 项目实现进度与待办

> 依据 `docs/design/` 的架构设计，对照当前代码实现整理。
> 图例：✅ 已完成　🟡 部分完成（有核心能力，仍有缺口）　⬜ 未开始

---

## 一、实现进度对照

### 1. 基础设施与工程化

| 项目 | 状态 | 说明 |
|------|------|------|
| 容器化（Docker） | ⬜ | |
| Kubernetes 编排 | ⬜ | |
| GitOps（ArgoCD） | ⬜ | |
| CI/CD（GitHub Actions） | ⬜ | |
| K8s Service / Compose DNS + Config Center | ⬜ | |
| 提交规范（vite-plus hooks + commitlint） | ⬜ | |
| proto 门禁（buf lint + breaking 接 CI） | ⬜ | |

### 2. 后端微服务

| 服务 | 状态 | 已实现 RPC | 主要缺口 |
|------|------|-----------|----------|
| | ⬜ | | |

### 3. 网关、Session 与关系授权

| 项目 | 状态 | 说明 |
|------|------|------|
| control-tower 网关（Session 校验/OpenFGA/租户路由/可信身份头/超时） | ⬜ | |
| OpenFGA 关系模型（{{RELATIONS}}） | ⬜ | |
| Casdoor Stateful Session + Dragonfly Session Store | ⬜ | |

### 4. 前端

| App | 状态 | 说明 |
|-----|------|------|
| | ⬜ | |

---

## 二、近期待办

- [ ]

---

## 三、已知缺陷

> 「设计写了但代码没做」的差距记在这里，别让它只活在某次对话里。

- [ ]
````

---

## 八、模板 E — 关键配置文件骨架

### `backend/buf.yaml`

```yaml
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

### `backend/buf.gen.yaml`（Go）

```yaml
version: v2
managed:
  enabled: true
  disable:
    - { file_option: go_package, module: buf.build/bufbuild/protovalidate }
    - { file_option: go_package_prefix, module: buf.build/googleapis/googleapis }
plugins:
  - { local: protoc-gen-go,         out: ., opt: paths=source_relative }
  - { local: protoc-gen-connect-go, out: ., opt: paths=source_relative }
```

### `backend/buf.gen.ts.yaml`（TypeScript）

```yaml
version: v2
managed:
  enabled: true
  disable:
    - { module: buf.build/googleapis/googleapis, file_option: go_package_prefix }
    - { file_option: go_package, module: buf.build/bufbuild/protovalidate }
plugins:
  - local: protoc-gen-es
    out: .
    include_imports: true
    opt: target=ts
inputs:
  - directory: .
    exclude_paths:
      - internal/conf/v1     # 配置 schema 不给前端
```

### `backend/sqlc.yaml`

```yaml
version: "2"
sql:
  - schema: "internal/data/migrations"   # goose 迁移目录同时是 sqlc 的 schema 输入
    queries: "internal/data/queries"
    engine: "postgresql"
    database: { uri: ${DB_URI} }        # 凭据走环境变量，不进仓库
    gen:
      go:
        package: "models"
        out: "internal/data/models"
        sql_package: "pgx/v5"
        emit_prepared_queries: true
        emit_interface: true            # 生成 Querier，可 mock
        emit_pointers_for_null_types: true
        emit_enum_valid_method: true
        emit_all_enum_values: true
        emit_sql_as_comment: true
        json_tags_case_style: camel
        query_parameter_limit: 1
        overrides:
          - { db_type: "timestamptz", go_type: "time.Time" }
          - { db_type: "uuid",        go_type: "github.com/google/uuid.UUID" }
```

### 服务 `Dockerfile`（多阶段 + 缓存挂载 + 非 root）

```dockerfile
ARG GO_IMAGE=golang:1.26.5-alpine3.24
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS compile
ARG TARGETOS=linux
ARG TARGETARCH
ARG SERVICE
ARG VERSION=dev
ARG GOPROXY=https://goproxy.cn,direct
ARG CGOENABLED=0
WORKDIR /build
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download -x
COPY services/${SERVICE}/ ./services/${SERVICE}/
COPY api/ ./api/
COPY constants/ ./constants/
COPY pkg/ ./pkg/
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    GOOS=$TARGETOS GOARCH=$TARGETARCH CGO_ENABLED=$CGOENABLED \
    go build -ldflags="-s -w -X main.Version=$VERSION" \
    -o /app/service ./services/${SERVICE}/cmd/server && chmod +x /app/service

FROM alpine:3.22 AS final
RUN apk add --no-cache libc6-compat
RUN addgroup -g 1000 appuser && adduser -u 1000 -G appuser -D appuser
WORKDIR /app
COPY --from=compile --chown=appuser:appuser /app/service /app/
USER appuser
ENTRYPOINT ["/app/service"]
```

### 服务 `Makefile`（每服务一份）

```makefile
VERSION ?= dev
SERVICE = $(shell basename $$PWD)
CONFIG_CENTER_URL ?= {{CONFIG_CENTER_URL}}

.PHONY: dev
dev:
	SERVICE_NAME="$(SERVICE)-service" \
	CONFIG_SOURCE_FILE="$(PWD)/configs/source.dev.yaml" \
	CONFIG_CENTER_URL=$(CONFIG_CENTER_URL) \
	CONFIG_CENTER_KEY="$(SERVICE)/dev/bootstrap.yaml" \
	go run cmd/server/main.go

.PHONY: test
test:
	go test -short -coverprofile=coverage.out ./...

.PHONY: sqlc
sqlc:
	sqlc generate

.PHONY: api
api:
	buf generate --template buf.gen.yaml
	buf generate --template buf.gen.ts.yaml

.PHONY: k8s-dev
k8s-dev:
	kubectl apply -f deploy/dev
```

### 根 `Makefile`（对所有服务扇出）

```makefile
VERSION ?= dev
SERVICES ?= {{SERVICES}}

.PHONY: docker-deployx-all
docker-deployx-all:
	@for s in $(SERVICES); do \
	  $(MAKE) -C services/$$s docker-deployx VERSION=$(VERSION) || exit 1; \
	done

.PHONY: test
test:
	go test -short -coverprofile=coverage.out ./...

.PHONY: api
api:
	buf generate --template buf.gen.yaml
	buf generate --template buf.gen.ts.yaml
```

### `frontend/pnpm-workspace.yaml`（catalog 统一版本）

```yaml
packages:
  - apps/*
  - packages/*
catalogMode: prefer
catalog:
  "@bufbuild/buf": ^1.70.0
  "@bufbuild/protobuf": ^2.12.0
  "@bufbuild/protobuf-es": ^2.12.0
  "@bufbuild/protoc-gen-es": ^2.12.0
  "@connectrpc/connect": ^2.1.1
  "@connectrpc/connect-query": ^2.1.1
  "@connectrpc/connect-web": ^2.1.1
  "@mui/material": ^9.1.1
  "@mui/icons-material": ^9.1.1
  "@emotion/react": ^11.14.0
  "@emotion/styled": ^11.14.1
  "@tanstack/react-query": ^5.101.0
  "@tanstack/react-router": ^1.170.15
  "@tanstack/router-plugin": ^1.168.18
  "@t3-oss/env-core": ^0.13.11
  react: ^19.2.7
  react-dom: ^19.2.7
  typescript: ^5.9.3
  zustand: ^5.0.0
  zod: ^4.4.3
  vite-plus: ^0.2.9
  vite: npm:@voidzero-dev/vite-plus-core@latest
  vitest: npm:@voidzero-dev/vite-plus-test@latest
onlyBuiltDependencies: ["@bufbuild/buf", "@swc/core", esbuild]
```

### `platform/openfga/model.fga`（关系授权骨架）

```fga
model
  schema 1.1

type user

type merchant
  relations
    define admin: [user]
    define staff: [user]

type resource
  relations
    define parent: [merchant]
    define owner: [user]
    define can_view: owner or admin from parent or staff from parent
    define can_edit: owner or admin from parent
```

关系按 `{{RELATIONS}}` 和领域设计扩展。默认拒绝由 OpenFGA 未建立关系时的 `DENY` 保证；匿名路径只在 control-tower 路由匿名清单声明。

---

## 九、生成提示词（连同本文件一起喂给 AI）

```
按 SCAFFOLD.md 生成 {{PROJECT}}（{{DOMAIN}}）的项目骨架，技术选型严格对齐 docs/TECH.md；STACK.md 仅用于核实现行工程事实。

【后端】Go 1.26 单 go.mod 多服务（module {{GO_MODULE}}）；
  ConnectRPC(connectrpc.com/connect) + Buf(protovalidate) + uber/fx 依赖注入
  + sqlc(pgx/v5) + goose + zap + OpenTelemetry 全链路；服务间及网关到后端统一
  ConnectRPC over HTTP/2（H2C），严禁降级 HTTP/1.1。四层架构 server/service/biz/data，
  依赖方向 server→service→biz←data，biz 定义 Repo 接口且不导入 proto 与 data，
  service 是唯一 import proto 的层。
【网关】使用同级仓 control-tower，位于 Cilium Gateway API 之后；Casdoor Stateful Session
  + Dragonfly Session Store + OpenFGA 关系授权，集中处理 Session 校验、租户路由、
  X-User-ID / X-Merchant-ID 可信身份头注入与超时；完全废弃 JWT，不允许双轨，
  不生成 Casbin RBAC、BBR、协议转码、重写或旧 go-kratos 中间件。
【前端】pnpm workspace + catalog；vite-plus（vp）+ React + TypeScript + MUI
  + TanStack Router（文件路由）+ TanStack Query + 本地 UI 状态库 Zustand
  + Connect Query ES + Connect Web + Protobuf-ES + zod 环境变量校验；内部包 scope {{NPM_SCOPE}}；
  桌面端使用 Tauri，Consumer 端 Next.js SSR 仅标记为评估中。
【数据】PostgreSQL（外部 Pigsty / Patroni HA + PgBouncer；UUIDv7 主键；每服务独立 schema；
  跨服务身份用 UUID；金额用 DECIMAL；时间用 TIMESTAMPTZ；PG ENUM；索引显式命名 idx_*；
  表与关键列必须有 COMMENT；跨服务只存 ID+快照，不做跨库 JOIN；列表分页用游标）
  + Dragonfly 分实例（Session noeviction / Cache allkeys-lru / 限流独立）
  + Elasticsearch 只读投影（隐藏于 SearchCatalog 接口）
  + Silo（基于 MinIO，S3 兼容，使用预签名 URL）。
【事件】Apache Kafka 外部非 K8s 集群 + Transactional Outbox / Relay / Inbox + DLQ；
  partition key=aggregate_id，事件使用 Protobuf。
【配置】proto 定义 Bootstrap schema；CONFIG_SOURCE_FILE 指向 Config Center SDK selector
  （type=config_center），key 为 `{service}/{env}/bootstrap.yaml`；解码后必须调用
  protovalidate.Validate，mapstructure 必须开 ErrorUnused；配置层抽象 ServiceRegistry，
  生产使用 K8s Service + CoreDNS，本地使用 Docker Compose 服务名。
【可观测性】OTel SDK / Vector / VMAgent（K8s 内轻量采集）→ 外置 OTel Collector
  → VictoriaLogs / VictoriaMetrics / VictoriaTraces，通过 Grafana 查询。
【部署】多阶段 Docker（alpine + 非 root uid 1000 + CGO_ENABLED=0 + cache mount）
  + Docker Buildx 多架构 + GitHub Actions + Renovate；制品分工：{{REGISTRY}}（主镜像仓库，
  如 TCR）+ {{HELM_REGISTRY}}（Harbor，Helm OCI 制品）+ GHCR 可选双存（CI 按网络决定）；
  K8s + CiliumNetworkPolicy default-deny + HPA / KEDA（Kafka lag scaler）+ Argo Rollouts（P1）。

必须遵守的硬规则：
1. 每个 proto 字段都要有 buf.validate 约束：枚举 defined_only、UUID 用 string.uuid、
   自由文本必须 max_len、分页必须 lte 上限、repeated 必须 max_items、
   金额禁用 double/float（用 int64 分或 decimal 字符串）。
   约束值来源优先级：设计文档 > DB 列宽 > 同域 proto > 业务常识；推不出来就问，不要拍脑袋填数。
2. proto 兼容性四红线：不删字段(用 reserved)、不复用字段号、不改类型、不改语义。
3. 错误三层：biz 定义 var Err*（带 [模块] 前缀）→ data 用 %w 包装
   → service switch errors.Is 映射 connect 错误码。网关侧非业务错误也按 Connect 规范返回。
4. 身份只从网关注入的 `X-User-ID` / `X-Merchant-ID` 取，永不信任请求体里的 userId/merchantId。
5. OpenFGA 关系授权默认拒绝；匿名路径只在网关路由的匿名清单声明；完全废弃 JWT，禁止保留双轨鉴权。
6. 不把凭据写进仓库，只写主机名和端口。
7. fx 装配必须把 appOptions() 拆成独立函数以便 fx.ValidateApp 静态校验；
   OnStart 先做 DB/Cache 健康检查再监听；OnStop 7s 内完成 Shutdown/OTel flush。
8. 共享工具（config/log/otel/registry/env/meta/dbutil）从第一天就放 backend/pkg/，
   不要在每个服务里复制。
9. 事件写入采用 Transactional Outbox，Relay 收到 Kafka `acks=all` 后才标记 published；
   消费端使用 Inbox 幂等，失败进入 DLQ，同一聚合以 aggregate_id 分区。
10. 测试必须包含 k6 容量基线、Playwright E2E、gopter 属性测试和状态机测试；
    后端保留 go build / go vet / go test 门禁。

必须生成的治理文件：
- AGENTS.md（模板 A）
- .service-matrix.yaml（模板 B），区分 depends_on 与 depends_on_planned
- context/ 三层知识库骨架（模板 C）
- TODO.md（模板 D）
- docs/TECH.md（技术选型真相源）+ STACK.md（现行工程事实与约束）

工作方式：
先只输出「服务划分 + 各服务 Bootstrap 配置块 + .service-matrix.yaml + 分阶段落地顺序」，
我确认后再按 SCAFFOLD.md 第三节的阶段顺序逐个竖切实现，每阶段跑一遍验收清单。
不要一次性把所有服务都写出来。
```

---

## 十、总验收清单

复制到新项目的 `TODO.md` 里逐条勾。

**治理**
- [ ] `AGENTS.md` 五条硬规则齐全，且指向 `context/` 而非复制内容
- [ ] `.service-matrix.yaml` 覆盖全部服务，`depends_on` / `depends_on_planned` 分清
- [ ] `context/` 三层 INDEX 齐全，`experience/` 模板四段式写明
- [ ] `docs/TECH.md` 与 `STACK.md` 中面向新项目的占位符全部替换，没有残留 `{{ }}`
- [ ] 全仓 grep 不到密码/密钥；`Session Token` 等术语仅出现在安全设计说明，不出现真实凭据

**契约**
- [ ] `buf lint` 通过，`buf breaking` **已接进 CI**
- [ ] 随机抽 3 个 proto 字段，都能说出约束值的来源依据
- [ ] 金额字段没有一个是 `double` / `float`

**后端**
- [ ] `go build ./...` + `go vet ./...` 全绿
- [ ] `fx.ValidateApp` 在测试里跑通
- [ ] 有一条单测覆盖「配置缺必填块 → 启动失败」（不是静默降级）
- [ ] `biz` 包的 import 里没有 `api/` 和 `data`
- [ ] `/healthz` 在 DB 挂掉时返回 503

**网关**
- [ ] control-tower 位于 Cilium Gateway API 之后，网关到后端保持 ConnectRPC over HTTP/2（H2C），无 HTTP/1.1 降级
- [ ] Casdoor Stateful Session 存入独立 Dragonfly Session 实例，Session Store 不可用时 fail-closed
- [ ] OpenFGA 关系授权默认拒绝，匿名路径只在网关路由匿名清单声明
- [ ] 客户端伪造的身份头被剥离，后端只收到网关注入的 `X-User-ID` / `X-Merchant-ID`
- [ ] 全仓不存在 JWT/Casbin 双轨、BBR、转码或重写中间件
- [ ] 404 / 超时等非业务错误的响应体符合 Connect 规范且 message 非空

**前端**
- [ ] `package.json` 里没有写死的第三方版本号（全走 `catalog:`）
- [ ] `vp fmt && vp lint && vp run test -r && vp run build -r` 全绿
- [ ] 生成的 proto 类型没有直接进 store

**测试与交付**
- [ ] `go build ./...`、`go vet ./...`、`go test -short ./...` 全绿
- [ ] k6 固定数据集容量基线、Playwright E2E、gopter 属性测试与状态机测试通过
- [ ] GitHub Actions 使用 Docker Buildx 构建多架构镜像并推送主镜像仓库（如 TCR）；Helm 制品推 Harbor（OCI）；GHCR 可选双存由 CI 决定；Renovate 已启用
- [ ] K8s CiliumNetworkPolicy default-deny 生效；在线服务由 HPA、Kafka 消费者由 KEDA lag scaler 扩缩容
- [ ] Argo Rollouts 灰度发布作为 P1 验收项登记
- [ ] VictoriaTraces（Grafana）里能看到一条跨越前端 → 网关 → 服务 → DB 的完整链路
