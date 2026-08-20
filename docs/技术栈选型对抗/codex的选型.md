# Codex 技术选型调研与建议

> 状态：临时对抗结论，不是已落地的技术栈真相源。
>
> 本文根据 [`TECH-RADAR.md`](../TECH-RADAR.md)、[`TODO.md`](../../TODO.md)、[`STACK.md`](../../STACK.md)、[`.service-matrix.yaml`](../../.service-matrix.yaml)、[`DEVOPS.md`](../DEVOPS.md)、相关设计文档、只读集群核验，以及官方文档和公开生态资料形成。正式采纳后，应将结论分别回填技术栈、实施待办和拓扑真相源，而不是只保留在本文。

## 结论摘要

不建议把雷达中的所有候选项同时引入。推荐的目标是「轻量 Go 优先、少建重复数据面、先补可靠性和安全性、再扩展吞吐与分析能力」。

推荐的目标组合：

```text
CNPG + TLS Redis + Meilisearch Community Edition
+ CloudEvents/Protobuf + SQL Outbox + NATS JetStream
+ Kubernetes Service DNS + Cilium Gateway + 现有 Kratos Gateway
+ trust-manager + Vector + VictoriaLogs
+ KEDA + k6 + Argo Rollouts
+ CNPG Barman Cloud Plugin + Velero + SeaweedFS
+ Trivy + Cosign + Kyverno + Tetragon
+ OpenFeature + flagd
```

这不是「立刻全部部署」的清单。当前集群和业务正确性状态决定了其中一部分只能先试点，尤其是 NATS、KEDA、Argo Rollouts、OpenFGA 和 Tetragon。

## 调研方法和判定口径

### 指标

| 指标 | 判定方法 |
|---|---|
| 高性能 | 优先看架构是否减少进程、网络跳数、JVM 和不必要的数据复制；厂商倍数基准只作线索，最终必须在本项目负载下测量。 |
| Go 支持度 | 优先 Go 实现或官方、活跃、惯用的 Go SDK；核心引擎不是 Go 也可以入选，例如 ClickHouse，但必须有明确性能收益和成熟 Go 接入。 |
| 广泛使用 | 以 CNCF 治理/成熟度、公开生产采用案例、稳定发布、维护者分散度为主；GitHub star 和 commit 数只作辅助健康信号。 |
| 许可证 | 作为一票否决或条件项。不能把 BSL、AGPL、GPL、Fair Source 等工具误写成无条件开源组件。 |
| 项目适配 | 必须服从当前 Go、Connect RPC、Cilium、Kubernetes、CNPG、Config Center 和关系型 Outbox 的既有设计。 |

### 当前现实校验

本次只读核验得到的关键事实：

- 集群当前只有两个 `arm64` 节点，默认 StorageClass 是 `openebs-lvm`。
- CNPG 的 `pg-main` 当前为单实例、单 Ready 实例；它是已采用的 PostgreSQL 形态，但不是节点故障可容忍的 HA 部署。
- 当前缓存实际运行 `redis:8.10.0`，不是旧文档中的 DragonflyDB。
- [`TODO.md`](../../TODO.md) 已记录 PostgreSQL 切到集群内 CNPG、Elasticsearch 和 Kafka 不再是可用数据面、Meilisearch 已安装并等待服务适配。
- [`STACK.md`](../../STACK.md)、[`.service-matrix.yaml`](../../.service-matrix.yaml) 和雷达存在旧集群遗留描述；它们在实施前必须对齐，否则后续选型会基于错误前提。
- `MinIO` 上游仓库已归档，因此对象存储迁移已不是单纯观察项。

这意味着：任何声称「三副本 HA」「高可用消息总线」「复制块存储」的方案，在第三故障域、独立存储和恢复演练到位前，都只能视为目标态。

## 分层决策

状态含义：✅ 已确认或既成事实；▶ 采纳方向；🧪 先试点；⏸ 暂缓；❌ 不选。

