# 技术雷达 — CNCF Landscape 选型评估（2026-08-20 定稿）

> **本文件不是进度真相源**。它是选型评估清单的**定稿版**：
> 逐项讨论 → 回填结论 → 定稿项落进对应真相源（选型进 [`STACK.md`](../STACK.md)、待办进 [`TODO.md`](../TODO.md)、CI/交付类并入 [`docs/DEVOPS.md`](DEVOPS.md)）后，本文件对应行只留结论与指针。
>
> **⭐ 定稿记录（2026-08-20）**：全部条目经**三轮异构对抗评审**定稿——claude 主稿 × codex（gpt-5.6-terra）× claude2 三方独立调研，8 个分歧逐项裁决、5 个环境议题收敛、3 份实施稿过红队验收。过程与证据：[`技术栈选型对抗/`](技术栈选型对抗/)（三份立场稿 + 三轮审阅表）。
> **环境前提（用户设定，2026-08-20）**：集群 = 3 台同宿主 Mac(M2 Max 32G) 的 PD 虚拟机（arm64 Ubuntu 26.04，各 4c/6.5G）——**quorum 可凑、物理故障域=1**，异地备份是硬前提；线上仅 2 台低可用 docker 机（4c4G=备份靶、2c2G=哨兵，均不载业务）。
> **用户直接拍板项**：ClickHouse 单节点、网关保持自研/不上网格/LB 走 Cilium 零新增、VictoriaLogs 替 Loki + Vector、OpenFGA 添加、trust-manager 添加。
>
> **后续决策覆盖（2026-08-27）**：为建设百万/千万级生产项目并学习企业常用事件平台，重新采用 Apache Kafka。Kafka/KRaft/Strimzi/franz-go 成为目标栈，NATS 仅保留迁移期当前搜索链，完成 Kafka 业务链后目标退役。§1 原 NATS 论证保留为历史决策证据，不再代表目标态；详见 [生产目标与 Kafka 路线](design/platform/production-scale-goal.md)。
> **后续决策覆盖（2026-08-28）**：本文件的现状记录与历史选型论证继续保留，但目标态统一以 [docs/TECH.md](TECH.md) 为准：搜索迁回 Elasticsearch（推翻 §2 Meilisearch 定稿——当年 ES 退役主因是节点内存预算不足，资源条件现已满足，性能局限解除，聚合分析缺口一并解决），Jaeger 改为 VictoriaTraces，SeaweedFS 迁移改为 Silo，CNPG 改为外部 Pigsty，网关 Casbin 改为 OpenFGA；Kafka 部署于非 K8s 独立集群；错误监控维持现役 Bugsink（同日复核推翻「GlitchTip 取代」——GlitchTip 转为条件采纳，触发条件见 TECH.md §11.3）。制品分工（同日用户定稿）：TCR 为主镜像仓库（集群直连拉取），Harbor 存储 Helm 制品（OCI），GHCR 可选双存（镜像+Helm）、是否推送由 CI 按网络决定。开发内环已收口为 mirrord mirror + Okteto 接管，前端本地状态已迁 Zustand；Tetragon `1.7.1` 已三节点落地并完成 VictoriaLogs/VictoriaMetrics/vmalert 告警闭环，保持 audit-only，enforcement 待独立评估。
>
> **来源与方法**：2026-08-20 抓取 <https://landscape.cncf.io/> 全量数据（2409 条目），排除会员公司条目、纯托管服务、已归档项目，并按当时约束排除 Java 实现；2026-08-27 起 Kafka/Strimzi/Debezium/Kafka Connect 是事件平台的明确例外。对抗轮另做 GitHub API 实测（stars/推送/许可证/归档）与集群实地核验。
> **评估基线订正**：本行保留 2026-08-20 的集群现状记录；目标态已由 [docs/TECH.md](TECH.md) 覆盖：Dragonfly 为定稿缓存并按 Session／Cache／限流强制分实例隔离，PostgreSQL 定稿为外部 Pigsty，集群内 CNPG 仅为存量休眠资源。其余不动件维持：Cilium netkit/BBR/KPR、VictoriaMetrics、connect-go、quic-go、sqlc+pgx、OTel、ArgoCD ApplicationSet。
>
> **状态标记**：✅ 采纳（写明落点）· 🟡 观察/试验（写明触发条件）· ❌ 否决（写明原因）。**本版无 ⬜。**

---

## 总览与定稿速查

| 节 | 领域 | 定稿结论 |
|---|---|---|
| §1 | 消息 / 事件流 | ✅ Apache Kafka 为唯一领域事件主干，部署于非 K8s 独立集群；Outbox+Relay（`acks=all` 后标 `published`）+ Inbox 幂等 + 失败超 5 次转 DLQ；NATS 为存量迁移链路 |
| §2 | 搜索 | ✅ Elasticsearch 只读 Projection，隐藏于 `SearchCatalog` 接口后并支持从 PG 全量重建；Meilisearch 为存量实现、迁移中 |
| §3 | 数据层 | ✅ PostgreSQL 外部 Pigsty（Patroni Failover + PgBouncer，UUIDv7 默认主键）；CNPG 仅为存量休眠资源；ClickHouse 🟡 触发式缓上（2026-08-20 拍板人复审改判，见 §3.2） |
| §4 | 身份 / 授权 / 凭据 | ✅ Casdoor 有状态 Session（Dragonfly Session Store）+ OpenFGA 网关关系授权；粗粒度角色归 Casdoor，对象级授权归 OpenFGA；trust-manager + ESO+OpenBao + SOPS 保留 |
| §5 | 网关与流量面 | ✅ 自研 control-tower + Cilium Gateway API（TLS 终止、eBPF KPR 严格模式）+ Pangolin 公网入口，不叠加 WireGuard/IPsec 隧道；Cilium Service Mesh 评估中 |
| §6 | 服务发现 | ✅ Consul 退役 → 生产 K8s Service + CoreDNS；Docker Compose 定位 pre 半生产测试；开发内环（mirrord/Okteto）重新评估中 |
| §7 | 弹性 / 调度 | ✅ HPA 管在线服务，KEDA 以 Kafka lag（`lagThreshold: "50"`）管消费者，两者不控同一资源 |
| §8 | 可观测性 | ✅ VictoriaLogs / VictoriaMetrics / VictoriaTraces 三存储；外置 OTel Collector 处理尾采样、PII 脱敏与噪声清洗，集群内仅轻量采集 |
| §9 | 交付 / 构建 / 测试 | ✅ Docker Buildx + GitHub Actions + Renovate 为构建主链；k6 保留，ko 降为存量决策；mirrord 随开发内环重评（评估中） |
| §10 | 存储 / 备份 | ✅ Silo（基于 MinIO）为 S3 兼容对象存储，开启 Versioning + Lifecycle 并使用预签名 URL；SeaweedFS 不再是迁移方向 |
| §11 | 安全 / 供应链 | 🟡 Cosign、Syft、Kyverno、Trivy、Grype、Gitleaks、zizmor 分阶段采用；制品分工=TCR 主镜像仓库 + Harbor 存 Helm 制品 + GHCR 可选双存（CI 按网络决定）；✅ Tetragon 三节点 audit-only 观察与告警闭环已落地，enforcement 待评估 |
| §12 | 应用架构 | ❌ Dapr；✅ OpenFeature（引擎=Config Center provider 首选）；Next.js 评估中，Temporal 待触发（P2），Kafka Streams/ksqlDB 评估中 |

