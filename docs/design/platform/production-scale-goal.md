# 百万/千万级 B2B2C 生产化目标

> 状态：目标态，已决策；实现进度以 `TODO.md` 为准。
> 当前运行事实以 `.service-matrix.yaml` 和 `STACK.md` 为准；技术选型与基础设施目标以 [TECH.md](../../TECH.md) 为准。
> 本文定义「要证明什么、按什么证据验收、什么条件下才增加组件」，不把规划写成现状。
>
> **后续决策覆盖（2026-08-28）**：本文原有「NATS 继续作为目标主干、Kafka 仅证据触发」「Meilisearch 继续作为目标搜索引擎」「Pangolin 不进入生产主路径」「Casbin 为目标 RBAC、OpenFGA 后置」等结论已被 [TECH.md](../../TECH.md) 覆盖：目标采用外部非 K8s Kafka、Elasticsearch、CDN/WAF → Pangolin → Cilium Gateway API → control-tower，以及 Casdoor 有状态 Session + OpenFGA。存量 NATS、Meilisearch、Casbin 与 legacy JWT 仍按迁移现状记录，不改写为已删除。

## 一、北极星目标

将 ecommerce 演进为一个正确性可证明、容量可复现、故障可隔离、数据可恢复、变更可回滚、责任可定位、成本可解释的 B2B2C 多商家生产系统。

「百万/千万级」不是采购某种中间件，也不是单张表达到某个行数。设计合理、索引正确的 PostgreSQL 表保存几千万行并不罕见。**新增**组件必须由真实需求、容量瓶颈或故障证据触发——但这条门槛约束的是「往栈里加东西」，不适用于 [TECH.md](../../TECH.md) 已直接定稿的目标形态：事件主干为外部非 K8s **Kafka**、搜索存储为 **Elasticsearch**，存量 NATS JetStream 与 Meilisearch 属迁移期实现，其替换**不需要**再单独提供数据量证据。

当前优先级固定为：

1. 交易正确性与数据库不变量；
2. 租户归属、身份与网络安全边界；
3. 可复现容量模型、SLO 与错误预算；
4. PITR、RTO/RPO 和真实恢复演练；
5. 发布治理、告警值班和故障隔离；
6. 单订单、百万请求和数据保留成本；
7. 证据证明现有技术达到边界后，再评估新增基础设施。

禁止以「中大型项目都在用」或个人学习目标作为业务基础设施接线理由。node3 已存在的 Kafka 在本文写作时只视为独立实验资源，当前应用 `used_by=[]`；该现状不等于目标已接线。目标按 [TECH.md](../../TECH.md) 将事件主干迁往外部非 K8s Apache Kafka 集群。

## 二、规模必须拆成可测维度

仓库最终必须提供机器可读的 capacity profile；k6、SQL、组件 benchmark 和 Grafana 看板必须引用同一 profile。

| 维度 | 必须声明的口径 |
|---|---|
| 用户 | 注册用户、MAU、DAU、峰值在线人数、活跃 session 数 |
| 商家 | 商家数、店铺数、每店成员数、头部租户占比和数据倾斜 |
| 商品 | SPU、SKU、Listing、价格版本、图片数、上下架频率 |
| 交易 | 日订单量、峰值创建订单 TPS、支付回调 TPS、取消和退款率 |
| 库存 | 库存流水日增量、热点 SKU 比例、预占持续时间和超时释放量 |
| 搜索 | 文档数、真实文档分布、索引大小、搜索 QPS、更新延迟 |
| 事件 | 每秒事件数、P50/P95 大小、最长可接受积压、保留和重放窗口 |
| 对象 | 原图与衍生图数量、月增量、带宽、CDN 命中率和冷热分层 |
| 可用性 | 核心旅程 SLO、错误预算、依赖降级、RTO 和 RPO |
| 成本 | 每订单、每百万请求、每百万事件以及日志/指标/trace 成本 |

### 2.1 必备计算模型