| 层 | 主结论 | 组合方式和边界 | 理由 |
|---|---|---|---|
| §1 消息 / 事件流 | 🧪 `NATS JetStream` | `NATS + CloudEvents + Protobuf + SQL Outbox Relay + KEDA`；原始 CDC 才使用嵌入式 `pgstream`。 | Go 原生客户端、Apache-2.0、持久化/重放/至少一次投递语义完整，资源脚印适合小集群。关键交易事件必须等待三节点奇数仲裁和故障演练后再接入。 |
| §1 备选 | ⏸ `Redpanda` | 与 NATS 二选一，不要双主事件总线。 | 只在 Kafka 协议、长期回放、Kafka 生态或第三方集成是刚需时选择。Community Edition 为 BSL source-available，且部分能力有 Enterprise 边界，不是默认最优。 |
| §2 门面搜索 | ✅ `Meilisearch Community Edition` | `Meili CE + Go Indexer`；索引更新接 Outbox/NATS 或 `pgstream`，不复活 Debezium+Kafka。 | 现有集群已经部署 Meili，且其 typo 容错、筛选、排序和 Go SDK 适合电商门面搜索。只使用 MIT 的 CE 功能，索引必须按可从 PostgreSQL 重建的派生数据设计。 |
| §2 向量 | ▶ Meili hybrid/vector，之后再评估 `pgvector` | 先验证 CNPG 镜像和扩展支持；真正出现大规模向量需求后才引入 `Qdrant`。 | 先避免新增有状态服务。`pg_search` 已不具备「Pigsty 自带、零新增组件」优势，只作为 Meili 路线失败时的回退。 |
| §3 主数据 / OLAP | ✅ 保留 CNPG；▶ `ClickHouse` | `CNPG + ClickHouse`；埋点先批量写 CH，业务表 CDC 成型后再评估 `PeerDB`。 | CNPG 已是事实，短期重点是副本、PITR、告警和恢复。Meili 不应承担聚合分析；GMV、漏斗、埋点和报表适合 ClickHouse，且有官方 Go 客户端。 |
| §4 身份 / 授权 / 证书 | ▶ `trust-manager`；🧪 `OpenFGA`；保留 Casdoor/Casbin | Casbin 留在网关做粗粒度路由 RBAC；OpenFGA 只负责商家-店铺-商品-操作员等资源关系授权。 | 不要把高频网关路径立刻改成远程 FGA 调用。OpenFGA 先以双跑、模型验证、缓存和可用性测试切入。trust-manager 可直接解决 CA bundle 分发和更新。 |
| §4 凭据 | ⏸ 先定治理，再选工具 | 若项目允许引入外部 Secret Store，可选 `OpenBao/云 KMS + External Secrets Operator`。 | 当前 [`AGENTS.md`](../../AGENTS.md) 禁止凭据进入仓库，并将凭据来源限定为 Config Center/本地环境。因此 SOPS 或 ESO 不是在现有规则下可直接采纳的普通工具替换。 |
| §5 网关 / 流量面 | ✅ Cilium Gateway API + 现有 Kratos Gateway | Cilium 管入口/LB；现有 Go 网关保留 JWT、身份头剥离、限流、转码和错误模型。 | 当前已有 Cilium/Envoy 数据路径，直接改 Envoy Gateway 会重写大量安全中间件。只有 k6 明确证明网关是瓶颈，才评估 Envoy Gateway + ext_authz。 |
| §6 服务发现 | ▶ Kubernetes Service DNS + Cilium KPR，退役 Consul | 网关逐路由从 `discovery:///` 灰度切到 ClusterIP Service DNS。 | 所有业务都在 Kubernetes，Consul 只剩注册发现且已有明文 gossip/TTL 盲窗风险。优先 Service DNS，不依赖未经生产验证的 Kratos Kubernetes registry。 |
| §7 弹性 / 调度 | ▶ `KEDA`；可选 OpenKruise `ImagePullJob` | KEDA 管异步消费者、队列积压和定时预热；VPA 只做资源建议/初始值，不能争夺同一控制环。 | KEDA 可接 VictoriaMetrics Prometheus API 和 JetStream scaler。订单、支付、网关等低延迟服务不得 scale-to-zero；NATS 未落地前，KEDA 也不应抢先部署。 |
| §8 可观测性 | ▶ `Vector`；目标存储为 `VictoriaLogs` | 迁移期 `Vector → Loki + VictoriaLogs` 双写；稳定后只保留一个主日志库。Jaeger 若为 v1，应先升级 v2；Pyroscope/Hubble 后续接入。 | Vector 的首要价值是可测试的 VRL PII 脱敏，解决现有 fluent-bit/Lua 脱敏失效问题。VictoriaLogs 在资源效率和 VictoriaMetrics 同族运维上更优，但必须用真实查询、资源和看板兼容性数据完成切换。 |
| §9 交付 / 构建 / 测试 | ▶ `k6`；🧪 `ko`；条件采用 Argo Rollouts | k6 先建立性能基线；ko 先与 Buildx 做镜像、SBOM、多架构一致性对比；无状态服务达到多副本和容量余量后启用 Rollouts。 | 高性能不能只看组件宣传。ko 很适合纯 Go、CGO 关闭的服务，并能默认产出 SPDX SBOM。两节点下 Spegel 仅可试装，不能成为关键依赖。 |
| §10 存储 / 备份 | ▶ CNPG Barman Cloud Plugin + Velero + SeaweedFS | CNPG/Barman 负责 PostgreSQL PITR；Velero FSB/Kopia 负责 K8s 资源和非 PG localPV；对象存储迁至 SeaweedFS 后再做异地镜像。 | Velero 文件备份不等于数据库一致性恢复。两节点 localPV 无法安全构成三副本仲裁，先保留 OpenEBS localPV；Longhorn/LINSTOR 等第三故障域后再评估。 |
| §11 安全 / 供应链 | ▶ `Trivy + Cosign + Kyverno`；🧪 `Tetragon` | CI 扫描、SBOM、签名和证明；Kyverno 先 Audit 后 Enforce；Tetragon 先观察再逐 workload 阻断。 | 扫描 → 签名 → 准入 → 运行时是一条完整闭环。所有 GitHub Actions 应使用 commit SHA 固定，而不是可变 tag。Tetragon 适合已有 Cilium，但不应第一天全局 enforce。 |
| §12 应用架构 | ▶ `OpenFeature + flagd`；❌ Dapr 作为 Outbox 底座 | OpenFeature 统一应用 API，flagd 管理求值；若不希望新进程，用 `GO Feature Flag` 的 Go 库模式。 | Dapr transactional outbox 仅覆盖 Dapr State API 的事务，不能覆盖当前 `sqlc + pgx` 的订单、多表、Outbox 同事务。Dapr 会增加 sidecar 和控制面，却不能替代既定一致性设计。Flipt v2 的 Fair Core License 也不适合作默认开放许可选项。 |

