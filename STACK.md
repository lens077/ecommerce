# STACK.md — 技术栈与工程约束真相源

> 本文件回答两个问题：**这个项目用了什么**、**在这个项目里干活必须遵守什么**。
>
> 分工：
> - **技术架构、技术选型与基础设施的定稿 → [`docs/TECH.md`](docs/TECH.md)**（2026-08-28 起为最高真相源，与本文件冲突处以它为准）
> - 版本锁定、分层规则、编码约束与「现状边界」→ **本文件**
> - 服务拓扑事实（注册名/前缀/依赖/Config Center 键/端口）→ [`.service-matrix.yaml`](.service-matrix.yaml)
> - 业务架构与「为什么」→ [`docs/design/`](docs/design/README.md)；网关/配置面设计 → 同级仓 `../control-tower/docs/design/`
> - 实现进度 → [`TODO.md`](TODO.md)
> - AI 协作行为基线 → [`AGENTS.md`](AGENTS.md) + [`context/`](context/INDEX.md)
>
> ⚠️ 同一条事实只写一处。本文件不复制上述文件的内容，只做引用。
> 想按这套栈起一个新项目，见 [`docs/SCAFFOLD.md`](docs/SCAFFOLD.md)。
> 百万/千万级生产化目标与证据门禁见 [`docs/design/platform/production-scale-goal.md`](docs/design/platform/production-scale-goal.md)；目标态不得冒充当前能力。

---

## 一、项目定位、业务边界与仓库形态

这是一个**正在实现中的 B2B2C 多商家电商平台**，不是已经完成生产验收的全功能商城。业务代码以本仓为主，网关与配置控制面位于同级仓 `control-tower`，因此仓库形态是「业务单仓 + 平台控制面外置」的 hybrid，而不是纯 single-repo。

### 1.1 当前终端与领域边界

| 终端或领域 | 当前事实 | 不应宣称的能力 |
|---|---|---|
| 消费者端 `consumer` | React 应用已存在，商品、购物车、地址等路径部分接线 | 下单、库存、支付链路仍有阻断项，尚不是可上线交易闭环 |
| 商家端 `merchant` | React 应用与登录壳已存在，后端 merchant 仅少量 RPC 可用 | 完整店铺运营、商品管理、履约和结算后台 |
| 管理端 `admin` | React 应用与通用登录能力已存在 | 完整平台运营、审核、仲裁和审计后台 |
| 桌面端 `desktop` | Tauri 壳，复用 consumer 或 merchant 页面 | 独立业务前端 |
| 物流履约 | 存量由 order 域的 `OrderReadyForFulfillment` 触发；目标按 [`docs/TECH.md`](docs/TECH.md) §5.8 建独立 Fulfillment 限界上下文（`FulfillmentProvider` 抽象外部物流） | 已建成的独立履约服务或物流端 |
| 库存 | 有 inventory 服务，但核心 RPC 当前不可用 | WMS、仓库作业端、多仓调拨和库内流程 |

实际后端为 10 个业务服务：`user / search / behavior / product / cart / address / order / inventory / merchant / payment`。目标限界上下文按 [`docs/TECH.md`](docs/TECH.md) §5 为 **Identity / Catalog / Cart / Order / Payment / Inventory / Fulfillment / Notification**（另有 search-projection、analytics 等编舞消费者）；存量 10 服务是迁移起点（user+merchant→Identity、product→Catalog 等映射）。当前尚不存在独立的 fulfillment、notification、settlement、marketing 或 analytics 服务；在 TECH.md 已定边界之外新增服务，仍须先用 ADR 证明独立伸缩或故障域的必要性。

### 1.2 容量结论

**当前不能宣称「已承受百万到千万级数据量」或「支持 100 万 DAU / 5 万 QPS」。** PostgreSQL 能保存多少行，不等于整条交易链已经完成容量验证；原性能目标已因没有绑定压测环境而删除。

恢复规模承诺前，至少要同时给出以下证据：

1. **数据口径**：用户、SPU/SKU、订单、库存流水、行为事件分别是总量、日增量还是保留期内总量。
2. **流量模型**：读写比、峰值 QPS/TPS、并发连接、热点 SKU、请求体大小和大促放大系数。
3. **存储方案**：大表分区与归档、索引膨胀、备份/PITR、Elasticsearch 索引容量与全量重建策略（存量 Meilisearch 迁移期同口径），以及 Kafka topic/partition/保留/回放策略（存量 JetStream 迁移期同口径）。
4. **可复现压测**：以 k6 脚本、固定数据集、固定资源配额和 P50/P95/P99/错误率/资源曲线为准，不以组件宣传值推断。
5. **可靠性目标**：按核心链路定义 SLO、错误预算、RTO/RPO，并完成节点故障、依赖故障、恢复与积压重放演练。

### 1.3 完整 B2B2C 仍缺少的能力

下列是**业务能力清单，不是微服务清单**。归属按 [`docs/TECH.md`](docs/TECH.md) §5 的限界上下文规划（其中 Fulfillment 与 Notification 已定为独立目标域）；清单内其余能力优先放入对应领域模块，只有独立伸缩、团队边界或故障域成立时才拆服务。

