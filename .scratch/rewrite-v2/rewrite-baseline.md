# Ecommerce v2 重写基线（单一真相文档）

> 用途：推翻重写 `backend/services` 各微服务前的**唯一**设计与决策基线。
> 本文合并三个来源：①用户建议全文（容量模型、目标架构、技术栈边界、领域模型、工程思想、分阶段路线）；
> ②2026-08-27 核验后的项目实况；③2026-08-28 用户四项终裁。
> 与旧文档冲突时**以本文为准**；冲突清单与证据见同目录 [`conflicts.md`](conflicts.md)。
> 涉及旧代码行为的 v1 文档冲突不再逐条修复，随重写作废。

---

## 0. 终裁记录（2026-08-28，用户拍板）

| # | 决策 | 内容 |
|---|---|---|
| D1 | **事件栈：重新采用 Apache Kafka 及其路线图** | KRaft + Strimzi + franz-go + Protobuf/Schema Registry 为目标事件主干；按 §5.3 的 K0–K6 路线执行。NATS 仅保留迁移期现有搜索链，K3 验收后按 K6 退役业务流。outbox/inbox 仍是正确性锚点，与 broker 无关。Debezium/Kafka Connect 只走分析 CDC（K5，需求触发）。此裁决推翻 2026-08-27 的「撤回」记录 |
| D2 | **数据库：现役主库 = node3 Pigsty PostgreSQL** | 经 `node1:30001`、`sslmode=verify-ca`；集群内 CNPG `pg-main` 已 hibernate，仅作回切候选，不是当前主库 |
| D3 | **商家模型：一个 Merchant 可开多个 Store（1:N）** | 审核对象是店铺（两段式入驻定稿：merchant 创建即生效，store_application 走审核）；数据归属键 = `merchant_id` + `store_id` |
| D4 | **制品：TCR + GHCR 双推维持** | 不收敛单仓；CI 负责双仓 digest 一致。Harbor 仅承担 Helm Chart OCI |
| D5 | **其余冲突随重写作废** | conflicts.md 中涉及旧代码行为的条目不再修复；v2 以本文为唯一口径 |

---

## 1. 现状基线（v2 的起点，核验后）

| 维度 | 实况 |
|---|---|
| 终端 | consumer / merchant / admin / desktop（Tauri 壳）。无独立物流端、仓储端、WMS；履约并入 order 域 |
| 后端 | 10 个 ConnectRPC Go 微服务（user/search/behavior/product/cart/address/order/inventory/merchant/payment），共用 Protobuf3、Buf、Protovalidate、Fx、pgx/sqlc/goose，一个 go.mod |
| 服务间调用 | `depends_on` 全空；order→inventory/product/address、payment→order 仅 planned |
| 鉴权 | control-tower BFF + 服务端 session 主路径（httpOnly cookie / Tauri session header），legacy bearer JWT 迁移期兼容；Casbin RPC 级 RBAC；网关剥离并注入 `x-md-global-*` |
| 网关能力 | 认证授权、路由、超时、健康选点、可观测性；**无** BBR 限流、熔断、HTTP/3、协议转码、默认重试 |
| 网络边界 | Cilium CNI/KPR/LB/Gateway API 在用；10 服务无完整默认拒绝 NetworkPolicy——「只信任网关」仍是设计假设 |
| 数据面 | node3 Pigsty PG（D2）；Dragonfly = 业务可丢缓存 + BFF session 例外；Meilisearch CE 单节点；Silo S3-compatible（SeaweedFS 定稿未迁）；ES 已退役 |
| 事件链 | PG outbox → 自写 relay → NATS JetStream（R1）→ search indexer 已运行；Product/Order 事务内生产者、Inbox、DLQ、重放未闭环。node3 已预建 Kafka（SCRAM 用户 + `ecommerce.events` topic），本仓当前无 Kafka 客户端代码，go.mod 残留 franz-go 死依赖 |
| 交付 | 实际部署走 `backend/services/*/deploy/`；GitOps 断线（ArgoCD 零 Application）；helm chart 与实况不一致，不是真相源；CI 仅由裸 semver tag 触发，双推 TCR/GHCR |
| 观测 | OTel → node3 Collector → VictoriaMetrics/Logs/Traces；Vector 采容器日志；Grafana/vmalert/Alertmanager 在 node3；authenticated ntfy 闭环已实测，飞书/企业微信未接 |
| 注册/配置 | Consul 仅注册发现（KV 退役），定稿迁 K8s Service DNS；Config Center（control-tower）是 10 服务唯一 Bootstrap 来源，也是启动硬依赖 |
| 交易正确性 | order 有假成功路径，payment 5 RPC 显式 Unimplemented，inventory Reserve 静默无操作 / ReleaseReserve panic——闭环未完成 |
| 容量 | 无百万/千万级验收结论；性能数字必须绑定压测环境才可宣称 |
| 故障域 | 核心 PG 与观测数据面同在 node3，经 Pangolin 隧道访问——隧道/node3/出口故障会同时影响业务与观测 |

---

## 2. 规模定义与容量模型