**快速导航**：执行顺序 → 见文末「优先级建议（定稿版）」；实施细化三稿（casdoor 迁移 / mirrord PoC / CI 供应链）→ [`技术栈选型对抗/对抗审阅表-第3轮.md`](技术栈选型对抗/对抗审阅表-第3轮.md)。

---

## §1 消息 / 事件流 — Kafka 目标态与 NATS 历史决策

**当前事实**：NATS JetStream、relay 与 search indexer 在运行；node3 有 Kafka/SCRAM/topic，本仓已有未部署的 Kafka producer Adapter、destination delivery migration/relay 与持久增量 cursor，但业务 producer/consumer 仍为零。**目标态**：Kafka 成为持久领域事件主干，先迁可重建搜索投影，再迁交易事件，最后退役 NATS 业务流。

| # | 状态 | 工具 | 语言 | CNCF | 定位 | 结论 |
|---|---|---|---|---|---|---|
| 1.0 | ✅ | **Apache Kafka** | Java + Go client | — | 唯一领域事件主干 | **后续决策覆盖（2026-08-28）**：部署于非 K8s 独立集群，不采用 Strimzi；Topic 按限界上下文划分，Partition Key=`aggregate_id`，事件使用 Protobuf + Buf Schema Registry。Outbox Relay 仅在 `acks=all` 后标记 `published`，Inbox 以 `(consumer_group,event_id)` 唯一键幂等，连续失败超过 5 次转投 DLQ 并告警。NATS 仅为存量迁移链路。落地与迁移门禁见 [目标文档](design/platform/production-scale-goal.md) |
| 1.1 | ❌ | Redpanda | C++ | 收录 | 对抗对照组 | **否决（对抗第 1 轮）**：BSL 源可用非开源；无存量 Kafka 消费者使「协议兼容」价值为零；Seastar 每节点 2GB+ 脚印不适配 6.5G 节点。翻盘三条件（行为数据必须走流式主干 + 需现成 Kafka 连接器生态 + 两年内大流量回放）经对抗验证均不成立 |
| 1.2 | 🟡 | **NATS / JetStream** | Go | incubating | 迁移期当前实现 | 3-server/R1 ECOMMERCE_EVENTS、relay 和 search indexer 已运行；不再接新领域事件。Kafka 搜索链和交易链验收后目标退役，原主选型论证保留在下节作历史证据 |
| 1.3 | ❌ | Fluvio | Rust | 收录 | 前沿流平台 | 否决：无官方 Go 客户端（社区 fluvio-go 15⭐ 停更 2021）；v0.18.1 后一年无 release，母司转向商业产品 |
| 1.4 | ❌ | Tremor | Rust | sandbox | 事件预处理 | 否决：项目实质死亡（52 周 0 commit，团队解散）；定位由 Vector 与 Numaflow 覆盖 |
| 1.5 | 🟡 | Numaflow | Go | 收录 | K8s 原生流处理 | 观察：v1.8.3 活跃、JetStream source 同族；Intuit 单厂商 + CRD 控制面对单人过重。**触发条件 = 埋点实时加工（清洗/特征→gorse）需求落地** |
| 1.6 | ✅ | **CloudEvents** | 规范 | graduated | 领域事件信封 | 采纳维持：binary mode + protobuf event format；事件定义为 proto 进 buf 作事件目录唯一真相源；outbox 表列按 CE 属性设计，幂等键 `(source,id)`，`traceparent` 接 OTel；`type` reverse-DNS 过去式、`id` UUIDv7；金额类型借事件契约一次定死。CDC 流不 CE 化（双轨纪律）。SDK 用官方 `nats_jetstream/v3` |
| 1.7 | ❌ | Drasi | Rust 为主 | sandbox | 变更即触发 | 否决：无场景且 sandbox 早期；需要「持续查询」场景时再评 |
| 1.8 | ✅ | 搬运层：**outbox + 自写 relay** | — | ⚠️仓外 | 替 Debezium | 定稿：自写 relay（复用 Config Center pg_notify 全套经验，约 200 行零新组件）＞ pgstream 库嵌入（Apache-2.0 活跃，需 WAL 断点续传时升级）＞ Sequin（**停更实锤**：2026-02 起零推送，❌）。配置式管道如需要用 **Bento（MIT）** 而非许可证混杂的 Redpanda Connect |

Kafka/Strimzi/Debezium/Kafka Connect 是 Java 例外；AutoMQ、RocketMQ、Pulsar、EventMesh 仍未采用。

### §1 历史选型论证（2026-08-20 NATS 决策存档，已被 2026-08-27 目标覆盖）

> **定稿附记**：本节为初选论证存档。对抗评审结论——四条主论据全部成立；自认弱点 1（CDC 出口窄）确认不成立（自写 relay 定稿）；弱点 2（非数据主干）由「分析线 NATS 表引擎/批量直入 ClickHouse，不过消息层」化解；弱点 3（subject 顺序）落 `consistency.md` 显式设计；出题清单余项（fsync 表现、LTS 选线、KV 边界腐蚀）转为落地验收项进 TODO。**KEDA 不等 NATS**（cron/prometheus scaler 先行即有价值，第 2 轮裁决）。

**四块拼图**（完整事件架构 = MQ 只是其中一块）：

```
   【①原子性】                【②搬运】                【③传输/存储 = MQ 本体】      【④信封】
业务事务 ─┬─ 业务表
          └─ outbox 表 ──▶ relay 进程 ──────────▶ NATS JetStream ──────▶ 消费者（幂等处理）
          （同事务写入，      （自写，pg_notify 唤醒；     （持久化/重试/死信/         （CloudEvents/proto，
            永不丢事件）        备选 pgstream 库嵌入）      Msg-Id 去重）               traceparent 接 OTel）
```

**选 NATS 的四条主论据**：①资源脚印（3 节点 <200MB vs Redpanda 每节点 2GB+）在 6.5G 节点上是可行性差异；②语义与 `consistency.md` 一一对应（`Nats-Msg-Id` 幂等、durable consumer ack/nak/max-deliver、behavior 伪 outbox 退役）；③全 Go 同族（可读源码、进程内测试实例、TLS 挂 `global-ca-issuer`）；④配套齐（helm/NACK CRD 进 GitOps、KEDA scaler、Numaflow ISB 同族）。