| 能力组 | 主要缺口 |
|---|---|
| 交易正确性 | 统一报价 token、订单组、库存全组原子预占/确认/释放、支付 capture/refund 双轴、幂等、对账与补偿 |
| 商家经营 | 店铺资料、商品/价格/运费模板、订单履约、售后、结算单、佣金、经营报表、子账号与审计 |
| 平台运营 | 商家审核、类目/品牌治理、争议仲裁、风控、操作审计、平台配置与数据级管理员授权 |
| 物流与仓储集成 | 承运商 adapter、电子面单、轨迹、退货物流；WMS 的库位、波次、拣配、盘点、调拨属于外部/后续边界，当前 inventory 不具备 |
| 营销与内容 | 优惠券、满减、秒杀、会员/积分、评价/UGC、富文本消毒；是否独立成域取决于真实需求 |
| 财务与合规 | 商家分账、发票/税务、退款对账、审计留痕、隐私删除/导出、数据保留策略 |
| 通知与客服 | 邮件/短信/站内信/企业 IM adapter、模板、重试、退订、客服工单；当前无统一通知中心 |
| 数据与分析 | 事件 schema 治理、数仓/BI、经营指标、数据质量与回溯；当前 behavior/Gorse 不是通用分析平台 |
| 安全与韧性 | 默认拒绝网络策略、workload identity、对象级授权、防滥用、供应链签名、备份/PITR、灾备与容量演练 |

### 1.4 仓库布局

```text
ecommerce/
├── AGENTS.md                  # AI 协作入口（硬规则 + 索引）
├── STACK.md                   # 技术栈、边界与工程工具真相源
├── .service-matrix.yaml       # 服务拓扑事实表
├── TODO.md                    # 实现进度真相源
├── context/                   # 团队、框架、项目知识库
├── docs/design/               # 业务与平台设计
├── backend/
│   ├── api/{service}/v1/*.proto     # API 契约，生成 Go 与 TypeScript
│   ├── pkg/ · constants/ · tools/  # 共享库、常量、relay/indexer/migration 工具
│   ├── services/{service}/          # 10 个独立 fx 应用
│   └── go.mod                       # 10 个服务共享一个 Go module
├── frontend/                  # pnpm workspace：4 app + 9 package
├── helm/                      # 待重建的部署描述；当前不是集群真相源
└── .github/workflows/         # tag 驱动的 CI 与镜像发布

../control-tower/              # 单 Go module：gateway + config + config web
../kubernetes/                 # Cilium/Gateway API 等集群安装与组件清单
```

**关键结构决策**

| 决策 | 取舍 |
|---|---|
| 后端 10 个服务共用一个 `go.mod` | 统一依赖版本；靠目录与 `internal/` 约束边界 |
| API proto 与业务实现同仓 | 一次变更可检查 Go/TypeScript 全链路；必须用 Buf breaking 守兼容性 |
| gateway/config 迁入 `control-tower` | 平台能力独立发布；本仓必须同步其 SDK 与路由模板版本 |
| 前端 4 个 app 共用 pnpm workspace | 共享 transport、错误模型、UI、i18n、埋点与性能采集；catalog 统一版本 |
| 当前部署以裸 manifest 为准 | ArgoCD 当前零 Application/ApplicationSet；`helm/` 不能冒充运行时真相源 |

---

## 二、技术栈（含实际锁定版本）

> **选型真相源（2026-08-28 起）**：技术架构、技术选型与基础设施以 [`docs/TECH.md`](docs/TECH.md) 为准；
> 2026-08-20 三轮对抗评审的定稿记录见 [`docs/TECH-RADAR.md`](docs/TECH-RADAR.md)，过程证据见
> [`docs/技术栈选型对抗/`](docs/技术栈选型对抗/)，其中与 TECH.md 冲突的结论（搜索、链路存储、
> 对象存储迁移方向、Casbin、Kafka 部署形态等）已被 TECH.md 覆盖。
> 版本以当前 manifest 与 lockfile 为准；运行状态以 [`TODO.md`](TODO.md) 和
> [`.service-matrix.yaml`](.service-matrix.yaml) 为准。下文统一使用「在用」「部分落地」
> 「已选型」三种状态；**已选型不等于已部署，集群里存在对象也不等于业务已接线**。

### 2.1 后端（Go）