## 关键组合与排他关系

### 推荐组合

1. **默认的轻量 Go 组合**

   `Meili CE + CNPG + TLS Redis + CloudEvents/Outbox + NATS JetStream + Service DNS + Cilium/现有网关 + trust-manager + Vector/VictoriaLogs + KEDA + k6 + Velero/Barman + Trivy/Cosign/Kyverno + OpenFeature/flagd`

2. **Kafka 生态优先组合**

   只有 Kafka 客户端、长期保留回放、第三方 Kafka 平台和相应付费许可得到确认时，才用 `Redpanda + franz-go` 替换 NATS。其余层保持不变。

3. **资源关系授权组合**

   保留 `Casdoor + Casbin` 的认证与网关路由权限，引入 `OpenFGA` 只解决 B2B2C 资源关系授权。它不是全量替代，也不应未经双跑直接取代网关拦截器。

### 不应同时长期保留的组合

- `NATS JetStream` 与 `Redpanda`：只保留一个主事件总线。
- `Meilisearch` 与 `pg_search`：只保留一个门面搜索主实现。
- `Loki` 与 `VictoriaLogs`：双写只用于迁移验证，稳定后只保留一个主存储。
- Dapr transactional outbox 与现有关系型 Outbox：事务边界不匹配。
- LoxiLB 与 Cilium LB-IPAM/Gateway：会制造重叠数据面。
- HPA/KEDA 与 VPA：不能同时根据相同资源指标竞争同一个工作负载。
- SOPS/ESO 与当前凭据治理：未修改规则前，不应把它们写成已采纳方案。