**落地接线**：helm 3 副本 + file storage（PVC=OpenEBS LVM）→ NACK CRD 声明 `ORDERS`/`BEHAVIOR` stream → relay 按 `consistency.md`（publish 带 `Nats-Msg-Id=outbox_id`）→ durable pull consumer + KEDA 按 pending 扩缩 → OTel `traceparent` 手工传播 → 季度演练：`prlctl stop` 单 VM 验选主 + outbox 重放。

---

## §2 搜索 — 替换 Elasticsearch(Java)

**现状订正（2026-08-21）**：ES 已退役；search 查询端已迁移到 **Meilisearch v1.53**（`search/meilisearch:7700`），address 已清理无效 ES 依赖，两项服务均恢复 Ready。dev 集群已部署 3 节点 JetStream、R1 `ECOMMERCE_EVENTS`、relay 和 indexer，并完成 7 个示例 SPU 回灌与 outbox 重放验证。Product Service 尚无商品写 RPC，事务内 outbox 生产者、NATS TLS/客户端认证和 NACK CRD 仍待落地。

| # | 状态 | 工具 | 语言 | 来源 | 结论 |
|---|---|---|---|---|---|
| 2.1 | ❌ | Quickwit | Rust | 收录 | 否决于 §2，转介 §8 备选：定位是 observability 检索，无 typo/facet/即时搜索；Datadog 收购后 AGPL→Apache-2.0 兑现、v0.9.0 仍活但节奏放缓计入减分 |
| 2.2 | 🟡 | **Meilisearch** | Rust | ⚠️仓外 | 本行保留存量实现与历史评估。**后续决策覆盖（2026-08-28）**：本节结论已被 [docs/TECH.md](TECH.md) 覆盖：Elasticsearch 定稿为只读 Projection，隐藏于 `SearchCatalog` 接口后并支持从 PG 全量重建；Meilisearch 为存量实现，按目标态迁回 Elasticsearch。 |
| 2.3 | ❌ | Typesense | C++ | ⚠️仓外 | 否决（对抗第 1 轮 captain 自我改判定稿）：其 OSS raft HA 优势在「3 VM 同宿主 Mac」下无法兑现真容灾，且 2 节点起步组不成奇数仲裁；GPL-3.0；Meili 已部署为既成事实。**翻盘条件 = HA 成硬需求且有 ≥3 物理故障域** |
| 2.4 | 🟡 | ParadeDB (pg_search) | Rust | ⚠️仓外 | 降权观察：AGPL-3.0；Pigsty 关机后「零成本装扩展」前提消失（CNPG 下需自定义镜像+preload+升级运维）。触发条件 = Meili 路线失败的回退位 |
| 2.5 | ✅ | 向量：**pgvector 起步** + Qdrant 规模位 | — | 收录 | **定稿（对抗第 2 轮 D4 组合裁决）**：pgvector 为权威 embedding 存储——**CNPG 官方 standard 操作数镜像已内置 pgvector**（换 imageName + `CREATE EXTENSION`，零自定义镜像；落地时实证版本）；Meili hybrid（userProvided 向量）作召回展示层。**Qdrant 🟡 触发条件** = embedding 数百万级或 HNSW 挤压交易库（34k⭐/Apache-2.0/官方 Go client 同版发布）。Milvus/LanceDB ❌ 规模不符 |
| 2.6 | ❌ | Vald | Go | 收录 | 否决：超大规模位无场景，更新慢（v1.7.17@2025-07） |

---

## §3 数据层

**现状订正（2026-08-20）**：PG 已迁**集群内 CNPG `pg-main`**（单实例，Pigsty 已关机退役）；每服务一 schema、TLS verify-full 延续；埋点无独立分析存储。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 3.1 | 🟡 | **CloudNativePG** | Go | sandbox（incubation 尽调中） | 本行保留集群存量事实与历史补强方案。**后续决策覆盖（2026-08-28）**：本节结论已被 [docs/TECH.md](TECH.md) 覆盖：PostgreSQL 定稿为外部物理机／VM 上的 Pigsty，使用 Patroni 自动 Failover、PgBouncer 并默认采用 UUIDv7 主键；CNPG 仅为存量休眠资源。 |
| 3.2 | 🟡 | **ClickHouse** | C++ | 收录 | **触发式缓上（2026-08-20 拍板人复审改判，原「单节点常驻」撤回）**：复审账——分析消费者 0（埋点落 PG `behaviors.events`、CH 全仓零接线）、1–2Gi 是预算表唯一零消费者常驻大户（N3 节点份额 20–40%）、「断代可重放」使「先装避免回填」不成立；⓪ 测试环境已验证（SQL 通、帽 1.2G）故缓上零风险、拉起零摸索。原触发条件（任一）：①第一个真实分析需求（报表/漏斗/商品统计）②`behaviors.events` 千万行级或分析查询可测影响交易库 ③gorse 特征加工需流式清洗。触发后照抄原形态：单节点 @与 PG 主错开节点、`max_server_memory` 2G 顶格、localPV SSD、批量摄入（原「NATS 表引擎」随事件主干定稿 Kafka 作废）、历史自 PG/Kafka 回灌。基础数据存档：49k⭐/Apache-2.0/clickhouse-go v2.48。**后续决策覆盖（2026-08-28）**：新增 DuckDB（TECH.md B 表，采纳试点）承接原触发条件①②的第一响应——真实分析需求先用零常驻 DuckDB 跑批（PG 增量导出 Parquet 落 Silo）验证与承载；**CH 触发条件升级为服务化信号（任一）**：持续摄取、秒级新鲜度、多用户并发在线切片、DuckDB 批处理窗口/预计算不能满足 SLA。原条件③归流处理触发项（§1 RisingWave 条款）。clickhouse-local/chdb 保留为未来 CH 迁移验证工具。评估：`reports/2026-08-28-duckdb-evaluation.md` |
| 3.3 | ❌ | GreptimeDB | Rust | 收录 | 否决：2026 年才推进 v1.0 GA、主轴偏时序，广泛使用不及 CH |
| 3.4 | ❌ | Databend | Rust | 收录 | 否决：仓库许可证 NOASSERTION 未澄清，不进核心路径 |
| 3.5 | 🟡 | Multigres | Go | 收录 | 观察：PG 水平分片的未来答案，规模远未到 |
| 3.6 | 🟡 | YugabyteDB / CockroachDB | — | 收录 | 观察：分布式 PG 路线，规模到了再议（CRDB 许可已非开源） |
| 3.7 | ❌ | Valkey | C | 收录 | 备选记录不引进。**行内订正（2026-08-20 二次更新）**：缓存主力已切回 **Dragonfly 原生 TLS**（`dragonfly.dragonfly.svc:6379` 单口 TLS-only，cert-manager 签发，密码与 redis 组件同源使切换 host-only；明文/TLS 三段冒烟+10 服务 healthz 实证）；redis 组件降回技术验证位并已关停留备。切换踩坑沉淀：config 域 experience `config-center-self-bootstrap-blindspot` |