| 类别 | 选型 | 锁定版本或状态 |
|---|---|---|
| 语言 | Go | **1.26.5**（backend 与 control-tower 同版） |
| RPC 框架 | `connectrpc.com/connect` | v1.20.0 |
| 传输 | Connect、gRPC、gRPC-Web 兼容；服务间与网关-后端统一 ConnectRPC over HTTP/2（H2C） | 按 [`docs/TECH.md`](docs/TECH.md) 红线**严禁降级 HTTP/1.1**；存量 h2c 端仍能受理 HTTP/1.1，仅限本地调试，不得作为服务间通道 |
| IDL | Protobuf 3 + Buf CLI | `google.golang.org/protobuf` v1.36.12 |
| 参数校验 | Protovalidate + `connectrpc.com/validate` 拦截器 | v1.3.0 / v0.6.0 |
| 依赖注入 | `go.uber.org/fx` | v1.24.0 |
| 日志 | `go.uber.org/zap` + `otelzap` bridge | v1.28.0 / v0.20.0 |
| DB 驱动 | `jackc/pgx/v5` + `exaring/otelpgx` | v5.10.0 / v0.11.1 |
| SQL 与迁移 | sqlc + goose | pgx/v5 driver / goose v3.27.3 |
| Redis 协议客户端 | `redis/go-redis/v9` + `redisotel-native` | v9.22.0 / v9.21.0 |
| 搜索客户端 | `meilisearch-go` | v0.36.3；存量。搜索存储按 [`docs/TECH.md`](docs/TECH.md) 定稿为 Elasticsearch（`SearchCatalog` 接口后的只读投影），客户端待迁 |
| 消息客户端 | `nats.go` | v1.53.1；存量迁移期。事件主干按 [`docs/TECH.md`](docs/TECH.md) 定稿为 Apache Kafka（外部非 K8s 集群），NATS 验收后退役 |
| 注册发现 | `hashicorp/consul/api` | v1.34.4；存量。按 [`docs/TECH.md`](docs/TECH.md) §10.2 定稿：生产 K8s Service + CoreDNS、pre 半生产测试走 Docker Compose 服务名（开发内环评估中），配置层抽象 `ServiceRegistry` 接口 |
| 配置 SDK | `github.com/lens077/control-tower/sdk/configsource` | control-tower v0.1.0 |
| 支付 | `smartwalle/alipay/v3` | v3.2.29 |
| 金额 | `shopspring/decimal` | v1.4.0；新 proto 优先 `int64` 分或 decimal 字符串 |
| 配置解析 | Viper + mapstructure | v1.21.0 / v1.5.0；未知字段拒绝 + 解码后校验 |
| 可观测性 | OpenTelemetry SDK，trace/metric/log 走 OTLP-HTTP | SDK v1.45.0，log v0.21.0 |
| 测试 | `stretchr/testify` | v1.11.1 |
| CORS | `rs/cors` + `connectrpc.com/cors` | v1.11.1 / v0.1.0 |
| 推荐引擎 | Gorse，自写 `backend/pkg/gorse` client | 外部服务，非进程内库 |
| 进程内事件 | `Protocol-Lattice/GoEventBus` | v0.2.5；仅 order 存量路径，不是跨服务消息总线 |

### 2.2 边缘网关与配置控制面（control-tower）

同级仓 `../control-tower` 是单 Go module、三个独立部署单元：

| 部署单元 | 角色 | 当前状态 |
|---|---|---|
| `services/gateway` | Connect 原生反向代理、BFF 会话、认证、Casbin 授权、路由与服务发现 | 已切流，运行在 `ecommerce` namespace |
| `services/config` | 配置 API、Watch、审计与 selector 鉴权 | 已切流；集群对象仍保留 `config-center` 旧名称 |
| `web` | 配置中心管理界面 | 已部署，独立于业务前端 workspace |

集群入口的主链路如下：

```text
Client
→ [公网暴露时可先经过 Pangolin / Traefik / newt]
→ Cilium Gateway API（TLS listener）
→ control-tower gateway（HTTP/1.1 + h2c）
→ recover → otelhttp → access log → CORS
→ 剥离所有入站 x-md-global-* 身份头
→ 路由与匿名清单
→ BFF session 或迁移期 legacy bearer JWT
→ Casbin（roles × Connect procedure）
→ 注入可信身份头 + 路由级总超时
→ Consul Watch + 健康过滤 + P2C 选点
→ h2c Transport
→ 后端 Connect 服务
```

以上为现状链路。按 [`docs/TECH.md`](docs/TECH.md) 的目标形态，其中四项属待迁移存量：网关-后端统一 H2C（不再受理 HTTP/1.1 服务间流量）、legacy bearer JWT 轨按「单一身份真相」红线移除（绝不允许双重鉴权路径长期并存）、Casbin 由 OpenFGA 关系授权（Check API）取代、Consul 选点迁 K8s Service + CoreDNS。

鉴权主路径已经从「浏览器持有 JWT」演进为 **BFF + 服务端 session**（与 TECH.md 的 Casdoor 有状态 Session 模型一致）：浏览器使用 httpOnly cookie，Tauri 使用 session header，token 与角色只保存在 gateway 侧 Dragonfly；legacy bearer JWT 兼容轨是迁移残留，按 TECH.md 红线属须移除项。后端只接收网关注入的 `x-md-global-*` 身份，不解析浏览器凭据。

网关从 Config Center Watch 路由、JWT 公钥、Casbin model/policy、撤销名单等键，采用原子替换、last-known-good 和指数退避。业务服务从各自 `<service>/<env>/bootstrap.yaml` 拉取完整 Bootstrap；Consul KV 已退役且无回退。