## 暂缓或否决的项目

| 项目 | 结论 | 原因 |
|---|---|---|
| Dapr Outbox | ❌ | 与既定的 `pgx/sqlc` 关系型事务 Outbox 不兼容。 |
| LoxiLB | ❌ | Cilium 已提供 LB-IPAM、Gateway API 和 eBPF 数据路径，重复建设。 |
| Kmesh / Istio ambient / Linkerd | ⏸ | `.service-matrix.yaml` 中服务间依赖几乎未接线，当前没有足够东西向流量可治理。 |
| SPIRE / Cilium mutual authentication | ⏸ | 当前优先级是证书 bundle、网络加密和服务正确性；Cilium mutual authentication 仍不适合作生产 mTLS 基础。 |
| Karpenter | ⏸ | 自建固定两节点集群缺少按需节点供给能力，收益有限。 |
| Longhorn / LINSTOR / Rook-Ceph | ⏸ | 两节点不能形成安全的复制存储仲裁；先增加第三故障域并完成恢复演练。 |
| ParadeDB pg_search | ⏸ | 当前 Meilisearch 已部署；在 CNPG 下引入 pg_search 需要自定义镜像、预加载配置和升级运维，不再是低成本路线。 |
| Typesense | ⏸ | 可作为 Meili 的 HA 要求备选，但 GPL、中文能力和现有迁移成本使其不适合作默认。 |
| Quickwit | ⏸ | 更接近日志/追踪检索，不适合当前电商门面搜索主位。 |
| Spegel | 🧪 | 两节点 P2P 收益有限，且支持定位偏 home-lab/best-effort；仅可无损试装，需保留直连镜像仓库回退。 |

## 许可证和事实核查发现

| 项目 | 需要写入雷达的约束 |
|---|---|
| Redpanda | Community Edition 为 BSL source-available；不能表述为无条件 Apache/MIT 开源。 |
| Meilisearch | Community Edition 为 MIT；Enterprise Edition 的 sharding 等功能受 BUSL 边界约束。 |
| Flipt v2 | 为 Fair Core License，不是默认 OSS 选项；SDK 仍可为 MIT。 |
| ParadeDB | AGPL，应显式写出。 |
| Zitadel v3+ | 已转 AGPL，不能沿用旧的 Apache 认知。 |
| Typesense | GPL，应显式写出。 |
| k6 | 核心为 AGPL；自托管内部使用与再分发义务需要分别评估。 |
| MinIO | 上游仓库已归档，应建立 SeaweedFS 等迁移计划。 |

所有雷达中的「高若干倍」「尾延迟低一个数量级」之类表述，必须标记为厂商或第三方基准，并补本项目的可复现压测结果。不能把宣传图表当作最终选型依据。

## 建议的实施顺序

1. **先处理 P0/P1，而不是先换中间件**：修公网凭据、地址越权、PII 脱敏、订单/库存假成功等问题。
2. **对齐真相源**：将当前 CNPG、Redis、Meilisearch、Kafka/ES 状态同步到 `STACK.md`、`.service-matrix.yaml` 和雷达；改 matrix 后运行 structcheck。
3. **先补数据恢复能力**：CNPG PITR、独立对象存储、恢复演练、CNPG 指标和告警、CA bundle 分发。
4. **收尾搜索迁移**：完成 Meilisearch Go 客户端适配、真实商品相关性验收、可重建索引演练；索引管道改为 Outbox/NATS 或 pgstream，不能依赖已经消失的 Kafka/Debezium 前提。
5. **采纳事件契约，试点消息总线**：先 CloudEvents/Protobuf/Outbox，再用非关键消费者试点 NATS；第三故障域后才接交易领域事件。
6. **重建可观测与性能基线**：先用 Vector 的测试覆盖 PII 脱敏，再双写验证 VictoriaLogs；用 k6 建立网关、搜索、订单、库存和异步消费者的压测基线。
7. **最后进行弹性和渐进交付**：KEDA、Argo Rollouts、ko、Tetragon 都应在多副本、资源余量、回滚和监控条件具备后上线。