「百万/千万级」不是采购某种中间件，也不是单表行数。设计合理、索引正确的 PostgreSQL 表保存几千万行并不罕见。真正困难的是峰值流量、交易正确性、故障恢复、租户隔离、发布治理和团队认知负担。**最应避免的是「为了显得中大型而继续堆组件」。**

### 2.1 规模必须拆成可测维度

| 维度 | 必须声明的口径 |
|---|---|
| 用户 | 注册用户、MAU、DAU、峰值在线、活跃 session 数 |
| 商家 | 商家数、店铺数（D3：1:N）、每店成员数、头部租户占比与数据倾斜 |
| 商品 | SPU、SKU、Listing、价格版本、图片数、上下架频率 |
| 交易 | 日订单量、峰值创建订单 TPS、支付回调 TPS、取消/退款率 |
| 库存 | 流水日增量、热点 SKU 比例、预占持续时间与超时释放量 |
| 搜索 | 文档数、真实文档分布、索引大小、搜索 QPS、更新延迟目标 |
| 事件 | 每秒事件数、P50/P95 大小、最长可接受积压、保留与重放窗口 |
| 对象 | 原图/衍生图数量、月增量、带宽、CDN 命中率、冷热分层 |
| 可用性 | 核心旅程 SLO、错误预算、依赖降级、RTO、RPO |
| 成本 | 每订单、每百万请求、每百万事件、日志/指标/trace 成本 |

### 2.2 必备计算模型

- 峰值并发 ≈ 峰值到达率 × P95 响应时间（Little's Law）。
- broker 最大积压 ≈ 峰值事件速率 × 最长恢复时间 × P95 事件大小，再计副本与存储余量。
- session 内存 ≈ 并发 session × 序列化大小 × 数据结构/索引/TTL/副本/allocator 开销。
- PostgreSQL 容量 = heap + 索引 + WAL + 膨胀 + 临时空间 + 备份与恢复工作空间。
- 搜索容量只能用真实商品文档与查询分布压测，不能从原始 JSON 大小线性外推。
- 重试消耗额外容量；每条调用链和 consumer 都要有 retry budget 与总 deadline。

容量模型必须做成**机器可读的 capacity profile** 放进仓库，由 k6、SQL、组件 benchmark 和 Grafana 看板引用同一份 profile 验收，不写成一句愿景。

### 2.3 规模分层验收

| 级别 | 数据与负载 | 验收 |
|---|---|---|
| G0 工程基线 | 小规模固定数据集 | 功能、不变量、幂等、补偿、故障注入、指标正确 |
| G1 百万级 | 至少一个核心实体达 10^6 | 固定 profile 下的容量、恢复、成本报告 |
| G2 千万级 | 高增长表或索引达 10^7 | 分区/归档、备份、重放、扩缩容、故障域验收 |
| G3 生产峰值 | 真实 DAU、读写比、热点、峰谷 | SLO、错误预算、RTO/RPO、正确性、成本同时达标 |

每份报告记录：数据集版本、脚本 commit、硬件、拓扑、配置、持续时间、P50/P95/P99、错误率、饱和度、瓶颈、单位成本。只报峰值 QPS 不算通过。

---

## 3. 当前主要挑战（重写要解决的问题，按优先级）

1. **交易正确性没有闭环**：假成功路径、payment/inventory 核心能力缺失、跨服务调用未接线。
2. **缺正式容量基线**：没有固定数据集、流量模型、k6 脚本和可复现报告。
3. **故障域高度耦合**：核心 PG 与 Victoria 数据面都在 node3 并经隧道访问。
4. **安全边界未强制**：信任网关注入身份头，但无完整默认拒绝网络策略与 workload identity。
5. **BFF session 成新热路径依赖**：与业务缓存共用 Dragonfly 有驱逐/容量/故障耦合。
6. **事件链只完成搜索投影一部分**：事务内 outbox、Inbox 幂等、NACK/DLQ、重放治理未完成。
7. **GitOps 断线、部署真相分裂**：裸 manifest、Helm、集群实况三处不一致。
8. **告警未形成值班闭环**：ntfy 已通，飞书/企业微信与故障演练未完成。
9. **B2B2C 领域能力不足**：商家、管理、履约、售后、结算、审计、通知、仓储集成不完整。
10. **基础代码重复**：config/log/otel/registry 等复制进 10 个服务，修改易漏回填。
11. **控制面是启动依赖**：Config Center 不可达时新 Pod 起不来，需要高可用、版本固定、本地有效快照。
12. **团队认知负担**：十个微服务、两个仓库、多套基础设施对小团队已经很重。

---

## 4. 目标架构

```text
用户
  → CDN / WAF / DDoS 防护
  → 云负载均衡或生产级公网入口
  → Cilium Gateway API
  → control-tower gateway
      ├── BFF session / Casbin / quota / load shedding
      └── tenant/user → 业务 Cell

业务 Cell（初期仅一个）
  ├── Product / Cart / Checkout / Order / Inventory / Payment
  ├── PostgreSQL OLTP（node3 Pigsty → 生产级 HA 拓扑）
  ├── 独立 session store / 业务 cache
  └── PostgreSQL Outbox / Inbox

PostgreSQL outbox → 事件主干（目标 Kafka；迁移期 NATS 搜索链并行，见 §5.3）
  ├── Search projection → Meilisearch
  ├── Notification
  ├── Reconciliation
  └── 领域 consumer（Inbox 幂等）

OLTP PostgreSQL → 独立分析 CDC（Debezium/Connect，K5 需求触发）→ ClickHouse
对象存储（Silo → SeaweedFS/托管）→ CDN / imgproxy
OTel / Vector / Hubble / Profiling → Victoria 三支柱 / Grafana / vmalert / Alertmanager
```