**当前明确没有的能力**：旧 go-kratos fork 的 BBR 限流、熔断、HTTP/3、协议转码和重写中间件均已删除；默认不重试、也不缓存请求体。当前可称为「治理」的只有认证授权、路由、超时、健康节点选择和可观测性。若要加限流、熔断、灰度或重试，必须先定义失败语义、幂等边界和压测验收，不能写成现有能力。

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
| 客户端状态 | **Zustand**（现用） | 本地 UI 状态定稿 Zustand；2026-08-28 完成 valtio→zustand 全量迁移（3 个 store 改为 vanilla store + 模块级 action，valtio 依赖已移除）。见 [`docs/TECH.md`](docs/TECH.md) §11.1 |
| RPC 客户端 | `@connectrpc/connect` + `connect-web` | 2.1.2 |
| 代码生成 | `@bufbuild/buf` + `protoc-gen-es` → `src/gen` | 1.72.0 / 2.14.0 |
| 环境变量 | `@t3-oss/env-core` + **zod 4** 运行时校验 | @t3-oss/env-core 0.13.11 / zod 4.4.3 |
| 登录 | control-tower BFF：Web 用 httpOnly cookie，Tauri 用 session header，`/auth/me` 为登录态真相源；Casdoor SDK 仍有迁移残留 | — |
| 桌面壳 | Tauri + Rust（edition 2021）+ opener/http/store/notification plugins | Tauri 2 |
| 测试 | vitest（vite-plus test）+ Playwright browser mode + testing-library | — |
| 其他 | lucide-react · @fontsource/roboto · web-vitals · jsonc-parser · yaml · smol-toml | — |

SSR：按 [`docs/TECH.md`](docs/TECH.md) §11.2，Consumer 端优先评估迁 Next.js（首屏与 SEO），Merchant/Admin 保持 Vite SPA，两者共享 API 契约。

**Apps**：`consumer:3000` · `merchant:3002` · `admin:3003` · `desktop`（Tauri 壳，套 consumer/merchant）
**Packages**（9 个）：`api`（拦截器 + 统一错误模型）· `configs` · `constants` · `i18n` · `perf`（Web Vitals 上报）· `tauri` · `tracker`（埋点 SDK）· `ui` · `utils`

### 2.4 数据、搜索、对象存储与事件流

| 组件 | 当前用途 | 状态与边界 |
|---|---|---|
| PostgreSQL / Pigsty | 10 个服务的核心数据，每服务一个 schema | 已切到 node3 Pigsty；客户端 TLS `verify-ca`。按 [`docs/TECH.md`](docs/TECH.md) 定稿：PostgreSQL 由外部 Pigsty 承载（Patroni 自动 Failover + PgBouncer 连接池，UUIDv7 为默认主键）；集群内 CNPG `pg-main` 已 hibernate，仅为存量资源，不再是回切候选 |
| Dragonfly | 业务可丢缓存；control-tower BFF session | Redis 协议、TLS-only。业务域不得把库存真相、锁、幂等键或唯一正确性状态放进去；BFF session 是已接受的例外，丢失时 fail-closed 并要求重新登录。按 [`docs/TECH.md`](docs/TECH.md) 目标分实例强制隔离：Session 实例 `noeviction`+持久化 / 业务 Cache 实例 `allkeys-lru` / 限流实例独立，严禁混用 |
| Meilisearch | 商品搜索投影（存量） | v1.53，读路径已迁移；CE 单节点无分片/HA。按 [`docs/TECH.md`](docs/TECH.md)，搜索存储定稿为 Elasticsearch（只读 Projection，隐藏于 `SearchCatalog` 接口后，支持从 PG 全量重建），Meilisearch 为迁移期实现 |
| S3 兼容对象存储 | cart 的商品图等对象 | 当前指向 Silo 的 MinIO-compatible API；不是「集群内 MinIO」。按 [`docs/TECH.md`](docs/TECH.md) 定稿对象存储即 Silo（基于 MinIO，开启 Versioning 与 Lifecycle，前端上传统一走后端签发的预签名 URL）；此前的 SeaweedFS 迁移方向已撤销 |
| NATS JetStream | 存量领域事件链与商品搜索事件流（迁移期） | dev 3 server；可重建 `ECOMMERCE_EVENTS` 当前为 R1，relay/indexer 已运行。按 [`docs/TECH.md`](docs/TECH.md)，事件主干定稿为 Kafka，NATS 在 Kafka 链验收后退役，不再承接新领域事件 |
| Apache Kafka | 定稿目标事件主干（[`docs/TECH.md`](docs/TECH.md)） | 部署于非 K8s 独立集群；Outbox+Relay（`acks=all` 后标 `published`）+ Inbox 幂等 + DLQ；Topic 按限界上下文划分、partition key=`aggregate_id`；事件用 Protobuf + Buf Schema Registry。当前本仓业务接线仍为零，迁移按 [生产目标路线](docs/design/platform/production-scale-goal.md) 推进 |
| PostgreSQL outbox | 事务事件待发布表 | 业务写与 outbox 同 transaction，relay 收到 JetStream PubAck 后才标记 published；consumer 必须 Inbox 幂等 |
| 分析 CDC | 需求触发的独立数据链 | 当前未接线；只在真实 ClickHouse/报表需求成立后评估逻辑复制/connector，不能替代领域事件 |
| Consul | 服务注册发现（存量迁移期） | KV 配置已退役；仍在网关选点与服务注册热路径。按 [`docs/TECH.md`](docs/TECH.md) §10.2 定稿迁 K8s Service + CoreDNS（Cilium KPR），开发环境走 Docker Compose 服务名 |
| Casdoor | OAuth2/OIDC 身份提供方 | control-tower 以机密客户端完成 code 交换；浏览器不再持有 token |
| Gorse | 推荐引擎 | behavior/product 的外部依赖，使用独立 PostgreSQL/Redis；API key 配置仍有待办 |
| Elasticsearch | 定稿搜索存储（[`docs/TECH.md`](docs/TECH.md)） | 2026-08-28 重新定稿：作为只读 Projection 隐藏于 `SearchCatalog` 接口后，由 Catalog 域事件驱动更新，支持从 PG 全量重建。回归理由：当年退役主因是节点内存预算不足（单节点 1.5Gi 堆 vs 6.5G 节点）而非能力不足，资源条件现已满足，且聚合分析缺口需要 ES 级能力。此前（2026-08-21）曾退役，当前无部署，待按新契约重建；存量查询路径仍在 Meilisearch |