## 最小验收矩阵

| 场景 | 需要验证的结论 |
|---|---|
| NATS JetStream | 真实事件大小、并发、幂等消费、重投、节点故障、恢复后顺序和积压清理。 |
| Meilisearch | 中文搜索、错别字、筛选、排序、重建索引、内存/磁盘占用、与旧结果的人工相关性抽检。 |
| CNPG / 备份 | Base backup、WAL、PITR、新集群恢复、应用连接恢复、RPO/RTO 记录。 |
| Vector / VictoriaLogs | PII 反例脱敏测试、日志不丢失/不重复、看板查询兼容性、资源曲线和回滚。 |
| 网关 / Cilium | k6 下的吞吐、P95/P99、CPU、连接数、限流和认证语义不回退。 |
| KEDA / Rollouts | 事件滞后扩缩、不会对关键入口 scale-to-zero、金丝雀指标异常能自动回滚。 |
| 供应链 | 未签名镜像、旧 digest、高危漏洞和错误 Action SHA 的正反例都被 CI/准入拦截。 |

## 主要外部证据

### 事件与数据

- [NATS JetStream 概念与投递语义](https://docs.nats.io/concepts/jetstream)
- [JetStream 集群和奇数仲裁要求](https://docs.nats.io/learn/topologies/jetstream-in-a-cluster)
- [Redpanda 许可与 Enterprise 功能边界](https://docs.redpanda.com/streaming/current/get-started/licensing/overview/)
- [Meilisearch Community / Enterprise 版本边界](https://www.meilisearch.com/docs/resources/self_hosting/enterprise_edition)
- [CloudNativePG 恢复与 Barman Cloud Plugin](https://cloudnative-pg.io/documentation/current/recovery/)
- [ClickHouse 官方 Go 客户端](https://clickhouse.com/docs/integrations/language-clients/go)

### 身份、网络与交付

- [OpenFGA 的公开生产采用案例](https://openfga.dev/docs/adopters)
- [trust-manager 的 CA bundle 分发模型](https://cert-manager.io/docs/trust/trust-manager/)
- [Cilium Gateway API 支持情况](https://docs.cilium.io/en/latest/network/servicemesh/gateway-api/gateway-api/)
- [KEDA Prometheus scaler](https://keda.sh/docs/2.20/scalers/prometheus/)
- [KEDA NATS JetStream scaler](https://keda.sh/docs/2.20/scalers/nats-jetstream/)
- [ko 默认生成 SPDX SBOM](https://ko.build/features/sboms/)

### 可观测性、备份与安全

- [Vector 在 Kubernetes 的采集、变换和恢复语义](https://vector.dev/docs/setup/installation/platforms/kubernetes/)
- [VictoriaLogs 部署与能力说明](https://docs.victoriametrics.com/victorialogs/)
- [Velero 文件系统备份的适用范围和限制](https://velero.io/docs/main/file-system-backup/)
- [Kyverno verifyImages 与 Cosign 集成](https://kyverno.io/docs/policy-types/cluster-policy/verify-images/)
- [Dapr transactional outbox 的 State API 前提](https://docs.dapr.io/developing-applications/building-blocks/state-management/howto-outbox/)
- [Flipt v2 的 Fair Core License](https://docs.flipt.io/v2/licensing)
- [MinIO 上游仓库状态](https://github.com/minio/minio)
- [SeaweedFS 项目与发布状态](https://github.com/seaweedfs/seaweedfs)