- 峰值并发约等于「峰值到达率 × P95 响应时间」（Little’s Law）。
- Kafka 最大积压约等于「峰值事件速率 × 最长恢复时间 × P95 事件大小」，还要计入副本、保留期与存储余量；存量 JetStream 迁移容量另行核算。
- session 内存包括并发 session、序列化、索引、TTL、复制和 allocator 开销。
- PostgreSQL 容量必须同时计算 heap、索引、WAL、膨胀、临时空间、备份和恢复工作空间。
- 搜索容量必须使用真实商品文档与查询分布压测，不能从原始 JSON 大小线性外推。
- 重试会消耗额外容量；每个调用链和 consumer 都必须有 retry budget 与总 deadline。

### 2.2 规模分层

| 级别 | 数据与负载 | 验收要求 |
|---|---|---|
| G0 工程基线 | 小规模固定数据集 | 功能、不变量、幂等、补偿、故障注入和指标正确 |
| G1 百万级 | 至少一个核心实体达到 `10^6` | 固定 profile 下完成容量、恢复和成本报告 |
| G2 千万级 | 至少一个高增长表或索引达到 `10^7` | 分区/归档、备份、重放、扩缩容和故障域通过验收 |
| G3 生产峰值 | 真实预估 DAU、读写比、热点和峰谷 | SLO、错误预算、RTO/RPO、正确性和成本同时达标 |

每份报告必须记录数据集版本、脚本 commit、硬件、拓扑、配置、持续时间、P50/P95/P99、错误率、资源饱和度、瓶颈和单位成本。只报告峰值 QPS 不算通过。

## 三、当前运行基线与缺口

当前已具备：

- 10 个 Go + ConnectRPC 业务服务，以及独立仓库中的 control-tower gateway/config/BFF；
- node3 Pigsty PostgreSQL 作为当前业务主库；集群内 CNPG 已 hibernate，仅是回切候选；
- Dragonfly、Meilisearch、S3-compatible 对象存储；
- 3 server NATS JetStream、PostgreSQL outbox relay 和 search indexer；
- Cilium CNI/KPR/LB/Gateway API；
- VictoriaMetrics/Logs/Traces、Vector、Grafana、vmalert 和 Alertmanager；
- Buf、Protovalidate、sqlc、goose、vite-plus、Vitest、Playwright 和 structcheck。

当前主要缺口不是数据量，而是：

1. order 仍有假成功路径，inventory/payment 核心能力和跨服务交易链未闭环；
2. 订单防重、状态机、库存预占、支付确认、退款与补偿不变量缺少组合验证；
3. Product/Order 的事务内 outbox、consumer Inbox、NACK/DLQ 和重放治理未完成；
4. NATS 当前搜索流为可重建 R1，尚无跨故障域 R3 与容量/恢复成本证据；
5. PostgreSQL 和 Victoria 数据面集中在 node3，并经外部入口访问，存在耦合故障域；
6. 业务服务缺少完整 default-deny、gateway-only、依赖白名单和 workload identity；
7. BFF session 与业务 cache 共用 Dragonfly 故障域，驱逐策略和容量必须分离；
8. GitOps 断线，裸 manifest、Helm 和集群实况不是同一真相；
9. 外部告警、resolved 通知、PITR 恢复和灾难演练没有形成值班闭环；
10. 固定数据集、容量 profile、可信 k6 报告和单位成本证据缺失；
11. 配置、日志、OTel 和注册发现代码跨服务重复，团队认知负担已高；
12. Config Center 是启动依赖，但高可用、版本固定和本地有效快照策略未闭环。

## 四、目标架构