具体端点见 [`.service-matrix.yaml`](.service-matrix.yaml) 的 `externals` 段。凭据只进入 Config Center、Vault 与 Kubernetes Secret，**不进入仓库**。

### 2.5 边缘网络与安全边界

| 层 | 在用能力 | 仍缺少或不能过度宣称的能力 |
|---|---|---|
| Cilium | CNI、kube-proxy replacement、LoadBalancer/IPAM、Gateway API 数据面 | 本仓没有覆盖 10 个业务服务的 CiliumNetworkPolicy；只有少量工具 workload 的标准 NetworkPolicy，不能宣称已完成默认拒绝 |
| Gateway API | Cilium `Gateway`、`HTTPRoute`/`TLSRoute`，部分 listener 终止 TLS | 公网资源可能先经过 Pangolin/Traefik/newt；仍有 HTTP 路由迁移项，所以「所有 TLS 都只在 Cilium 终止」不准确 |
| 证书 | cert-manager 签发服务证书；CA 分发逐步使用 trust-manager | 覆盖面仍需按 workload 验收，不能只看 Certificate Ready |
| Secret | Config Center selector Secret；ESO 从 Vault 下发 OTLP 等 Secret | OpenBao/SOPS 是选型方向，不应把文档定稿写成现网事实 |
| 业务服务身份 | 网关剥离伪造头后注入 `x-md-global-*`，后端据此识别用户 | 后端不验 session/JWT，也没有完整 east-west mTLS/workload identity；网络隔离不完整时「只信任网关」只是设计假设 |
| 授权 | gateway Casbin 做 RPC 粒度 RBAC（存量） | 商家数据级 `merchant_id` 隔离、子账号和对象级权限未完成。按 [`docs/TECH.md`](docs/TECH.md) §8 定稿：OpenFGA 关系授权（网关 Check API，merchant/store/order 关系模型），Casbin 为待替换存量 |
| 服务网格 | 不使用 | 限流、熔断、重试和灰度没有由网格兜底，必须在 gateway、应用或 K8s 层显式设计 |

### 2.6 构建、制品与部署

| 环节 | 工具 | 当前事实 |
|---|---|---|
| 容器构建 | Docker 多阶段构建 + BuildKit cache | Go 服务 `CGO_ENABLED=0`，非 root 运行 |
| 多架构 | Docker Buildx + QEMU | 发布 `linux/amd64,linux/arm64` |
| 制品仓库 | TCR（主，镜像）+ Harbor（Helm 制品）+ GHCR（可选双存） | 按 [`docs/TECH.md`](docs/TECH.md) §7.1：TCR 为主镜像仓库（集群同区直连拉取），Harbor 存储 Helm 制品（OCI），GHCR 可同时存镜像与 Helm 制品、是否推送由 CI 按网络情况决定；现状 GitHub Actions 双推 TCR/GHCR，`X.Y.Z` 与 `sha-<7>` 双 tag，禁用 `latest`，与定稿一致 |
| Helm Chart OCI | Helm + Harbor | `helm/helper.sh` 可登录并推送 `oci://harbor.apikv.com/sumery`；Harbor 即定稿的 Helm 制品仓库，纳入 CI 发布链待办 |
| Kubernetes 清单 | `backend/services/*/deploy/` + `application-vpa.yml` | 当前运行部署路径；根清单已覆盖 15 个 ecommerce VPA，全部为 `Off`/`RequestsOnly` recommendation-only |
| Helm | umbrella chart + service/library chart | 描述不完整且版本落后，缺 control-tower gateway、outbox relay、search indexer，不是现网真相源 |
| ArgoCD | GitOps 控制器 | 控制器在运行，但当前零 Application/ApplicationSet；没有自动同步、自愈或 prune |
| 弹性与发布策略 | VPA recommender `1.7.1` + KEDA/Argo Rollouts 控制器 | VPA 已发布但仍在至少 7 天观测和 k6 校准期；无 live ScaledObject 或 canary。证据与下一步见 [`docs/reports/2026-08-29-vpa-recommendation-only.md`](docs/reports/2026-08-29-vpa-recommendation-only.md) |
| CI | GitHub Actions + GitLab context gate | 质量门禁按 PR/push 运行；镜像发布由裸 semver tag `X.Y.Z` 触发，push main 不构建发布制品 |

