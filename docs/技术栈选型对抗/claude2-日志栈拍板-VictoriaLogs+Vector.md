# claude2 — 全量选型研究（CNCF Landscape → 本项目）

> **作者**：Claude（对抗材料第 2 号，简称 claude2）· **日期**：2026-08-20
> **演变说明**：本文件前身为日志栈拍板专题（VictoriaLogs+Vector），应"一次性做完"指令扩展为**全量选型研究**；日志栈专题完整保留为 §8。
> **地位**：初选推荐集，**供多方对抗评审攻击**。为保持对抗独立性，本文写作时**未读**同目录下 codex 与另一份 claude 的材料。
> **方法**：2026-08-20 抓取 landscape.cncf.io 全量（2409 条目）逐类筛选；候选共 **~100 个仓库全部经 GitHub API 实测**（stars / license / 最后推送 / 最新正式版），死亡与停滞判定基于实测而非印象；性能类主张凡未本地实测均标注厂商口径。
> **评估约束**（继承自任务定义）：排除 Java 实现；只为性能与能力增强，不考虑兼容性与重写成本；但资源约束按现实计（自建小集群，2 可调度节点、OOMKill 前科）。
> **项目基线**（真相源 `STACK.md`）：Go 1.26 全家 + connect-go + fx + sqlc/pgx + PG(每服务一 schema) + Dragonfly + ES + Consul + Casdoor + Casbin 网关 + Cilium netkit/BBR/KPR + OpenEBS LVM + ArgoCD + OTel 全链路 + VictoriaMetrics/Grafana/Loki/Jaeger/fluent-bit + Strimzi/Kafka/Debezium(闲置)。已在前沿、不动：Cilium、Dragonfly、VM、connect-go、quic-go、sqlc。

## 结论速览（五个阶段包，按依赖排序）

| 阶段 | 组合 | 驱动 |
|---|---|---|
| **P-0 安全耦合包** | Vector + VictoriaLogs（§8）；external-secrets + SOPS（§4）；Trivy + cosign + **Kyverno**（§11） | P0 PII 脱敏失效整改 + 凭据泄露事故固化 + DEVOPS.md 已有规划 |
| **P-1 事件底座包** | NATS JetStream + outbox 自写 relay + CloudEvents（§1，已初选）；KEDA（§7）；退役 Strimzi/Kafka/Debezium | 应用侧零消费的迁移窗口 |
| **P-2 交付质量包** | Argo Rollouts + ko + Chaos Mesh + k6（§9）；Velero + CloudNativePG（§10/§3） | 金丝雀/回滚、灾备空白 |
| **P-3 体验与规模包** | Meilisearch 替 ES（§2）；ClickHouse + PeerDB 埋点分析线（§3）；OpenFGA（§4，商家多操作员开工时）；OpenKruise（§7） | 去最后一个 JVM、分析与授权表达力 |
| **观察区** | 其余全部——每项写明触发条件，不设时限 | — |

---

## §1 消息 / 事件流（已初选，本节为论证归档）

**结论（2026-08-20 用户初选）**：NATS JetStream（✅）+ outbox 自写 relay（✅）+ CloudEvents 信封（✅）+ Numaflow（🟡 埋点加工需求落地时启用）。Kafka/Strimzi/Debezium 全家桶退役，待对抗通过后落 TODO.md。

**实测**：nats-server 20.5k⭐ / Apache-2.0 / v2.14.5 主线 + v2.12.15 LTS 双线（2026-08-12 同日发版）/ 52 周 1712 commits；nats.go v1.53；NACK CRD、官方 helm、KEDA scaler 齐全。治理：2025-04 Synadia 试图撤回+改 BSL → 2025-05-01 与 CNCF 和解（商标归 Linux 基金会、仓库留 CNCF、Apache-2.0 延续）。

**四条主论据**：①资源脚印（3 节点 <200MB vs Redpanda 每节点建议 2GB+）是自建小集群的可行性差异；②语义与 `consistency.md` 一一对应（`Nats-Msg-Id` 幂等、durable consumer ack/nak/max-deliver、behavior 伪 outbox 退役）；③全 Go 同族（可读源码、进程内测试实例、cert-manager 证书链直挂）；④配套齐（GitOps CRD、KEDA、Numaflow ISB 同族）。