**附**：PeerDB（PG→CH CDC，AGPL，v0.37.4 活跃）🟡——CH 基线稳定后 PoC（验证 PG 版本/DDL/TOAST/断点恢复）。

---

## §4 身份 / 授权 / 证书 / 凭据

**现状**：Casdoor(Go，已走 Pangolin HTTPS，8000 明文口已关) + 网关 Casbin RBAC；cert-manager 证书链已在用；凭据泄露事故整改进行中。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 4.1 | ✅ | **OpenFGA** | Go | incubating（2025-11 起） | **后续决策覆盖（2026-08-28）**：本节结论已被 [docs/TECH.md](TECH.md) 覆盖：系统完全废弃 JWT 与双重鉴权路径；Casdoor 负责有状态 Session 和粗粒度角色，Session 存入 Dragonfly；control-tower 网关通过 OpenFGA Check 执行对象级关系授权。原「网关 Casbin 粗闸」与「禁止网关热路径远程 check」不再代表目标态。 |
| 4.2 | ❌ | SpiceDB | Go | 收录 | 否决为备选：能力相当（6.9k⭐/Apache-2.0），输在 CNCF 中立治理；需要 Watch/Operator 级运维工具时替代 |
| 4.3 | ❌ | Cerbos / Permify | Go | 收录 | 否决：Cerbos 是 ABAC/PDP 定位不解决关系图；Permify AGPL |
| 4.4 | 🟡 | Zitadel | Go | 收录 | 观察（触发式）：14.8k⭐ 活跃但 **AGPL-3.0**（v3 起）；登录链路刚修顺、换 IdP 全端震动。**触发条件 = Casdoor 高危 CVE 响应不及时 / 企业 SSO 治理缺口阻塞业务** |
| 4.5 | ❌ | Ory Hydra + Kratos | Go | 收录 | 否决：双组件对单人过重，2026-03 后发版放缓 |
| 4.6 | ❌ | Dex | Go | sandbox | 否决：无 OIDC 联邦场景 |
| 4.7 | ✅ | **trust-manager** | Go | graduated 家族 | **采纳（用户拍板）**：v0.24.0；标准化分发 CA bundle，正面解决「library chart 整卷挂载 /etc/ssl/certs 遮蔽系统 CA」坑（TODO L32） |
| 4.8 | 🟡 | SPIFFE / SPIRE | Go | graduated | **评估中**：attestation 体系对 10 服务小集群过重；需评估服务间 workload identity 是否应独立于 K8s ServiceAccount |
| 4.9 | ✅ | **external-secrets** | Go | sandbox | **采纳（对抗第 1 轮 D1 次序化定稿）**：①先用现有手段吊销/轮换/盘点（止血不等工具）②同步修订 AGENTS.md 硬规则 4（治理修订是前置子任务，≤0.5 人日，走 evolution-log）③修订合入即上 **ESO + OpenBao**（OpenBao 7.1k⭐/MPL-2.0/LF 治理，替 BSL 的 Vault）④新链路完成轮换闭环后 P0 关闭。ESO 2025 维护者危机已收尾（2026-06 恢复），锁 digest 防再发 |
| 4.10 | ✅ | SOPS | Go | sandbox | 采纳（与 4.9 组合）：SOPS+ksops 管 bootstrap 与少量 GitOps 静态密文，兼作 ESO/OpenBao 故障应急路径 |
| 4.11 | ❌ | Teleport | Go | 收录 | 否决：许可已非 OSS，场景不足 |

**附（casdoor 归属，对抗第 2/3 轮定稿）**：Casdoor **保持为 IdP 并收编进集群**——动机 = <50% 可用云箱上的 IdP、其 DB 与弱口令 PG 同箱、user-service 跨公网 RTT、纳入 CNPG PITR（「公网明文 OAuth」论据已被 08-19 整改消解，核验在案）。**迁移方案定稿**见 [`对抗审阅表-第3轮.md`](技术栈选型对抗/对抗审阅表-第3轮.md) R3-A：公网 origin 不变 ⇒ 前端零改动、存量 token 存活；kid=lens 证书随 DB 迁；JWKS diff==0 门禁；停机 ≤30min、回退分钟级；+3 补丁（dump 校验和、CSP/XFO 头 diff、NTP）。

---

## §5 网关与流量面

**现状**：go-kratos/gateway fork（11 个自研中间件）+ quic-go HTTP/3 + aegis BBR；东西向无网格（服务间调用尚未接线）；LB = Cilium gateway VIP。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 5.1 | 🟡 | Envoy Gateway | C++/Go | Envoy graduated | **远期演进候选（网关保持自研 = 用户拍板）**：迁移即重写 Casbin/BBR/transcoder 三类中间件，当前无数据面瓶颈实测证据。**触发条件 = k6 实测网关成为瓶颈 / 需要 Gateway API 生态或 WASM 插件体系**；届时 Casbin 外置 ext_authz |
| 5.2 | ❌ | Higress | Go+C++ | sandbox | 否决：Go 插件实为编译到 WASM 非原生进程扩展；生态偏阿里系；无 AI 网关场景 |
| 5.3 | ❌ | APISIX | C/LuaJIT | 收录 | 否决：NGINX+Lua 技术栈 + etcd 额外运维面，单人不值 |
| 5.4 | ❌ | Kgateway | Go+C++ | sandbox | 否决：迁移成本同 5.1 且成熟度更低 |
| 5.5 | ❌ | KrakenD | Go | 收录 | 否决：无 BFF 聚合需求 |
| 5.6 | ❌ | Pipy | C++ | 收录 | 否决：前沿位无场景 |
| 5.7 | ❌ | Kmesh | Go+eBPF | sandbox | 否决：750⭐、latest release 2025-12、华为单厂商——「广泛使用」硬不达标 |
| 5.8 | 🟡 | Cilium Service Mesh / mTLS | Go+eBPF | Cilium graduated | **评估中**：当前由 Cilium CNI + NetworkPolicy 覆盖，暂不引入完整网格；mTLS 与服务间身份验证方案一并评估。生产公网入口使用 Pangolin，不叠加 WireGuard/IPsec 隧道 |
| 5.9 | ❌ | Linkerd | Rust 数据面 | graduated | 否决：数据面非 Go；稳定版发布绑定 Buoyant 商业渠道（GitHub 仅 edge 线） |
| 5.10 | ❌ | LoxiLB | Go+eBPF | sandbox | 否决：与 Cilium LB-IPAM/Gateway 重复数据面（LB 零新增 = 用户拍板）。维持 Cilium LB-IPAM + L2（注意 L2 Announcement 为 Beta，安排 VIP 故障切换演练） |
| 5.11 | ❌ | Kuadrant | Go+Rust | sandbox | 否决：网关策略层无场景（自研网关自带限流） |