### 2.7 可观测性与告警

当前观测数据面已外移 node3，不再是「集群内 Loki + Jaeger + VictoriaMetrics」：

```text
Go OTel SDK --OTLP/HTTP + Bearer--> Pangolin --> node3 OTel Collector
  ├── metrics --> VictoriaMetrics
  ├── logs ----> VictoriaLogs
  └── traces --> VictoriaTraces
Kubernetes Vector DaemonSet -----------------------> VictoriaLogs
Grafana -------------------------------------------> VM / VL / VT
vmalert --> Alertmanager
```

按 [`docs/TECH.md`](docs/TECH.md) §9 的目标管道，业务集群内只保留轻量采集器（Vector DaemonSet 采日志、VMAgent 抓指标、OTel SDK 出 trace），三类数据统一经**外置 OTel Collector** 中继（Tail-based 采样：错误/高延迟 100% 保留、正常流量 1%~5%；PII 脱敏；`/healthz`、`/metrics` 噪声清洗；动态批处理与重打标）后分流 VictoriaLogs / VictoriaMetrics / VictoriaTraces。现状与之的差距：Vector 直推 VictoriaLogs、指标未经 VMAgent 统一抓取、尾采样管道未建，均为待对齐项。

- Go 服务以 OTel SDK 输出 trace、metric、log；前端 `@ecommerce/perf` 与 `tracker` 上报 Web Vitals、长任务、接口耗时和行为事件。
- Vector 是当前容器日志采集器；fluent-bit、Loki、集群内 Jaeger/VM/Grafana/OTel Collector 已删除或退役。
- Grafana、vmalert 与 Alertmanager 在用，但 Alertmanager 当前 receiver 仍未形成可靠的飞书/企业微信/ntfy 外部闭环；Gatus/Healthchecks 也不能替代告警通知验收。
- 指标标签禁止用户、订单、SKU 等高基数字段；这些信息进入结构化日志并通过 trace id 关联。

### 2.8 围绕技术栈的工程工具

| 目的 | 工具与入口 | 状态 |
|---|---|---|
| Workspace 与前端任务 | pnpm workspace/catalog + vite-plus（`vp`） | 在用；`vp` 统一 dev/build/test/lint/fmt/staged，不使用 Husky/Biome/ESLint/Prettier |
| API 契约与代码生成 | Protobuf 3、Buf CLI、`protoc-gen-go`、`protoc-gen-connect-go`、Protobuf-ES | 在用；同一 proto 生成 Go 与 TypeScript，`buf breaking` 已进 CI |
| 事件工程 | PostgreSQL outbox、Apache Kafka（定稿主干，[`docs/TECH.md`](docs/TECH.md)）、Protobuf/Buf、CloudEvents、Toxiproxy；存量 NATS JetStream + nats bench（迁移期） | outbox relay 与搜索 indexer 已在 NATS 链运行；Kafka 业务接线为零。Product/Order 事务内 producer、consumer Inbox、DLQ、重放审计、积压 SLO 和故障演练仍未闭环 |
| 输入校验 | buf.validate + Protovalidate | 在用；API 字段约束、Bootstrap 解码校验与未知字段拒绝均已接线 |
| 数据访问 | sqlc + pgx | 在用；手写 SQL，生成类型安全模型与查询 |
| Schema 迁移 | goose + `backend/tools/dbmigrate` | 在用；按服务 schema 管理版本，不由服务启动时偷偷迁移 |
| 后端质量 | `go build`、`go vet`、`go test -short`、race、testify、fx.ValidateApp | 在用；测试分层规则见 `docs/TESTING.md` 与 `context/team/go-testing.md` |
| 集成测试辅助 | 受控 PostgreSQL 测试库、miniredis、mockery 生成物 | 数据层验证必须运行真实 PostgreSQL 语义；当前各服务覆盖不完整，禁止用 pgxmock/go-sqlmock 冒充真实数据层验证 |
| 前端质量 | oxlint、oxfmt、Vitest、Playwright browser mode、Testing Library | 在用程度不一；统一入口 `cd frontend && pnpm ready`，端到端覆盖仍不完整 |
| Git 门禁 | vite-plus hooks + commitlint | 在用；仓库级 `core.hooksPath` 指向 `frontend/.vite-hooks/_` |
| 结构门禁 | `backend/structcheck` | 在用；核对服务矩阵、目录、部署清单、网关路由和 Config Center 契约 |
| 文档门禁 | `scripts/verify-context.sh` + canary | 在用；校验链接、索引、格式、文档预算与门禁自测 |
| 快速验收 | `scripts/verify-quick.sh` | 在用；并行后端 build/vet 与前端 ready，成功只输出摘要 |
| 本地/集群开发 | Make、mirrord（mirror）、Okteto、Docker Compose | 在用；按 [`docs/TECH.md`](docs/TECH.md) §10.2 定稿分工（2026-08-28 PoC）：日常默认 `make dev` 直连；**观察用 mirrord mirror**（集群 DNS/出站/入站镜像，steal 在本集群不可用不启用）；**接管用 Okteto**；Docker Compose 定位为 pre 半生产环境测试。多人按请求接管为待触发评估（Telepresence personal intercept / mirrord Teams，见 TECH.md B 表）。证据：`docs/reports/2026-08-28-mirrord-poc.md` |
| 容量与故障验证 | k6、故障演练脚本 | 目标工具；当前没有可复现的百万/千万级容量验收报告 |
| 供应链加固 | Trivy、Cosign/Syft、Gitleaks、Kyverno | 规划或局部评估，不能写成已完成发布门禁 |

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
├── data/                   实现 Repo：pgx / cache / search / event / object / 第三方
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