初期只建一个 Cell。只有单集群故障半径、租户噪声或容量证据证明不可接受时，才按 tenant/user 哈希扩展多 Cell。搜索、缓存、消息和分析都不是交易真相源。

---

## 5. 技术栈决策与生产化边界

### 5.1 PostgreSQL 与交易数据（现役 node3 Pigsty，D2）

| 能力 | 决策 |
|---|---|
| 高可用 | Pigsty/Patroni 主副本必须跨真实故障域；同宿主多实例不算 HA。当前「单机 node3 + 隧道」只是过渡态，生产前必须解除 |
| 连接治理 | PgBouncer；先验证 transaction pooling 与 pgx prepared statement/statement cache 兼容模式 |
| 备份 | pgBackRest 或 WAL-G 异地对象存储、PITR、**定期真实恢复演练**（备份存在 ≠ 可恢复） |
| 大表 | 订单、库存流水、outbox、审计日志达到容量/维护阈值后按时间或租户原生分区 |
| 在线变更 | goose 走 expand-contract；`CREATE INDEX CONCURRENTLY` + lock timeout + migration lint（可引入 Squawk） |
| 诊断 | `pg_stat_statements`、`auto_explain`、慢 SQL 基线、VACUUM/WAL/bloat 看板 |
| ID | 高写入表优先 UUIDv7 或序列，避免随机 UUIDv4 的 B-tree 离散写 |
| 租户隔离 | repository owner 条件（`merchant_id`/`store_id`/`user_id`）为主；高风险表评估 RLS 时必须验证连接池与 `SET LOCAL` 语义 |

**不引入** Citus、CockroachDB、YugabyteDB——先证明单套 PG 已被索引、分区、缓存和查询优化推到合理上限。

### 5.2 Dragonfly、session 与缓存

拆成至少两个逻辑或物理故障域：

| 存储 | 策略 |
|---|---|
| BFF session store | `noeviction`、持久化/副本、容量告警、独立连接池、删除即撤权、不可用 fail-closed |
| 业务 cache store | LRU/LFU、允许丢失、cache-aside、TTL jitter、防击穿 |
| rate-limit/quota store | 独立实例或命名空间；丢失时显式 fail-open/fail-close |
| Gorse cache | 保持独立，不与业务 session 混用 |

必须实测 Dragonfly 的复制、故障转移、持久化与 Cluster 语义，不能因 Redis 协议兼容就假定行为一致。**锁、幂等键、领域真相永远锚定 PostgreSQL。**

### 5.3 事件平台：Kafka 目标态与 K0–K6 路线（D1）

**选型**：Apache Kafka（KRaft）+ Strimzi operator + franz-go 客户端 + Protobuf 事件 schema（Buf 管兼容，配 Schema Registry）+ CloudEvents envelope。NATS 仅保留迁移期现有搜索链。

**路线图**：

| 阶段 | 内容 | 出口条件 |
|---|---|---|
| K0 学习沙箱 | 私网 Strimzi/KRaft，第一天启用 TLS、独立 principal/ACL、Schema Registry、Kafka UI、broker/consumer 指标；不复活旧 CR（node3 现存 Kafka 仅作客户端练习资源） | 集群/客户端/指标链路全通，TLS+ACL 实测 |
| K1 迁移地基 | broker-neutral outbox（`EventSink` 接口）+ destination-aware relay（每 destination 独立 delivery 状态 + 持久增量 cursor）+ franz-go producer Adapter；migration 应用并取得容器化测试证据 | relay 在「Kafka ack 后、记录 delivery 前崩溃」等窗口测试通过 |
| K2 ProductChanged 影子链 | Product 事务内 outbox 生产者接线；Kafka → shadow index（独立 Meilisearch 索引），与 NATS 现链并行 | 影子链持续消费、无积压告警 |
| K3 搜索切流 | count/checksum/query diff 差异校验 + 全量回灌 + 积压恢复演练通过后切读路径 | 差异为零，NATS 链与回滚数据保留到稳定窗口结束 |
| K4 交易事件 | `OrderCreated`/`PaymentCaptured`/`InventoryConfirm*` 等迁 Kafka；partition key = `group_no`（同订单组同分区保序） | 前置证据：consumer Inbox 幂等、NACK/DLQ、poison 分类、重放权限与审计、Saga 四项治理、重复/乱序/断连演练 |
| K5 分析链（条件触发） | 真实 ClickHouse/报表需求成立后做 Debezium/Kafka Connect CDC PoC；CDC topic 与领域事件 topic 严格分离 | 双轨语义验收（outbox=业务事实，CDC=行变更） |
| K6 NATS 退役 | 交易链与搜索链验收后退役 NATS 业务流 | 退出条件与回滚窗口书面化后执行 |