```text
用户
  → CDN / WAF / DDoS 防护
  → Pangolin 公网入口
  → Cilium Gateway API（TLS 终止、KPR 严格模式）
  → control-tower gateway
      ├── Casdoor Stateful Session / OpenFGA / quota / load shedding
      └── tenant/user → 业务 Cell（ConnectRPC over HTTP/2 H2C）

业务 Cell（初期仅一个）
  ├── Identity / Catalog / Cart / Order(Saga) / Payment / Inventory / Fulfillment / Notification
  ├── PostgreSQL OLTP（外部 Pigsty/Patroni + PgBouncer）
  ├── Dragonfly：Session / Cache / Ratelimit 分实例
  └── PostgreSQL Outbox / Inbox

PostgreSQL Outbox → Apache Kafka（外部非 K8s 集群）
  ├── Search projection → Elasticsearch
  ├── Notification
  ├── Reconciliation
  └── Analytics / 领域 consumer

OLTP PostgreSQL → 独立分析 CDC → ClickHouse（需求成立后）
对象存储 → CDN / 图片处理
OTel / Vector / Hubble / Profiling → Victoria / Grafana / Alertmanager
```

初期只建设一个 Cell。只有单集群故障半径、租户噪声或容量证据证明不可接受时，才按 tenant/user 哈希扩展多个 Cell。搜索、缓存、消息和分析都不是交易真相源。

## 五、现有技术栈的生产化边界

### 5.1 PostgreSQL 与交易数据

- Pigsty/Patroni 的主副本必须跨真实故障域；同宿主多实例不算 HA。
- 引入 PgBouncer 前，先验证 transaction pooling 与 pgx prepared statement/statement cache 的兼容配置。
- 使用 pgBackRest 或 WAL-G 做异地对象存储备份、PITR 和定期真实恢复。
- 订单、库存流水、outbox 和审计日志达到容量/维护阈值后，再按时间或租户采用原生分区。
- goose 继续走 expand-contract；在线索引使用 `CREATE INDEX CONCURRENTLY`，并配置 lock timeout 与 migration lint。
- 建立 `pg_stat_statements`、`auto_explain`、慢 SQL、VACUUM、WAL 与 bloat 基线。
- 新增高写入表在序列、UUIDv7 等方案间按索引局部性和跨节点要求选择，不默认使用随机 UUIDv4。
- 租户隔离以 repository owner 条件为主；高风险表评估 RLS 时，必须验证连接池和 `SET LOCAL` 语义。

没有单 PostgreSQL 优化极限、恢复或成本证据前，不引入 Citus、CockroachDB 或 YugabyteDB。

### 5.2 Session 与缓存

| 存储 | 策略 |
|---|---|
| BFF session store | `noeviction`、持久化/副本、独立连接池、删除即撤权、不可用时 fail-closed |
| 业务 cache store | LRU/LFU、允许丢失、cache-aside、TTL jitter、防击穿 |
| rate-limit/quota store | 明确 fail-open/fail-close，可独立实例或命名空间 |
| Gorse cache | 保持独立，不与业务 session 混用 |

必须实测 Dragonfly 复制、故障转移、持久化和 Cluster 语义，不能因 Redis 协议兼容就假定行为完全一致。

### 5.3 Apache Kafka 与事件治理

目标事件主干是部署于非 K8s 独立集群的 Apache Kafka；存量 NATS JetStream 仅在迁移期间继续承载现有搜索链，不再作为新业务事件目标。生产化要求：

- 业务事务与 Outbox insert 位于同一 PostgreSQL transaction；Relay 仅在收到 Kafka `acks=all` 后标记 `published`。
- consumer 使用主键为 `(consumer_group, event_id)` 的 Inbox 表，不追求虚假的端到端 exactly-once。
- Topic 按限界上下文划分，以 `aggregate_id` 作为 partition key 保证同聚合事件顺序。
- 事件 envelope 统一包含 `event_id`、`aggregate_id`、`tenant_id`、`trace_id`、`schema_version`、`occurred_at`。
- payload 采用 Protobuf，由 Buf Schema Registry 管理兼容；CloudEvents 只可作为 envelope 参考，不替代领域事件设计。
- 连续消费失败超过 5 次转投 DLQ Topic，并触发 Alertmanager 告警；同时治理 retention、最大积压、poison message、重放权限和审计。
- KEDA 只能在幂等、backpressure 和下游容量得到证明后按 Kafka consumer lag 扩容。
- 业务事件与分析 CDC 分离：Outbox 表达「业务发生了什么」，逻辑复制表达「数据库哪些行变了」。