**网关侧还有一层**：404 / 405 / 无可用节点 / 超时等**非业务错误也按 Connect 规范**返回 `{code, message, details[]}` + `X-Error-Reason` 头 + `Access-Control-Expose-Headers`（跨域下前端才读得到该头）。实现在 `../control-tower/internal/gwerrors/`。

---

## 四、契约层规则（proto）— 团队级铁律

> 规范本体：[`context/team/proto-design.md`](context/team/proto-design.md)（含约束表、反例、
> 值来源优先级）。此前本章 60% 复述其内容，已压缩——只留三条最高频踩的：

1. **写 proto 前先读设计文档**（`docs/design/<service>/` → `platform/` → `TODO.md`），设计没写清的字段问，不要猜。
2. **每个字段都要有 buf.validate 约束**；**金额禁用 `double`/`float`**，统一使用 `int64` 分或 decimal 字符串。
3. **兼容性四红线**：不删字段（`reserved` 占号）、不复用字段号、不改类型、不改语义。

buf.validate 只管结构性约束；业务不变量在 biz 层，入口角色权限在 gateway，数据归属在领域/Repository 层——**别因为加了 validate 或 RBAC 就省掉 owner 校验**。
buf 的 lint/breaking/生成配置**直读 `backend/buf.yaml` 与 `buf.gen*.yaml`**（此前粘贴的副本已删，唯一要记的非显然项：`buf.gen.ts.yaml` 的 `exclude_paths: [internal/conf/v1]`——配置 schema 不给前端）。

## 五、数据层规则（sqlc + PostgreSQL）

### sqlc 与建表约定

`backend/sqlc.yaml` 直读即可，值得记的只有三个**非显然**选项的为什么：
`emit_pointers_for_null_types: true`（可空列 → `*string` 而非 `sql.NullString`）、
`emit_sql_as_comment: true`（生成代码带原 SQL，排查不用翻两个文件）、
`query_parameter_limit: 1`（强制命名参数结构体）。`database.uri: ${DB_URI}`，凭据走环境变量。

建表走版本化迁移：`internal/data/migrations/*.sql`（goose 注解，2026-08-21 起；
`make migrate-up/-create`，工具与 baseline 流程见 `backend/tools/dbmigrate/README.md`）。
四条硬约定（完整样例看任一服务的 `internal/data/migrations/00001_*.sql`，如 cart）：

1. **每服务一个 schema** 物理隔离（`CREATE SCHEMA cart;` 且对象显式限定；
   **迁移里禁写 `SET search_path`**——goose 版本表按非限定名解析会被它带偏）
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
`search`；cart → `store`（S3 兼容对象存储）；behavior / product → `recommend`（Gorse）；
payment → `pay`（支付宝）。

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

## 七、认证、会话与授权边界

### 7.1 当前凭据模型

```text
Web 浏览器 ── httpOnly cookie ─┐
Tauri ─────── session header ───┼─> control-tower gateway
legacy client ─ bearer JWT ─────┘        │
                                         ├─ session 查 Dragonfly / JWT 验签
Casdoor <── code exchange/refresh ───────┤
                                         ├─ Casbin：roles × procedure
                                         └─ 注入 x-md-global-* → backend
```