---

## §6 服务发现 — 去 Consul 化

**现状**：Consul 仅注册发现（gossip 明文、8501 未启 HTTPS；HashiCorp BSL 许可）；服务全量在 K8s。

| # | 状态 | 方案 | CNCF | 结论 |
|---|---|---|---|---|
| 6.1 | ✅ | **CoreDNS + K8s Service 原生发现，Consul 退役** | CoreDNS graduated | 生产采用 Kubernetes Service + CoreDNS。原开发机直连集群方案保留为存量决策。**后续决策覆盖（2026-08-28）**：本节结论已被 [docs/TECH.md](TECH.md) §10.2 覆盖：Docker Compose 定位为 pre 半生产环境测试（Compose 服务名互访）；Mac 开发内环（mirrord/Okteto 开发便捷性）重新评估中，结论出来前不定稿。 |
| 6.2 | ❌ | Oxia | Go, sandbox | 否决：无 ZooKeeper 语义需求场景 |

---

## §7 弹性 / 调度 / 成本

**现状**：VPA recommendation-only 已发布，15 个 ecommerce VPA 均为 `Off`/`RequestsOnly`；当前没有 HPA、KEDA ScaledObject 或 Descheduler，发布仍走 Deployment 滚动重建。发布证据与校准计划见 [`2026-08-29-vpa-recommendation-only.md`](reports/2026-08-29-vpa-recommendation-only.md)。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 7.1 | ✅ | **KEDA** | Go | graduated | 采纳：主场景为 Kafka Consumer Group lag，使用 Kafka Scaler，基准 `lagThreshold: "50"`。HPA 管在线请求服务，KEDA 管 Kafka 消费者，两者不得控制同一资源；原 `nats-jetstream` scaler 计划不再代表目标态 |
| 7.2 | ❌ | OpenKruise | Go | incubating | **暂缓（2026-08-20 部署实测否决，覆盖此前 🟡 试点）**：其全局 fail-closed pod mutating webhook 在单副本 manager 崩溃期冻结全集群 Pod 创建，且官方兼容表止于 K8s 1.32。当前虽已扩为 3 节点，但集群为 K8s 1.36，兼容性与 fail-closed 风险仍未解除；只有上游明确支持当前版本并完成 manager 故障复验，或提供无 webhook 的最小 ImagePullJob 安装时才重评。记录：`~/lens077/kubernetes/DEPLOY-RECORD-2026-08-20.md` |
| 7.3 | ❌ | Karpenter | Go | 收录 | 否决：固定 3 VM 无按需节点供给可言 |
| 7.4 | ❌ | Koordinator / Katalyst / gocrane | Go | sandbox/收录 | 否决：混部压榨在 19.5G 集群上无意义 |
| 7.5 | 🟡 | OpenCost | Go | incubating | **评估中**：用于每服务／每订单成本模型，P1 阶段引入 |
| 7.6 | 🟡 | Goldilocks | Go | 收录 | 可选：已有 VPA，仅是建议可视化 |
| 7.7 | ❌ | kube-green | Go | sandbox | 否决：无独立 dev 负载可休眠 |

**附（T2 资源预算定稿）**：先杀残留回收 ≈1.4Gi（seata 613Mi 零引用领衔/strimzi/loki 切换后/cilium-test/集群内 minio/tempo/dragonfly/consul 退役后）；全栈 requests ≈12.9–13.3Gi/19.5Gi，**余量 22–34%（≥20% 达标）**；limits=1.5×requests（CH/网关 2×）；requests 按 VPA 实测校准（现状教训：requests 95% vs 实用 62%）。砍序：残留→Tetragon→Kyverno audit-only→Jaeger 采样→KEDA 缓→OpenFGA 2→1（CH 已于 2026-08-20 复审改触发式缓上，出列）。不可砍：CNPG×2、VL+Vector、VM、网关+服务、redis、cert-manager、ArgoCD、备份组件。全表见 [`对抗审阅表-第2轮.md`](技术栈选型对抗/对抗审阅表-第2轮.md) C'.1。

---

## §8 可观测性