**治理纪律（与 broker 无关，全程有效）**：

- 业务写与 outbox insert 同一 PostgreSQL transaction；relay 收到 broker ack 才标记 published。
- **任何阶段不得在业务事务内双写两个 broker**；迁移期两个 ack 独立记录。
- consumer 使用持久 Inbox/幂等表；broker 去重窗口和 EOS 不能替代业务幂等——不追求虚假的端到端 exactly-once。
- 统一定义 event id（UUIDv7）、aggregate id、tenant id、trace id、schema version、occurred_at；`type` 用 reverse-DNS 过去式。
- 交易类 topic 建议 replication factor 3、`min.insync.replicas=2`、producer `acks=all`（以压测验证为准）；声明 retention、最大积压、恢复 SLO。
- KEDA 按 lag 扩 consumer 的前提是幂等、backpressure 和下游容量已证明。
- 需要业务顺序的 consumer 还要校验单调 aggregate version（分区保序不等于业务语义有序）。
- 每个 stream/topic 声明 owner、subject/topic 命名、DLQ、重放授权与审计。

### 5.4 长流程与后台任务

- 当前优先：PostgreSQL 状态机 + outbox + backstop job（超时取消、对账补偿）。
- 可靠后台任务评估 **River**（PG 持久化队列）；正确性任务不得放进可驱逐缓存。
- 只有跨日定时器、人工等待、补偿和重试数量明显失控后才评估 **Temporal**；不为一次 RPC 或简单 CRUD 建 workflow。

### 5.5 搜索

Meilisearch 继续使用，收敛到深 Module，调用方不知道索引名、filter 语法或重建步骤：

```text
SearchCatalog: SearchProducts / UpsertProjection / DeleteProjection / RebuildIndex / SwapIndex
```

| 情况 | 决策 |
|---|---|
| 数百万~低千万文档、功能简单 | 继续 Meilisearch，先做真实容量与故障测试 |
| 需要分片、跨节点 HA、复杂聚合 | 评估 OpenSearch/Elasticsearch 或托管搜索（换 Adapter 不换接口） |
| 搜索只是条件筛选 | 考虑 PG FTS/trigram，省掉独立搜索集群 |

搜索永远是可重建 projection，PostgreSQL 是真相源。

### 5.6 对象存储、CDN 与制品（D4）

- 当前 Silo S3-compatible；SeaweedFS 是定稿迁移方向。生产前优先评估托管 S3/COS/OSS——自建的运维成本必须计算。
- 开启版本控制、生命周期、异地复制与不可变备份。
- 商品图走 CDN；引入 imgproxy 类处理层输出 AVIF/WebP 与多尺寸、防盗链签名 URL；业务 Pod 不承担公网图片带宽。
- 上传用预签名 URL；类型、大小、病毒与内容审核异步完成。
- **镜像制品：TCR + GHCR 双推维持**（D4），CI 保证两仓 digest 一致并禁 `latest`；Harbor 只承担 Helm Chart OCI。

### 5.7 流量入口与网关

- Pangolin/家庭出口/跨公网隧道**不得作为生产流量主路径**；生产入口用云 LB、专线或稳定公网。
- control-tower 逐 procedure 落实：请求大小、并发、deadline、用户/商家/IP/设备 quota、总并发上限与 load shedding。
- 只对已证明幂等的操作重试，服从 retry budget 与总 deadline；bulkhead 隔离支付、搜索、埋点；熔断必须有明确恢复与降级语义。
- 支付回调：验签、幂等键、防重放、nonce。
- WAF、Bot 管理、大流量 DDoS 清洗放云边缘，不由自研 Go 网关承担。

### 5.8 Cilium 与 workload 安全

- namespace 级 default-deny ingress/egress；只允许 Cilium Gateway/control-tower 进入业务服务。
- egress 只开放 matrix 声明的 PG、Dragonfly、Kafka/NATS、Meilisearch 等依赖。
- 用 Hubble 观察真实流量后逐步收紧，并为 deny 留可查询证据；Tetragon 做运行时检测。
- ServiceAccount 是 workload identity 基础；需要强 east-west 身份再评估 SPIFFE/SPIRE；不为「看起来零信任」上 service mesh。
- 不用 mesh 时，ConnectRPC client/server 显式规划 mTLS、证书轮换与身份映射。
- 「后端只信任网关」只有在默认拒绝、移除直连入口、east-west 身份完成后才是可强制不变式。

### 5.9 权限与多租户（含 D3）

固定概念：

| 概念 | 含义 |
|---|---|
| Principal | 当前认证主体（用户、商家员工、管理员或工作负载） |
| Customer | 消费者业务身份，不等同登录账号 |
| Merchant | 入驻法律/经营主体 |
| Store | Merchant 经营的店铺；**一个 Merchant 可开多个 Store（D3）**；审核对象是店铺 |
| MerchantMember | 用户在某 Merchant/Store 的成员关系与职务 |
| Role / Permission / Relation | 粗粒度角色 / 动作许可 / 主体与对象关系 |