- Web 与 Tauri 的主路径是 **BFF + 服务端 session**（即 [`docs/TECH.md`](docs/TECH.md) §8 的 Casdoor 有状态 Session 模型）。Casdoor access/refresh token、身份和角色保存在 gateway 侧，客户端只持不透明 session id。
- legacy bearer JWT 兼容轨是迁移残留；按 TECH.md「单一身份真相」红线，绝不允许 JWT 兼容逻辑或双重鉴权路径长期并存，须尽快移除。存量验签包含 issuer、audience、token type、subject、`iat`、`exp` 与 60 秒时钟偏移容忍。
- 删除 session 即时撤权；Dragonfly 不可达时会话鉴权 fail-closed。`/readyz` 必须把 session store 可达性纳入条件。
- cookie 使用 Secure、HttpOnly、SameSite；跨域写请求还受 Origin allowlist、CORS 与 Connect 协议头约束。

### 7.2 信任边界

1. gateway 在匿名判断前无条件删除客户端传入的全部 `x-md-global-*`，完成认证后再注入可信身份。
2. Casbin（存量）只负责 RPC 级角色授权，默认拒绝；策略与路由由 Config Center 下发并 Watch。按 [`docs/TECH.md`](docs/TECH.md) §8，对象级授权定稿为 OpenFGA 关系模型（网关 Check），Casbin 待替换。
3. service 层从可信 header 读取 user/merchant 身份，绝不信任请求体里的 `user_id` 或 `merchant_id`。
4. RBAC 不能替代数据归属校验。每条用户/商家查询仍须在 SQL 或领域层带 owner 条件，防止 IDOR。
5. 业务服务不重复解析 JWT/session，但这不等于「后端无需安全」。只有完成默认拒绝网络策略、移除直连入口和 east-west 身份后，「只信任网关」才是可强制执行的不变式。
6. 服务到服务调用不能冒用前端角色；应使用独立工作负载身份或明确的内部 procedure 策略。当前这部分仍是缺口。

现行设计与配置位置：`../control-tower/docs/design/adr-0002-bff-session.md`、
`../control-tower/docs/design/auth.md`、`../control-tower/routes/{dev,pre}.yaml`。本仓只记录业务所依赖的不变式，不复制实时策略内容。

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
| **交易闭环** | order 仍有假成功路径，payment 多个 RPC 未实现，inventory 无可用核心 RPC；不能把消费者端称为可上线商城 |
| **终端与领域覆盖** | merchant/admin 主要是壳；没有独立物流端、仓储端或 WMS。履约并入 order，但领域动作仍待实现 |
| **服务间调用** | 10 个服务的 `depends_on` 当前全部为空；order→inventory/product/address、payment→order 等只存在于 `depends_on_planned` |
| **领域事件** | 当前 JetStream、relay、indexer 和回灌已验证，但 Product 事务内 outbox 生产者未接，order/behavior 仍有进程内路径；Kafka producer Adapter 与 destination-aware relay 已有代码和测试场景，但 migration 未应用、PostgreSQL 容器场景未取得本轮运行证据，也没有业务 producer 或 consumer，仍处于 K1 迁移地基阶段 |
| **容量与 HA** | 没有固定数据集与 k6 结果；Meilisearch CE 单节点、JetStream R1、Kafka 仅有代码 Adapter 且未部署，主库/对象存储/备份路径也未形成百万或千万级验收证据 |
| **安全边界** | gateway 已完成 BFF/JWT/Casbin 与身份头剥离，但业务服务没有统一 workload identity，10 个服务也没有完整默认拒绝 NetworkPolicy；数据级归属校验仍有缺口 |
| **交付** | ArgoCD 当前零 Application/ApplicationSet；Helm 与运行实况不一致，自动同步、自愈和回滚未闭环 |
| **可观测性告警** | VM/VL/VT/Grafana/vmalert/Alertmanager 在用，但外部通知与 resolved 演练未闭环 |
| **前端质量** | `pnpm ready` 已覆盖 lint/fmt/type/test/build，浏览器与端到端用例仍不足，merchant/admin 业务覆盖尤其薄弱 |
| **重复基础代码** | `internal/pkg/{config,log,otel,registry,...}` 仍在 10 个服务中复制，修复需要同构回填并由 structcheck 防漂移 |

### 继续补齐的优先顺序

1. 先完成下单、库存、支付、幂等、对账与补偿；正确性以 PostgreSQL 约束和事务为锚点。
2. 收紧直连入口，补默认拒绝 NetworkPolicy、服务工作负载身份和商家/用户数据归属校验。
3. 按 [生产目标与 Kafka 路线](docs/design/platform/production-scale-goal.md) 先完成 Kafka 学习沙箱和 ProductChanged 搜索影子链，再迁 Order/Inventory/Payment；定义 topic、partition key、幂等、retry/DLQ、保留与重放边界。
4. 以明确数据口径建立容量模型与 k6 基线，再决定 PG 分区、搜索（Elasticsearch）拓扑、Kafka partition/副本和缓存策略。
5. 对齐裸 manifest、Helm 与运行资源后再重建 ArgoCD Application；未对齐前禁止直接开启 selfHeal。
6. 完成备份/PITR、RTO/RPO、外部告警通知及 failure/resolved/依赖故障演练。

---

## 十一、相关文档

文档导航统一看根 [`README.md`](README.md) §文档导航与文件头的分工块，本章不再维护第三份副本。