### 5.4 长流程与后台任务

- 当前优先使用 PostgreSQL 状态机 + outbox + backstop job。
- 正确性任务可评估 River，以 PostgreSQL 作为持久化队列；不得放入可驱逐 cache。
- 只有跨日定时器、人工等待、补偿和重试数量明显失控后，才评估 Temporal。
- 不为一次 RPC 或简单 CRUD 创建 workflow。

### 5.5 搜索

目标搜索存储定稿为 Elasticsearch，并收敛到 Deep Module；存量 Meilisearch 在迁移期继续运行，不能写成已删除：

```text
SearchCatalog
- SearchProducts
- UpsertProjection
- DeleteProjection
- RebuildIndex
- SwapIndex
```

搜索必须是可重建的只读 Projection，PostgreSQL 才是真相源。Elasticsearch 实现隐藏于 `SearchCatalog` 后，必须支持从 PostgreSQL 全量重建；迁移期以 shadow index 与差异校验完成切流。

### 5.6 对象存储与 CDN

- 对象存储按 [`TECH.md`](../../TECH.md) 定稿为 Silo（基于 MinIO，S3 兼容）；生产容量与备份证据须以 Silo 验证，托管 S3/COS/OSS 仅作对照评估，且任何自建替代都必须计算运维成本。
- 开启版本、生命周期、异地复制与不可变备份。
- 商品图片通过 CDN 和 imgproxy 类处理层输出 AVIF/WebP 与多尺寸。
- 上传使用预签名 URL，并异步做类型、大小、病毒和内容审核。
- TCR/GHCR/Harbor 只能选一个主制品真相源。

### 5.7 流量入口与网关

- 生产入口固定为 CDN/WAF → Pangolin → Cilium Gateway API → control-tower；Pangolin 仅承担公网入口/安全反向代理，不叠加 WireGuard/IPsec 隧道，家庭出口和临时跨公网隧道不得成为依赖。
- control-tower 逐 procedure 落实请求大小、并发、deadline、quota 和 load shedding。
- 只对已证明幂等的操作重试，并服从 retry budget 与总 deadline。
- 用 bulkhead 隔离支付、搜索和埋点；熔断必须有明确恢复和降级语义。
- 支付回调落实幂等键、防重放、nonce 与签名校验。
- WAF、Bot 与大流量 DDoS 清洗放在云边缘，不由自研 Go gateway 承担。

### 5.8 Cilium 与 workload 安全

- namespace 级 default-deny ingress/egress。
- 只允许 Cilium Gateway/control-tower 进入业务服务。
- egress 只开放 `.service-matrix.yaml` 声明的依赖；目标包括外部 Pigsty PostgreSQL、分实例 Dragonfly、外部 Kafka 与 Elasticsearch，迁移期同时保留已登记的 NATS、Meilisearch 通路。
- 用 Hubble 观察真实流量后逐步收紧，并为 deny 提供可查询证据。
- ServiceAccount 是 workload identity 基础；需要强 east-west 身份时再评估 SPIFFE/SPIRE。
- 不使用 service mesh 时，ConnectRPC client/server 必须明确 mTLS、轮换和身份映射。

### 5.9 多租户与授权

固定概念：`Principal`、`Customer`、`Merchant`、`Store`、`MerchantMember`、`Role`、`Permission`、`Relation`。

授权分三层：

1. Casdoor：有状态 Session 与 admin/merchant/customer 粗粒度角色；
2. control-tower + OpenFGA：merchant/store/order 对象级关系授权；
3. 业务服务与 Repository：状态机、领域不变量及 tenant/owner 数据隔离条件。

存量 Casbin procedure 策略是迁移现状，不再作为目标授权真相源；OpenFGA 关系 tuple 与数据库业务归属应有明确同步契约，禁止长期双写漂移。

### 5.10 Kubernetes 与交付