授权三层：① Gateway Casbin（procedure 粗粒度 RBAC，默认拒绝）；② 业务服务（状态机与领域不变量）；③ Repository（owner/tenant 条件，`merchant_id`+`store_id`+`user_id`）。OpenFGA 只在对象关系复杂到 owner 条件无法清晰维护时引入；不得让 Casbin、OpenFGA 和数据库长期维护同一份权限真相。业务服务不解析浏览器凭据，身份只来自网关注入的可信头；服务间调用不得冒用前端角色，需独立工作负载身份或内部 procedure 策略。

### 5.10 Kubernetes 与交付

- 先统一 `deploy/`、Helm 与集群资源名/标签/image digest，再重建 ArgoCD Application；**未对齐前禁止 selfHeal**（影子服务事故风险已实证）。
- gateway、relay、indexer 纳入同一交付描述；Argo Rollouts 做 canary/blue-green，以 VictoriaMetrics 指标做 Analysis。
- HPA 管在线服务，KEDA 管队列 consumer，VPA 先 recommendation；三者不得无规则控制同一 workload。
- PDB、topologySpreadConstraints、anti-affinity、PriorityClass、N+1 容量。
- 基础设施用 OpenTofu/Terraform + Ansible；K8s 应用走 GitOps；Velero 不能替代 PG PITR；OpenCost 建每服务/每订单/每商家成本模型。

### 5.11 可观测性、性能与故障工程

- 现有 Victoria 三支柱继续；补 OTel Collector tail-based sampling（保错误与慢链路、限高基数）。
- Pyroscope/Parca 持续 profiling；Hubble 网络流与 policy deny 证据；Sentry/GlitchTip 收前端异常 + Source Map + release 关联。
- k6 管业务场景并 remote-write 进 VictoriaMetrics；pgbench、kafka/nats bench、真实 Meilisearch 数据集管组件基线。
- Toxiproxy 注入延迟/断连/丢包/半开；Chaos Mesh/Litmus 演练 Pod/网络/节点/依赖故障。
- **外部探针运行在业务故障域之外**（node3 挂了监控不能一起挂）。
- 每条 critical 告警声明 owner、影响、Runbook、Silence 条件、恢复验证；Alertmanager 的 firing/resolved 必须实测送达飞书/值班系统（ntfy 已通，飞书未接）。
- 指标标签禁高基数字段（用户/订单/SKU）；这些进结构化日志靠 trace id 关联。

### 5.12 供应链与安全门禁

目标链：Renovate → govulncheck/OSV-Scanner → Gitleaks → Trivy（容器/IaC）→ Syft SBOM → Grype 关联 → Cosign 签名 + SLSA provenance（GitHub OIDC keyless）→ Kyverno verifyImages。公开入口加 ZAP/Nuclei；Actions 加 zizmor；SBOM + license policy。目标：**只有通过测试、扫描、签名和策略验证的 digest 能进集群**，而不只是禁 latest。

---

## 6. 领域模型与不变量

| 领域 | 目标模型 |
|---|---|
| 商品 | Product、SKU、Listing、Offer、PriceBook——商品本体与商家售卖信息分离 |
| 结算 | Cart → Quote → CheckoutSession；价格与优惠用签名快照，结算不重新随意计算 |
| 订单 | OrderGroup、MerchantOrder、OrderLine——平台订单与商家子订单分开；状态分三层（order_group / 子订单 / 履约），不建单轴万能状态机 |
| 支付 | PaymentIntent、PaymentAttempt、Authorization、Capture、Refund（capture/refund 双轴） |
| 财务 | 双重记账 Ledger、LedgerEntry、Account、Payout |
| 库存 | StockItem、StockLedger、Reservation、Allocation——余额可为投影，流水才可审计。表示法裁决：`available` 与 `on_hand/reserved/locked` 选一种规范形式（派生值或带约束的冗余列），由属性测试守 `available + reserved + locked == on_hand` |
| 履约 | FulfillmentOrder、Shipment、Package、TrackingEvent、Return——并入 order 域，唯一触发门禁 `OrderReadyForFulfillment`；独立服务须 ADR |
| 商家 | Merchant、Store（1:N，D3）、MerchantMember、SettlementAccount |
| 事件 | EventEnvelope、Outbox、Inbox、ProjectionCheckpoint |
| 审计 | Actor、Action、Resource、Before/After、Reason、TraceID |

**写死的不变量**（数据库约束 + 状态机 + property-based/state-machine test；状态空间大时评估 TLA+/PlusCal）：

1. 可用库存永不小于零。
2. 同一幂等键最多产生一个业务结果。
3. Capture 合计 ≤ Authorization；Refund 合计 ≤ 已 Capture 金额。
4. 双重记账每笔 transaction 借贷合计为零。
5. 订单状态只能沿状态机允许的边迁移。
6. 商家只能读写归属于自身（merchant_id/store_id）的对象。
7. 搜索、缓存、消息和报表都不是交易真相源。
8. 库存预占、支付确认、超时取消与重复消息的**组合**必须被属性测试覆盖，示例测试不够。

---

## 7. 工程思想