**自认弱点**：①CDC→NATS 成品窄（Sequin 已停更 6 个月/2026-02 实测）——但定稿本就是自写 relay，弱点不成立，请对抗方验证；②非数据主干（日千万级回放场景弱）——缓解为分析线 PeerDB→ClickHouse 直连不过消息层，**此假设是对抗重点**；③subject 顺序模型需显式设计（`order.{id}.>` 或确定性分区）；④开发力量集中 Synadia 一家。

**反选 Redpanda（C++/BSL，对照组）三条件同时成立则翻盘**：行为数据必须走流式主干 + 需要现成 Kafka 连接器生态 + 两年内到大流量回放。

**搬运层实测**：pgstream（Go/Apache-2.0）v1.4.1 当日发版，可作库嵌入；Sequin 停更；PeerDB（PeerDB-io/peerdb 3.2k⭐）活跃但归 §3 分析线。**否决归档**：Fluvio（无官方 Go 客户端，社区版停更 5 年，v0.18 后一年无 release）、Tremor（52 周 0 commit，v0.13 停在 rc.33，团队解散）。

---

## §2 搜索 — 替换 Elasticsearch(Java)

**推荐**：门面搜索 **Meilisearch**；向量起步 **pgvector**、上量 **Qdrant**。ES/OpenSearch(Java) 退役。

| 候选 | 语言/许可（实测） | ⭐ | 最新版 | 判定 |
|---|---|---|---|---|
| **Meilisearch** | Rust / MIT（API 标 NOASSERTION 系仓库含商业目录，核心 MIT） | 59,017 | v1.53.1@2026-08-13 | **主推** |
| Typesense | C++ / **GPL-3.0** | 26,452 | v30.2@2026-04（4 个月前） | 降级：GPL + 发版节奏慢于 Meili |
| ParadeDB pg_search | Rust / **AGPL-3.0** | 9,175 | v0.25.3@2026-08-17 | 保守备选：零新组件并进 PG，AGPL 自托管可用 |
| Qdrant | Rust / Apache-2.0 | 34,064 | v1.19.0@2026-08-05 | 向量上量位 |
| Milvus | Go+C++ / Apache-2.0 | 45,698 | **v3.0.0**@2026-07-29 | 超大规模位，当前用不到 |
| LanceDB / pgvector / Vald | Rust / C(PG license) / Go | 11.2k / 22.7k / 1.7k | — / v0.8.x / v1.7.17@2025-07 | pgvector=零新件起步；Vald 更新慢 |

**论据**：Meilisearch 是电商门面搜索的能力最优（typo 容错/facet/毫秒响应/中文分词内置），59k⭐ 社区断层领先同类。**自认弱点（对抗靶）**：①Meilisearch **单实例架构，无原生分布式/HA**——高可用要靠双实例+双写或商业云版，这是它对 ES 最大的倒退项，2 节点集群可接受但必须知情；②索引同步链路需要 outbox/CDC 喂（联动 §1，product 变更事件）；③ES 的聚合分析能力（aggregations）Meili 弱——但该场景应归 §3 ClickHouse。**反选条件**：若判定搜索侧 HA 为硬要求且不接受双写方案 → ParadeDB（随 PG 的 HA走）或留 ES。

## §3 数据层

**推荐**：**CloudNativePG 引进**（PG 运维化）+ **ClickHouse + PeerDB 立埋点分析线**。Dragonfly/PG 主体不动。

| 候选 | 许可（实测） | ⭐ | 最新版 | 判定 |
|---|---|---|---|---|
| **CloudNativePG** | Apache-2.0 | 9,155 | v1.30.0@2026-06 | **引进**：HA/切换/PITR/证书轮转全自动，顺带消解 db-ca-cert 手工挂载坑；CNCF sandbox |
| **ClickHous… (+13332 more chars)