- 先统一 `deploy/`、Helm 与集群资源名、标签和 image digest，再接回 ArgoCD。
- Gateway、relay、indexer 进入同一交付描述；启用 prune/selfHeal 前先排除影子服务风险。
- HPA 管在线服务；KEDA 管队列 consumer；VPA 先 recommendation，不能同时无规则修改同一 workload。
- 使用 PDB、topology spread、anti-affinity、PriorityClass 和 N+1 容量。
- OpenTofu/Terraform + Ansible 管基础设施，Kubernetes 应用由 GitOps 管理。
- Velero 不能替代 PostgreSQL PITR。
- OpenCost 输出每服务、每订单与每商家的成本模型。

### 5.11 可观测、性能与故障工程

- OTel Collector tail-based sampling 保留错误和慢链路，并限制高基数。
- Pyroscope/Parca 补 CPU、heap、锁和 goroutine 持续 profiling。
- Hubble 提供网络流与 policy deny 证据。
- k6 负责业务场景；pgbench、Kafka benchmark 和真实 Elasticsearch 数据集负责目标组件基线；迁移期继续保留 NATS/Meilisearch 基线用于切流对照。
- Toxiproxy 注入延迟、断连、丢包和半开；Chaos Mesh/Litmus 演练 Pod、网络、节点和依赖故障。
- 外部探针运行在业务故障域之外。
- 每条 critical 告警必须声明 owner、影响、Runbook、Silence 条件和恢复验证。
- Alertmanager 的 firing/resolved 必须实际送达飞书或值班系统。

### 5.12 供应链与安全门禁

目标链：Renovate → govulncheck/OSV-Scanner → Gitleaks → Trivy → Syft SBOM → Grype/Trivy 关联 → Cosign/SLSA provenance → Kyverno verifyImages。公开入口增加 ZAP/Nuclei；Actions 增加 zizmor。

只有通过测试、扫描、签名和策略验证的 image digest 才能进入集群。

## 六、必须补齐的领域模型与不变量

| 领域 | 目标模型 |
|---|---|
| 商品 | Product、SKU、Listing、Offer、PriceBook |
| 结算 | Cart、Quote、CheckoutSession；价格和优惠使用签名快照 |
| 订单 | OrderGroup、MerchantOrder、OrderLine |
| 支付 | PaymentIntent、PaymentAttempt、Authorization、Capture、Refund |
| 财务 | Ledger、LedgerEntry、Account、Payout |
| 库存 | StockItem、StockLedger、Reservation、Allocation |
| 履约 | FulfillmentOrder、Shipment、Package、TrackingEvent、Return |
| 商家 | Merchant、Store、MerchantMember、SettlementAccount |
| 事件 | EventEnvelope、Outbox、Inbox、ProjectionCheckpoint |
| 审计 | Actor、Action、Resource、Before/After、Reason、TraceID |

必须由数据库约束、状态机、property-based/state-machine test 或模型检查固定的不变量：

- 可用库存永不小于零；
- 同一个幂等键最多产生一个业务结果；
- Capture 合计不得超过 Authorization；
- Refund 合计不得超过已 Capture 金额；
- 双重记账每笔 transaction 的借贷合计为零；
- 订单状态只能沿允许的状态机边迁移；
- 商家只能读取和修改归属于自身的对象；
- 搜索、缓存、消息和报表都不是交易真相源。

库存预占、支付确认、超时取消与重复消息组合优先使用 property-based/state-machine test；状态空间难以穷举时评估 TLA+/PlusCal。

## 七、工程原则

- DDD bounded context 按一致性和语言拆分，不按页面或数据库表拆分。
- Deep Module 把复杂性藏在小 interface 后，例如 PaymentPort、ObjectStore、SearchCatalog。
- Ports and Adapters 隔离支付、对象存储和搜索实现。
- CQRS 只用于搜索、报表等读模型，不把所有 CRUD 事件化。
- Outbox + Inbox 提供 at-least-once 下的事务发布意图与消费幂等。
- Order 内置 Saga Process Manager 显式编排同步强一致核心步骤与逆向补偿；阶段性终态通过 Kafka 编舞解耦副作用。
- 资金、库存、积分采用不可变 ledger，不只保存余额。
- Bulkhead/Cell 隔离故障；backpressure/load shedding 在容量上限前主动拒绝。
- SLO/error budget 决定可靠性投资；RTO/RPO 必须通过恢复演练，不由备份存在性推断。
- 数据库、proto 和事件 schema 统一走 expand-contract。
- structcheck、Buf breaking、policy test 和容量 gate 是 architecture fitness functions。
- 每个上线能力都要通过 Production Readiness Review，而不是以「代码合并」代替生产就绪。