- **DDD 限界上下文**按一致性和语言拆分，不按页面或数据库表拆分。
- **Deep Module**：复杂性藏在小 interface 后——PaymentPort、ObjectStore、SearchCatalog、FulfillmentProvider、EventSink。
- **Ports and Adapters**：支付宝/微信、Silo/SeaweedFS/S3、Meilisearch/OpenSearch、Kafka/NATS 都是 Adapter。
- **CQRS** 只用于搜索、报表等读模型，不把所有 CRUD 事件化。
- **Outbox + Inbox**：本地事务保证发布意图，消费幂等保证 at-least-once 下的正确性。
- **Saga/TCC**：明确同步强一致段与异步补偿段；补偿事件是一等公民。
- **Ledger 思想**：资金、库存、积分用不可变流水，不只维护余额。
- **Bulkhead 与 Cell**：隔离支付、搜索、埋点及租户群故障。
- **Backpressure/Load Shedding**：队列和并发有上限，超容量主动拒绝，不让所有请求一起超时。
- **Retry Budget**：重试只给幂等操作，服从总 deadline。
- **CAP/PACELC**：逐领域选一致性，不求全系统同一答案。
- **SLO/Error Budget、RTO/RPO**：可靠性是可度量目标；恢复必须演练。
- **Expand-Contract**：数据库、proto、事件 schema 统一向后兼容演进。
- **Fitness Functions**：structcheck、Buf breaking、策略测试、容量门禁持续验证架构约束。
- **Production Readiness Review**：每个上线能力有 owner、SLO、容量、Runbook、看板、告警、备份、故障模式清单（见 §11.4）。
- **Team Topologies**：业务团队拥有领域，平台团队提供 gateway/config/CI/observability 深 Module。

---

## 8. 前端生产能力

- consumer 为 SEO/首屏/分享评估 SSR/SSG——沿现有 TanStack Router 评估 TanStack Start，不无理由整体迁 Next.js；merchant/admin 保持 SPA。
- 商品详情、类目页、公共配置用 CDN、ETag、stale-while-revalidate；图片响应式尺寸 + AVIF/WebP + CDN。
- OpenFeature + Unleash/flagd 做功能开关、灰度、紧急熔断。
- Playwright 覆盖登录、购物车、结算、支付回跳、商家发货关键旅程；Lighthouse CI 设 LCP/INP/CLS 与 bundle budget。
- Storybook 与视觉回归服务共享 UI，不阻塞业务测试。
- 埋点有采样、隐私分类、Consent、PII 清洗。

---

## 9. 保留的成功经验（v1 做对的，v2 必须继承）

1. **API 契约先行**：proto + buf.validate 全字段约束 + `buf breaking` 进 CI + 同一 proto 生成 Go/TS；配置 schema 也用 conf.proto 定义。
2. **分层铁律**：server → service → biz ← data；biz 不 import proto/data；fx.ValidateApp 静态验依赖图；固定装配顺序与优雅关闭（含 OTel flush）。
3. **配置面**：Config Center 单源 + selector 自举 + 热更新链（写入事务内 pg_notify → 独立 LISTEN 连接 → 先订阅再发快照 → 指数退避）；换池 Ping 通过才换、旧池延迟关闭；`server/discovery/observability` 有意不热生效并打 WARN。
4. **数据层**：sqlc + goose、每服务一 schema、金额 int64 分/DECIMAL、UUID 身份、快照字段不跨库 JOIN、keyset 分页、显式 UNIQUE + upsert、表列 COMMENT 强制、dbmigrate baseline 接管存量库。
5. **三层错误处理**：biz 域错误 → data `%w` 双包装 → service `errors.Is` 映射 Connect 码；网关非业务错误也按 Connect 规范 + `X-Error-Reason`。
6. **BFF session 模型**：httpOnly cookie / session header、网关无条件剥离入站 `x-md-global-*` 再注入、删除 session 即撤权、Dragonfly 不可达 fail-closed、`/readyz` 纳入 session store 可达性。
7. **outbox/relay 语义**：broker ack 才写 published_at、advisory lock 单活实例、pg_notify 只做唤醒轮询兜底、cleanup retention 大于重放窗口——K1 起整套继承到 Kafka relay。
8. **结构与文档门禁**：structcheck 对齐 matrix/目录/部署清单/网关路由/配置契约；verify-context + canary；反向棘轮基线（存量只收敛不新增）。
9. **知识库纪律**：context/ 三层 + experience 四段式 + evolution-log「规则必须写清触发事故」；`.service-matrix.yaml` 区分 depends_on 与 planned；TODO 唯一进度真相源。
10. **测试纪律**：biz mock、data 真库 testcontainers、Redis 用 miniredis、禁 pgxmock/go-sqlmock；`-short` 唯一开关。
11. **工程工具链**：vite-plus 一体化 + pnpm catalog 版本集中 + commitlint 钩子；tag 驱动 CI、双推 digest 一致。
12. **观测方法论**：RED/USE、三支柱靠 trace_id 与统一资源标签互跳、高基数禁令、ParentBased 采样、日志限流必须「压制可见」（suppressed counter）。
13. **决策工艺**：三轮异构对抗评审 + 出题清单转验收项；E3 执行策略（先估计→最小执行→失败才扩张）。
14. **设计系统**：「灯市」视觉 token 体系与统一错误模型（AUTH_REASONS 退登 / PERMISSION_REASONS 仅提示）。