**现状（2026-08-20 快照）**：日志已拍板（下）；当时链路为 OTel Collector → Jaeger／VictoriaMetrics／Grafana；fluent-bit 的 PII 脱敏失效为 P0。目标态见 8.6：VictoriaTraces（[docs/TECH.md](TECH.md)）。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 8.1 | ✅ | **VictoriaLogs** | Go | 独立仓（Landscape 归 VM 条目） | **采纳（用户拍板替 Loki）**：2.2k⭐/Apache-2.0/v1.52，cluster 版随 v1.46（2026-02）GA；与 VM 同族运维、LogsQL 原生全文、OTLP 原生+兼容 Loki push API；对照 Loki AGPL + 本集群 OOMKill 前科。**切换程序（对抗第 1 轮 D2 合成）**：**≤72h 有界双写**（验收=PII 反例、3 个 logs 面板改写、查询等价抽查、丢/重检查——Loki 耦合面实测仅 6 处 datasource 引用+0 告警）→ 切主 → Loki 冻结只读至保留期满退役。**先单机版**，量级到了再切 cluster。完整论证见 [`claude2 稿`](技术栈选型对抗/claude2-日志栈拍板-VictoriaLogs+Vector.md) |
| 8.2 | ❌ | Quickwit | Rust | 收录 | 否决：8.1 已拍板；节奏减分同 2.1 |
| 8.3 | ❌ | OpenObserve | Rust | 收录 | 否决：8.1 已拍板；一体化单二进制与既有 VM/Jaeger 栈重叠 |
| 8.4 | ❌ | Parseable / SigLens | Rust/Go | 收录 | 否决：更年轻无翻盘论据 |
| 8.5 | ✅ | **Vector** | Rust | 收录 | **采纳（用户拍板替 fluent-bit）**：22.4k⭐/MPL-2.0，Datadog 治下发版正常（v0.57 线）。DaemonSet 采集容器日志；**VRL 重写 PII 脱敏 + `vector test` 把「故意未脱敏样本必须被拦截」用例进 CI**（正面修 P0 + 固化「静默失效要实测」教训）；端到端 ack。应用日志继续 OTLP 直发，不走「Collector filelog 一把抓」。**默认配置陷阱已修（2026-08-21）**：`glob_minimum_cooldown_ms` 默认 60s 致新 Pod 头分钟日志静默丢失——本集群 08-20 实测踩中，与 [VM 官方 log-collectors-benchmark](https://victoriametrics.com/blog/log-collectors-benchmark-2026/) 独立互证；已收紧 10s + `read_from: beginning`（部署仓 vector 组件）。同报告的轮转断句/FD 泄漏在本量级风险低，列观察 |
| 8.6 | ✅ | **VictoriaTraces** | Go | VictoriaMetrics 系 | **后续决策覆盖（2026-08-28）**：本节「保持 Jaeger」结论已被 [docs/TECH.md](TECH.md) 覆盖：Trace 存储定稿为 VictoriaTraces，与 VictoriaLogs、VictoriaMetrics 组成三存储；外置 OTel Collector 执行尾采样、PII 脱敏与噪声清洗，K8s 集群内仅保留轻量采集。 |
| 8.7 | 🟡 | Profiling：Parca / Pyroscope | Go | 收录 | **评估中**：用于 CPU／Heap／锁／Goroutine 热点分析；当前先用 Go 原生 pprof/PGO |
| 8.8 | 🟡 | Coroot | Go | 收录 | 观察：7.9k⭐/Apache-2.0 活跃，但已有手动 OTel+Hubble，再引 eBPF APM 属重复采集；历史有许可反复，用则锁版本 |
| 8.9 | 🟡 | vlagent | Go | VM 系 | **观察（2026-08-21 记档）**：VM 新采集器，官方基准（开源可复现）吞吐/资源断层领先且正确性零翻车——但**厂商主场作战**（零调优+纯 JSON 考题恰避其短板）。对本项目非候选：**无 VRL 等价转换=做不了采集侧 PII 脱敏（硬需求）**，无多行合并/自定义解析。**翻盘条件**：脱敏等价能力+多行+自定义解析落地 + 第三方独立复现基准；届时其 at-least-once/磁盘缓冲/多目的地特性可再评 |
| 8.9 | ❌ | Pixie | C++/Go | sandbox | 否决：latest release 停在 2025-01 |
| 8.10 | ❌ | DeepFlow | Rust/Go | 收录 | 否决：重复采集 + 资源脚印 |
| 8.11 | ❌ | Odigos | Go | 收录 | 否决：已有全量手动 OTel 插桩，自动注入无增量 |
| 8.12 | 🟡 | Inspektor Gadget | Go | sandbox | 工具箱按需：排障时临时用，不常驻 |
| 8.13 | ❌ | Perses | Go | sandbox | 否决：Grafana 无替换动机 |
| 8.14 | ❌ | Trickster | Go | sandbox | 否决：VM 查询无加速需求 |
| 8.15 | ✅/❌ | Hubble；K8sGPT/Tracetest | Go | 收录 | **Hubble ✅ 顺手启用**（已有 Cilium 白拿网络观测，配合 §5/§6 收尾开启）；K8sGPT/HolmesGPT/Tracetest ❌ 前沿位无场景 |

---

## §9 交付 / 构建 / 测试

**现状**：GitHub Actions「模板+矩阵」（service-ci.yml + backend.yml，TCR+GHCR 双推，update-manifests 回写）→ Argo 同步；无金丝雀。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 9.1 | ✅ | **Argo Rollouts** | Go | Argo graduated | 采纳：AnalysisTemplate 原生 Prometheus provider 直连 VM。**硬前置 = §6 Consul 退役**（网关现直连 pod IP，Service 权重切分此前不生效）；条件 = 无状态服务多副本+容量余量 |
| 9.2 | ❌ | Flagger | Go | Flux 系 | 否决为备选：项目健康（v1.44 活跃），选 9.1 纯因 ArgoCD 同生态一个操作面 |
| 9.3 | 🟡 | **ko** | Go | sandbox | 存量试点决策保留。**后续决策覆盖（2026-08-28）**：本节结论已被 [docs/TECH.md](TECH.md) 覆盖：Docker Buildx + GitHub Actions + Renovate 是构建与 CI 主链，ko 不再是切换目标。 |
| 9.4 | ✅ | Spegel | Go | 收录 | **试装验证通过（2026-08-20 实测）**：seed-and-probe——同镜像 node1 首拉 8.811s（公网）→ node2 **102ms**（86×）；`spegel_mirror_requests_total{cache="hit"}` docker.io=1、**TCR 自然流量 hit=2**（业务仓已受益）；libp2p resolve ≤5ms；containerd 2.3.4 实测 `use_local_image_pull=false` 不影响 mirror（此前顾虑消解，免改节点）。保留直连回退；记录见 `~/lens077/kubernetes/DEPLOY-RECORD-2026-08-20.md` |
| 9.5 | ❌ | Dragonfly（P2P 分发） | Go | graduated | 否决：Manager/Scheduler/SeedPeer 控制面对 3 节点过重 |
| 9.6 | ❌ | zot | Go | sandbox | 否决：制品分工已定稿（TCR 主镜像 + Harbor Helm 制品 + GHCR 可选），无需重复建设第四个仓库 |
| 9.7 | ✅ | **k6** | Go | 收录 | 采纳：31k⭐ 压测事实标准；先建网关/搜索/订单/库存基线（也是 5.1 触发条件的测量工具） |
| 9.8 | 🟡 | Keploy | Go | 收录 | 观察：Go API 录制回放补测位，非首要 |
| 9.9 | ❌ | Testkube | Go | 收录 | 否决：集群内测试编排无场景 |
| 9.10 | 🟡 | Chaos Mesh | Go | incubating | **评估中**：项目活跃非衰减（v2.8.4），P1 阶段引入；可先徒手 staging 演练 Runbook，后续重点验证 Kafka 分区／PG failover 网络注入 |
| 9.11 | 🟡 | **mirrord** | Rust | 收录 | 存量 PoC 与验收记录保留。**后续决策覆盖（2026-08-28）**：按 [docs/TECH.md](TECH.md) B 表转为「评估中」——与 Okteto 一起重研开发便捷性后再定内环工具；Docker Compose 定位为 pre 半生产测试，不作为内环默认。 |

---

## §10 存储 / 备份

**现状订正**：OpenEBS LVM localPV（实跑）；**MinIO 上游仓库已归档（2026-02 首次/04 再次）**；集群级灾备空白；**3 VM 同宿主 ⇒ 异地备份是硬前提，两台云箱是唯一真异地**。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 10.1 | ❌ | Longhorn v2 引擎 | Go+SPDK | incubating | 否决不动：v2 仍按技术预览对待（hugepages/NVMe-oF 前提、实例管理器 ~1 CPU）；localPV 继续，节点级风险由备份补偿 |
| 10.2 | ❌ | Piraeus / LINSTOR | Go+DRBD | sandbox | 否决：运维复杂度不匹配，且同宿主复制无容灾意义 |
| 10.3 | ⏸ | **Velero**（+CNPG Barman） | Go | sandbox | **选型采纳、实施用户拍板暂缓（2026-08-20）**：测试期数据不重要、Mac 全灭场景接受重建，暂不部署。**重启触发条件（任一命中即执行）**：①出现真实用户/不可再生数据或上线前 ②casdoor 收编落地（IdP 数据入集群）③OpenBao 成为正式凭据后端（其 file 存储里是真凭据）。方案存档不变：Velero FSB/Kopia 管 K8s 资源与非 PG localPV，**CNPG 一致性恢复归 Barman Cloud Plugin**（「Velero 文件备份 ≠ DB 一致性恢复」）；目标 4c4G 云箱 SeaweedFS，age 密文着陆，RPO=WAL 5min，每周恢复演练，可选 3-2-1 |
| 10.4 | ❌ | K8up / Kanister | Go | sandbox | 否决：需应用一致性 hook 时再补，不替代 Velero |
| 10.5 | ❌ | JuiceFS | Go | 收录 | 否决：无 POSIX 共享盘场景 |
| 10.6 | ✅ | **Silo（基于 MinIO）** | Go | ⚠️仓外 | **后续决策覆盖（2026-08-28）**：本节「MinIO → SeaweedFS」结论已被 [docs/TECH.md](TECH.md) 覆盖：对象存储定稿为 Silo，保持 S3 兼容，开启 Versioning 与 Lifecycle，前端上传统一使用 Backend 签发的预签名 URL；SeaweedFS 不再是迁移方向。 |

**附（2c2G 云箱定位）**：域外哨兵——拨测网关 VIP/集群健康 + 独立于集群的告警出口；容量允许时做备份第二副本。两台云箱均不承载业务（casdoor 收编见 §4 附）。

**复审附记 — Silo 分叉（2026-08-20 定稿当日，据用户补充情报复审；GitHub API 实测）**：MinIO 存在社区延续分叉 **Silo**（[`pgsty/silo`](https://github.com/pgsty/silo)，Pigsty/Vonng 维护，前身 `pgsty/minio` 自 2025-10）——**node2 现役镜像 `pgsty/minio` 本就是该谱系**。实测：AGPL-3.0（CVE 延续型分叉，非换证型）；Go；2.45k⭐/145 fork/48 万 Docker pulls；领先上游 108 commits；首个 Silo 名义版 RELEASE.2026-08-06（改名仅两周）；7 releases/19 安全修复；回补上游只修 AIStor 的 CVE（例 CVE-2026-39414）；`MINIO_*` 配置面与 `/minio/*` 线协议保留，side-by-side 迁移 + legacy-user drop-in 文档化；发布链带 SBOM/cosign。**历史裁决（已被 2026-08-28 覆盖）**：当时维持 10.6 SeaweedFS 结论。**后续决策覆盖（2026-08-28）**：本节结论已被 [docs/TECH.md](TECH.md) 覆盖：Silo 成为定稿对象存储，SeaweedFS 不再是迁移方向。以下三处修订作为历史评审记录保留：①论据降级——「上游无人修 CVE」改为「上游归档、修复线转移至单厂商分叉」，加速触发条款改为盯 silo 的 CVE 响应时效；②止血已拍板并执行（同日）——node2 存量切 `pgsty/silo:RELEASE.2026-08-06`（pin digest；实操坑=镜像 `HOME=/tmp` 致证书静默不加载、TLS 降级 HTTP，须显式 `--certs-dir`，沉淀 tls-enablement.md；验收与回退记录见 TODO ⓪d）；③silo 🟡 收编为 AGPL 备选位，与 Garage 并列（silo 长于兼容存量、Garage 长于独立上游）。**翻盘条件（商品图长期留 silo、放弃单引擎终态）= 分叉稳定维护 ≥12 个月且关键 CVE 响应 ≤30 天，且 SeaweedFS 商品图 PoC 受阻**。评审纪律自省：分叉于定稿时已存在 10 个月、集群实跑其镜像，却未进对抗评审视野——「现状盘点必须含镜像谱系」记为教训候选（待沉淀 context/）。

---

## §11 安全 / 供应链

**当前现状（2026-08-28）**：cert-manager 已在用；Gitleaks/zizmor/Trivy PR 门禁已落地，Syft 已接发布 workflow，Cosign/TCR 与 Kyverno 验签仍待实跑；Tetragon `1.7.1` 已在 node101/102/103 三节点运行，原始事件进入 VictoriaLogs，安全指标进入 VictoriaMetrics 并由 vmalert 告警；唯一 token-access 策略为 namespaced audit-only，不执行阻断。历史「无运行时安全、无准入 policy」记录已失效。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 11.1 | ✅/🟡 | Tetragon | Go+eBPF | Cilium 家族 | **基础观察已采纳、enforcement 仍观察**：chart 1.7.1 在 ARM64/Linux 7.0 三节点 `3/3` Ready，BTF、`PROCESS_EXEC/EXIT/KPROBE`、projected-token audit policy、VictoriaLogs 原始事件和 vmalert 告警均已真实注入验收；每 agent 当前约 75–89Mi/1–2m。保持 audit-only，后续需完成长期事件完整性、日志权限/保留、策略写权限与阻断误报/回滚评估。证据：[零信任与运行时安全验证](reports/2026-08-28-zero-trust-runtime-security.md) |
| 11.2 | ❌ | Falco | C++ | graduated | 否决为备选：规则生态最大，合规/SIEM 需求优先时替代 11.1 |
| 11.3 | ✅ | **Kyverno** | Go | graduated | 采纳：YAML 策略门槛低。**audit 14 天零误报 → enforce**（对抗第 3 轮 C2 补丁：节点重启史支持保守）；enforce 前必须处理**签名纪元**（对存量运行 digest 补签 + 删 pod 强制重建演练——C1 最高危补丁）；`PolicyException` 带 ns+digest+事故号+到期 |
| 11.4 | ❌ | OPA / Gatekeeper | Go | graduated | 否决：健康无虞但 Rego 成本对单人不值 |
| 11.5 | ✅ | **Trivy** | Go | 收录 | 采纳：CI 门禁（HIGH/CRITICAL 阻断+豁免流程带 CVE/责任人/到期）；含 fs（secret/config）与 image（对 TCR@digest）双档。落地并入 DEVOPS.md，实施稿见对抗第 3 轮 R3-C |
| 11.6 | ✅ | Syft（+Grype 抽检） | Go | 收录 | Syft ✅ 进链路（SPDX SBOM 随镜像 attest）；Grype 🟡 二次抽检位，与 Trivy feed 冲突时勿直接放行 |
| 11.7 | 🟡 | **cosign**（Ratify ❌） | Go | 收录 | **部分评估／部分采用**：与 Syft、Kyverno、Trivy、Grype、Gitleaks、zizmor 共同评估并分阶段采用。**后续决策覆盖（2026-08-28）**：制品分工=TCR 主镜像仓库 + Harbor 存 Helm 制品 + GHCR 可选双存（CI 按网络决定）；签名策略按三仓分工设计（TCR 对 cosign/referrers 的支持待实测） |
| 11.8 | 🟡 | in-toto / TUF | Py/Go | graduated | 观察：SLSA provenance 已随 cosign attest 起步，完整框架规模到了再议 |
| 11.9 | 🟡 | Kubescape | Go | incubating | 观察：态势扫描可选，不进首批 |
| 11.10 | ❌ | Copa / SlimToolkit / CoCo | Go | sandbox/incubating | 否决：无场景（ko 镜像本就极简） |

**附（CI 全链路实施稿定稿）**：gitleaks → Syft SBOM → Trivy 门禁 → cosign 签名+attest → digest 回写（helm library 加 `image.digest`，update-manifests `crane digest`+`cosign verify` 后回写）→ Kyverno 准入验签；全部 GitHub Actions 按 40 位 commit SHA 固定 + renovate 更新链；`MANIFEST_PUSH_TOKEN` admin PAT 降细粒度并入；`dev` 可变 tag 与验签互斥限非验签环境；CI 时长 warm ≤+3min 硬/cold ≤+30% 目标。全文见 [`对抗审阅表-第3轮.md`](技术栈选型对抗/对抗审阅表-第3轮.md) R3-C（+6 补丁）。

---

## §12 应用架构 / 前沿区

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 12.1 | ❌ | Dapr | Go | graduated | **否决（三方一致）**：官方生产配置每 sidecar 100m/250Mi 起步 ⇒ 10 服务白吃 ~1c/2.5Gi 不含控制面；其 outbox 要求改走 Dapr 事务 state API，与定稿的 pgx/sqlc outbox（`consistency.md`）直接冲突。触发重估 = 服务数显著增长+跨语言 |
| 12.2 | ✅ | **OpenFeature**（引擎经对抗改判） | Go | incubating | OpenFeature ✅（标准锁 API，Go SDK 成熟）。**引擎定稿（第 1 轮 D3 双杀改判）**：首选**自研 Config Center 写 provider**（零新组件，复用 pg_notify 推送/审计/回滚，进程内评估零跳）；次选 **GO Feature Flag 库模式**（MIT 进程内，个人项目 bus factor 已知情）；**Flipt v2 降条件项**（FCL fair-source 与 BSL 否决口径冲突；触发=需要运营 UI/实验分析）；**flagd ❌**（974⭐+常驻多一跳） |
| 12.3 | ❌ | Knative / KubeElasti | Go | graduated/sandbox | 否决：常驻电商服务不该 scale-to-zero |
| 12.4 | ❌ | OpenFaaS / Fission / Nuclio | Go | 收录 | 否决：无函数化场景；OpenFaaS 社区版/商业边界 |
| 12.5 | 🟡 | WASM：Spin（其余 ❌） | Rust | 收录 | 仅留 Spin 观察位（6.5k⭐/v4.0.2 活跃）：未来隔离型插件/边缘小任务；不替代 Go 微服务 |
| 12.6 | ❌ | youki / Kuasar | Rust | sandbox | 否决：替 runc 收益不可兑现，引入排障风险 |
| 12.7 | ❌ | Envoy AI Gateway / agentgateway | Go+C++ | 收录 | 否决：无 LLM 流量 |
| 12.8 | ❌ | Langfuse / KServe / llm-d | — | 收录 | 否决：无 LLM 场景，暂缓 |
| 12.9 | ❌ | Encore / userver | Go/C++ | 收录 | 否决：纯参考位 |
| 12.10 | ❌ | bootc / composefs | Rust/C | sandbox | 否决：PD 虚拟机节点无不可变 OS 需求 |

---

## 优先级建议（定稿版，按风险与依赖排序）

1. ~~灾备止血~~（**用户拍板暂缓 2026-08-20**：测试期数据不重要；触发条件见 10.3，命中即回到第 1 位）；对象存储按 [docs/TECH.md](TECH.md) 定稿为 Silo（10.6），SeaweedFS 不再是迁移方向。后续各步顺延递补。
2. **凭据整改次序化**：止血轮换（即刻，用现有手段）→ AGENTS.md 硬规则 4 治理修订 → ESO + OpenBao → 新链路轮换闭环；trust-manager 同窗上。
3. **Kafka 受控迁移**：在非 K8s 独立集群部署 Kafka，以 Protobuf + Buf Schema Registry 管理事件；落实 Outbox／Inbox／DLQ 契约，迁移完成后退役 NATS 业务流。
4. **Victoria 三存储 + 轻量采集**：VictoriaLogs／VictoriaMetrics／VictoriaTraces；K8s 内仅 Vector + VMAgent + OTel SDK，外置 OTel Collector 处理尾采样、PII 脱敏与噪声清洗。
5. **Consul 退役四步走 → KEDA Kafka Scaler → Argo Rollouts**：HPA 管在线服务，KEDA 管 Kafka 消费者，注意 Rollouts 硬依赖发现改造完成。
6. **搜索迁回 Elasticsearch + OpenFGA + CI 供应链**：Meilisearch 保留为存量迁移实现；网关接 OpenFGA Check；制品按「TCR 主镜像 + Harbor Helm 制品 + GHCR 可选」分工，供应链工具按「部分评估／部分采用」分阶段实施。

## 附录 — Java 例外与仍未引进项

Kafka、Debezium、Kafka Connect 已成为事件平台的明确例外；Strimzi 不采用，因为 Kafka 定稿部署于非 K8s 独立集群。当前仍未引进：Pulsar、RocketMQ、Flink、AutoMQ、EventMesh、OpenSearch、Keycloak、Nacos、Seata、ShardingSphere、Cassandra、Doris/StarRocks(FE)、SkyWalking、Zipkin、Pinpoint、Jenkins、Microcks；Elasticsearch 为目标态搜索存储，现状仍待从 Meilisearch 迁回；Backstage（TS/Node 但体量重）也未引进。

## 附录 — 与真相源的关系

- 本文件**只做评估与结论登记**；✅ 采纳后：技术选型写进 `STACK.md` §二（已回填定稿指针与现状订正）、执行待办登记 `TODO.md`「技术选型定稿（2026-08-20）」小节（并按 [kaneo 同步约定](../context/INDEX.md) 建卡）、CI/交付类并入 `docs/DEVOPS.md` 对应阶段。
- 对抗过程完整证据链：[`技术栈选型对抗/`](技术栈选型对抗/)——`claude-选型结论`、`codex的选型`、`claude2-日志栈拍板`（截断残卷，立场重建在第 2/3 轮任务 output）+ 三轮审阅表。
- 已在用的相关事实（cert-manager 证书链、TLS 盘点、fluent-bit 脱敏失效）以 `TODO.md` 对应行为准，本文件不复制细节。