## 八、分阶段路线

### P0：生产前必须完成

1. 交易闭环与数据库不变量；
2. 用户/商家归属校验；
3. PostgreSQL HA、PITR 和恢复演练；
4. session 与业务 cache 故障域隔离；
5. Cilium default-deny 与 gateway-only；
6. GitOps 真相源统一；
7. 外部告警、resolved 通知和值班闭环；
8. 固定数据集、capacity profile、k6 基线和成本报告；
9. 外部 Kafka、Outbox/Inbox、DLQ、重放与积压恢复；存量 NATS 搜索链在切流验证前保留；
10. 核心旅程 SLO、Runbook 和故障演练。

### P1：业务增长后

- CDN、图片处理与 consumer SSR/SSG；
- ClickHouse 分析平台；
- KEDA/HPA、Argo Rollouts 和自动容量验证；
- OpenFeature/Unleash；
- Pyroscope、Hubble、Tetragon；
- 商家子账号、履约、售后、结算与双重记账；
- SBOM、签名、Kyverno；
- 分区、冷热归档和成本治理。

### P2：只由证据触发

| 能力 | 触发条件 |
|---|---|
| Temporal | 长流程、定时器、人工等待和补偿数量失控 |
| Citus/分片 | 单 PostgreSQL 经过索引、分区、缓存和查询优化后仍不达标 |
| SPIFFE/SPIRE | 确实需要独立 east-west workload identity |
| Cell Architecture | 单集群故障域或租户噪声无法接受 |
| 多区域 active-active | 业务 RTO 明确无法由 active-passive 满足 |
| Backstage | 服务和 owner 数量使人工目录明显失控 |

## 九、Production Readiness Review 验收

每个核心服务或链路上线前必须提供：

- owner、依赖和故障域；
- 业务不变量与自动化测试；
- SLI、SLO、错误预算和 burn-rate 告警；
- capacity profile、压测结果、饱和点和 N+1 余量；
- timeout、backpressure、retry budget、幂等与降级策略；
- 数据分类、租户隔离和最小权限；
- backup、PITR、RTO/RPO 与最近一次恢复证据；
- deploy、canary、rollback 和 schema expand-contract 手顺；
- dashboard、critical alert、Runbook、firing/resolved 通知证据；
- 单位成本、保留期和扩容成本；
- 已知风险、豁免 owner 和到期时间。

没有证据的能力只能标为「设计中」或「已实现未验收」，不能标为生产就绪。

## 十、明确不做

- 不因「中大型项目都使用」而引入 TECH.md 未定稿的其他基础设施；Kafka 已是目标事件主干，但接线仍须遵守证据门禁。
- 不把全部业务改成 Event Sourcing。
- 不为履约、营销、结算和分析的每个名词立即创建微服务。
- 不在没有明确 RTO 的情况下建设多区域 active-active。
- 不用 service mesh 代替 NetworkPolicy、身份和授权模型。
- 不在单 PostgreSQL 未充分优化前切换分布式数据库。
- 不让 HPA、VPA、KEDA 无规则控制同一 workload。
- 不在缺少幂等和容量预算时开启自动重试。
- 不把缓存、搜索、消息队列或 ClickHouse 当作交易真相源。
- 不让核心数据库和观测数据面长期依赖临时公网隧道。

当前最优先的投资是交易模型、安全边界、容量证据和恢复能力。新增组件必须减少已证明的风险或成本，而不是增加项目的表面复杂度。