---

## 10. 避坑清单（v1 血泪，v2 不得再犯）

### 正确性

- **假成功比未实现危险**：CreateOrder 假成功、inventory Reserve 四连坑（CAS 比对未来版本号恒 0 行、丢弃行数、available 语义颠倒、错误分支传恒 nil）——桩一律显式 `Unimplemented`，禁止静默空操作与伪造流水。
- 防重 `requestId` 曾靠 cast 假装 proto 有字段，运行时被丢弃——契约字段必须真实存在并端到端测试。
- Redis/Dragonfly 锁承载正确性 = 锁键被驱逐即超卖；broker 去重窗口 ≠ 持久 Inbox。
- 持久化成功前不得发布事件（CompleteOrder 只打日志就发事件的教训）。
- relay 在 PG transaction/行锁内做 broker publish 会放大锁持有时间——K1 重写时消除。

### 安全

- **owner 校验缺失 = IDOR**：address 四条 SQL 只按 address_id 过滤、商家审批 UPDATE 无 WHERE 全表通过——每条用户/商家查询必须带 owner 条件，user_id 只取网关注入身份头，禁止取请求体。
- token 落日志（`u.l.Debug(token.AccessToken)`）与「示例代码返回 access token 给前端」都是事故模板——凭据永不进日志与响应。
- 免鉴权路径也必须先剥离入站 `x-md-*`，否则任何人可自称任何人。
- 把 CA 挂载到 `/etc/ssl/certs` 会遮蔽整个系统 CA 目录（用 subPath 单文件）。
- PII 脱敏必须实测（Lua 不支持 `{n}` 量词、Keep_Log 保留原文绕过脱敏的双重教训）。
- 进过 git 历史的凭据 = 已泄露，必须轮换；停止跟踪 ≠ 安全。

### 配置与基础设施

- 同一配置存在仓库副本/本地/配置中心三处就必然漂移——改完远端要复验；缺键静默禁用是事故源（ErrorUnused + 解码后 protovalidate 已堵，不得回退）。
- config 服务不能把自己唯一启动配置放进自己（自举盲点）；Config Center 作为启动硬依赖需要 HA、版本固定与本地有效快照。
- 未备案域名在国内云直连必被 ICP 拦截——「配域名+证书」这条路走不通时要走隧道回源。
- 换镜像后 `HOME` 漂移会让证书静默不加载（显式 `--certs-dir`）；TLS 验收必须含「故意错的输入」且不带 `-k`。
- 公网数据端口 `0.0.0.0/0` + 弱口令 + 明文的组合不管功能做到哪一步都先堵。
- 核心库与观测数据面同故障域、依赖临时公网隧道（node3 现状）——生产前必须解耦，外部探针放故障域外。

### 交付

- Helm 与实况漂移时开 selfHeal = 起一整套影子服务抢走网关流量——接回 GitOps 前先对齐资源名/标签/tag 三处。
- 部署清单四处各抄一份必漂移——由 structcheck 一类结构门禁强制对齐。
- 死引用流水线「假装还在工作」（frontend.yml）——要么按现状重写要么删掉。
- git 钩子可以九个月不生效——门禁上线必须自证（canary：注错断言门禁会红）。
- CI 只由 tag 触发时，「push main 会构建」的直觉是错的——发布手顺写死在文档。

### 可观测性

- `net_peer_port` 一类高基数标签让 rate() 恒 0，「请求率/错误率/P95 全是错值」比空图更危险。
- connect 无 CodeOK：成功会被记成 unknown，按 rpc.code 做的告警全失真。
- 只用 TraceIDRatioBased 不加 ParentBased 会采出满屏半截 trace。
- 网关 5xx 在 `err==nil` 时被记成功——按 StatusCode≥500 设 span/日志级别。
- semconv 版本与 SDK 不对齐会让全部服务起不来。
- 故障时正是日志风暴时：限流 + 丢弃计数可见，静默压制是最大反模式。

### 流程与协作

- **本次 80 条冲突的根因：同一天两次反向拍板没有清扫旧口径**——任何决策变更必须同步唯一真相源并全仓清扫，留决策记录（日期 + 理由 + 覆盖了谁）。
- 目标态不得冒充现状：「已支持/已接/已实现」必须有验收证据，否则写「设计中/已实现未验收」。
- `depends_on` 与 `depends_on_planned` 不许混；「集群里存在对象」不等于「业务已接线」。
- 同一事实只写一处，其余引用；一句话摘要与正文同改（INDEX 漂移教训）。
- 新增服务必须先 ADR 证明独立伸缩或故障域（第 11 个服务不许「立项即做」）。

---

## 11. 分阶段路线

### 11.1 P0：生产前必须完成

1. **交易闭环与数据库不变量**（第一优先）：修假成功、库存 CAS、payment 主体；PG 事务/唯一约束/幂等键/状态机为锚点；打通 商品→购物车→结算→预占→支付→订单状态→取消/退款 的成功与失败路径。
2. 用户/商家（merchant_id + store_id）数据归属校验全覆盖。
3. PostgreSQL HA、PITR 与真实恢复演练（解除 node3 单点/隧道依赖）。
4. session 与业务 cache 故障域隔离。
5. Cilium default-deny + gateway-only + 依赖白名单。
6. GitOps 真相源统一（对齐后重建 Application，未对齐禁 selfHeal）。
7. 外部告警（飞书/企业微信）与值班闭环、resolved 演练。
8. 固定数据集、capacity profile、k6 基线与成本报告。
9. **事件平台 K0–K3**：沙箱→迁移地基→ProductChanged 影子链→搜索切流；治理证据（Inbox、NACK/DLQ、重放、积压恢复）随阶段交付。K0/K1 可与交易正确性并行，不占其关键路径。
10. 核心旅程 SLO、Runbook、故障演练。

### 11.2 P1：业务增长后

- **K4 交易事件迁移**（前置证据齐备后）→ 商家子账号、履约、售后、结算与双重记账。
- CDN、图片处理、consumer SSR/SSG；ClickHouse + **K5 分析链**（需求触发）。
- KEDA/HPA、Argo Rollouts 与自动容量验证；OpenFeature/Unleash。
- Pyroscope、Hubble、Tetragon；SBOM、签名、Kyverno。
- 分区、冷热归档与成本治理；**K6 NATS 退役**（全部验收后）。

### 11.3 P2：只由证据触发

| 能力 | 触发条件 |
|---|---|
| OpenFGA | 对象关系复杂到 repository owner 条件无法清晰维护 |
| Temporal | 长流程、定时器、人工等待、补偿数量失控 |
| OpenSearch | Meilisearch 容量、HA 或聚合实测不达标 |
| Citus/分片 | 单 PG 充分优化后仍不达标 |
| SPIFFE/SPIRE | 确需独立 east-west workload identity |
| Cell Architecture | 单集群故障域或租户噪声不可接受 |
| 多区域 active-active | 业务 RTO 明确无法由 active-passive 满足 |
| Backstage | 服务与 owner 数量使人工目录明显失控 |

### 11.4 Production Readiness Review（每个核心服务/链路上线前）

owner 与故障域；不变量与自动化测试；SLI/SLO/错误预算与 burn-rate 告警；capacity profile 与压测结果、饱和点、N+1 余量；timeout/backpressure/retry budget/幂等/降级；数据分类、租户隔离、最小权限；backup、PITR、RTO/RPO 与最近一次恢复证据；deploy/canary/rollback 与 schema expand-contract 手顺；dashboard、critical alert、Runbook、firing/resolved 通知证据；单位成本与扩容成本；已知风险、豁免 owner 与到期时间。**没有证据的能力只能标「设计中」或「已实现未验收」。**

---

## 12. 明确不做

- 不把全部业务改成 Event Sourcing。
- 不为履约、营销、结算、分析的每个名词立即建微服务（并入现有域，拆分须 ADR）。
- 不在没有明确 RTO 时建多区域 active-active。
- 不用 service mesh 代替 NetworkPolicy、身份和授权模型。
- 不在单 PG 未充分优化前换分布式数据库。
- 不让 HPA、VPA、KEDA 无规则控制同一 workload。
- 不在缺少幂等和容量预算时开启网关自动重试。
- 不把缓存、搜索、消息队列或 ClickHouse 当交易真相源。
- 不让核心数据库和观测数据面长期依赖临时公网隧道。
- 不在业务事务内双写两个 broker；不追求端到端 exactly-once 幻觉。

真正的中大型生产项目不是组件数量多，而是：**正确性可证明、容量可复现、故障可隔离、数据可恢复、变更可回滚、责任可定位、成本可解释。** 最优先的投资是交易模型、安全边界、容量证据和恢复能力，然后才是更多基础设施。

---

## 13. 附：v1 真相源口径统一清单（按终裁收口时用）

按 D1–D4，以下文件需要在正式动工时统一口径（本文先行生效，不阻塞重写）：

| 文件 | 动作 |
|---|---|
| `docs/design/platform/production-scale-goal.md` | 恢复 Kafka 目标与 K0–K6 路线（引用本文 §5.3），删除「不因……重新引入 Kafka」及 P2 Kafka 触发行 |
| `TODO.md:414`、`:389-396` | 「撤回」注记改为「撤回已被 2026-08-28 终裁推翻」；NATS J0–J4 改写为 K0–K6 条目 |
| `.service-matrix.yaml:57-58` | kafka 条目改为「目标事件主干（K0–K6 迁移中）」；nats 条目标注「迁移期搜索链，K6 退役」 |
| `README.md:22`、`STACK.md:199-201`、`context/project/ecommerce/events/INDEX.md` | 同步 D1 口径；STACK §十 的 K1 表述从「已有代码」订正为「代码已删待重建（go.mod 残留 franz-go 死依赖）」 |
| TECH-RADAR:10/§1、PRIORITY Kafka 条目、design 层 Kafka 表述 | 方向保留（与 D1 一致），仅把「已有 Adapter 代码」等失实细节订正 |
| CNPG/集群内观测/GLOSSARY BFF/SCAFFOLD/helm 自述等其余冲突 | 按 conflicts.md C3/C5/C6 清理；与被推翻代码绑定的条目随重写作废（D5） |
