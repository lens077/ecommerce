# 技术雷达 — CNCF Landscape 选型评估（2026-08-20 定稿）

> **本文件不是进度真相源**。它是选型评估清单的**定稿版**：
> 逐项讨论 → 回填结论 → 定稿项落进对应真相源（选型进 [`STACK.md`](../STACK.md)、待办进 [`TODO.md`](../TODO.md)、CI/交付类并入 [`docs/DEVOPS.md`](DEVOPS.md)）后，本文件对应行只留结论与指针。
>
> **⭐ 定稿记录（2026-08-20）**：全部条目经**三轮异构对抗评审**定稿——claude 主稿 × codex（gpt-5.6-terra）× claude2 三方独立调研，8 个分歧逐项裁决、5 个环境议题收敛、3 份实施稿过红队验收。过程与证据：[`技术栈选型对抗/`](技术栈选型对抗/)（三份立场稿 + 三轮审阅表）。
> **环境前提（用户设定，2026-08-20）**：集群 = 3 台同宿主 Mac(M2 Max 32G) 的 PD 虚拟机（arm64 Ubuntu 26.04，各 4c/6.5G）——**quorum 可凑、物理故障域=1**，异地备份是硬前提；线上仅 2 台低可用 docker 机（4c4G=备份靶、2c2G=哨兵，均不载业务）。
> **用户直接拍板项**：ClickHouse 单节点、网关保持自研/不上网格/LB 走 Cilium 零新增、VictoriaLogs 替 Loki + Vector、OpenFGA 添加、trust-manager 添加。
>
> **来源与方法**：2026-08-20 抓取 <https://landscape.cncf.io/> 全量数据（2409 条目），排除会员公司条目、纯托管服务、已归档项目，并按本次评估约束**排除 Java 实现**；对抗轮另做 GitHub API 实测（stars/推送/许可证/归档）与集群实地核验。
> **评估基线订正**：原基线写「DragonflyDB 不动」——集群现实已是 `redis.redis.svc`（TLS），dragonfly 为残留部署待清理；PG 已迁集群内 CNPG（Pigsty 关机）。其余不动件维持：Cilium netkit/BBR/KPR、VictoriaMetrics、connect-go、quic-go、sqlc+pgx、OTel、ArgoCD ApplicationSet。
>
> **状态标记**：✅ 采纳（写明落点）· 🟡 观察/试验（写明触发条件）· ❌ 否决（写明原因）。**本版无 ⬜。**

---

## 总览与定稿速查

| 节 | 领域 | 定稿结论 |
|---|---|---|
| §1 | 消息 / 事件流 | ✅ NATS JetStream + outbox 自写 relay + CloudEvents；Kafka 全家桶退役 |
| §2 | 搜索 | ✅ Meilisearch（既有拍板维持）+ pgvector 起步；ES 退役 |
| §3 | 数据层 | ✅ CNPG 既成事实补强（2 实例+Barman）+ ClickHouse 单节点（用户拍板） |
| §4 | 身份 / 授权 / 凭据 | ✅ OpenFGA（用户拍板）+ trust-manager（用户拍板）+ ESO+OpenBao（治理修订先行）+ SOPS；Casbin/Casdoor 保持（casdoor 收编进集群） |
| §5 | 网关与流量面 | ✅ 保持自研网关 / 不上网格 / LB Cilium 零新增（用户拍板）；Envoy Gateway 为远期候选 |
| §6 | 服务发现 | ✅ Consul 退役 → K8s Service DNS；开发机通信 = mirrord + 网关 VIP |
| §7 | 弹性 / 调度 | ✅ KEDA；OpenKruise 仅 ImagePullJob 先用 |
| §8 | 可观测性 | ✅ VictoriaLogs + Vector（用户拍板，≤72h 有界双写切换）；Jaeger 保持 |
| §9 | 交付 / 构建 / 测试 | ✅ Argo Rollouts（前置=Consul 退役）+ ko + k6 + mirrord；Spegel 试装 |
| §10 | 存储 / 备份 | ✅ Velero + CNPG-Barman 异地 PITR；MinIO→SeaweedFS（上游已归档） |
| §11 | 安全 / 供应链 | ✅ Kyverno + Trivy + Syft + cosign（key-based 仅 TCR）；Tetragon 缓 |
| §12 | 应用架构 | ❌ Dapr；✅ OpenFeature（引擎=Config Center provider 首选） |

**快速导航**：执行顺序 → 见文末「优先级建议（定稿版）」；实施细化三稿（casdoor 迁移 / mirrord PoC / CI 供应链）→ [`技术栈选型对抗/对抗审阅表-第3轮.md`](技术栈选型对抗/对抗审阅表-第3轮.md)。

---

## §1 消息 / 事件流 — 替换 Kafka 全家桶

**现状**：Strimzi(Java) + Kafka(Java) + Debezium(Java) 已部署但**应用侧零消费**，数据面已不作可用前提（集群重建后）；换引擎零迁移成本。

| # | 状态 | 工具 | 语言 | CNCF | 定位 | 结论 |
|---|---|---|---|---|---|---|
| 1.1 | ❌ | Redpanda | C++ | 收录 | 对抗对照组 | **否决（对抗第 1 轮）**：BSL 源可用非开源；无存量 Kafka 消费者使「协议兼容」价值为零；Seastar 每节点 2GB+ 脚印不适配 6.5G 节点。翻盘三条件（行为数据必须走流式主干 + 需现成 Kafka 连接器生态 + 两年内大流量回放）经对抗验证均不成立 |
| 1.2 | ✅ | **NATS / JetStream** | Go | incubating | **§1 主选型（三轮对抗定稿）** | 健康实测：nats-server 20.5k⭐/Apache-2.0/v2.14.5+v2.12 LTS 双线；nats.go v1.53；治理风波 2025-05 和解收尾。**落地形态（第 2 轮 T4 定）**：3-server 集群（meta R3）；stream 分级副本——交易域 R3、埋点大流量 R1（可重放不值 3× 盘）；**R3 只防 VM 级故障不提升 DR**（3 VM 同宿主），容灾靠 outbox 重放 + 异地备份。**交易事件接入前置 = R1 故障→outbox 积压重放演练通过**（不等第三故障域）。首接消费者 = search 索引喂养（等米下锅）。论证与自认弱点存档见下「选型论证」 |
| 1.3 | ❌ | Fluvio | Rust | 收录 | 前沿流平台 | 否决：无官方 Go 客户端（社区 fluvio-go 15⭐ 停更 2021）；v0.18.1 后一年无 release，母司转向商业产品 |
| 1.4 | ❌ | Tremor | Rust | sandbox | 事件预处理 | 否决：项目实质死亡（52 周 0 commit，团队解散）；定位由 Vector 与 Numaflow 覆盖 |
| 1.5 | 🟡 | Numaflow | Go | 收录 | K8s 原生流处理 | 观察：v1.8.3 活跃、JetStream source 同族；Intuit 单厂商 + CRD 控制面对单人过重。**触发条件 = 埋点实时加工（清洗/特征→gorse）需求落地** |
| 1.6 | ✅ | **CloudEvents** | 规范 | graduated | 领域事件信封 | 采纳维持：binary mode + protobuf event format；事件定义为 proto 进 buf 作事件目录唯一真相源；outbox 表列按 CE 属性设计，幂等键 `(source,id)`，`traceparent` 接 OTel；`type` reverse-DNS 过去式、`id` UUIDv7；金额类型借事件契约一次定死。CDC 流不 CE 化（双轨纪律）。SDK 用官方 `nats_jetstream/v3` |
| 1.7 | ❌ | Drasi | Rust 为主 | sandbox | 变更即触发 | 否决：无场景且 sandbox 早期；需要「持续查询」场景时再评 |
| 1.8 | ✅ | 搬运层：**outbox + 自写 relay** | — | ⚠️仓外 | 替 Debezium | 定稿：自写 relay（复用 Config Center pg_notify 全套经验，约 200 行零新组件）＞ pgstream 库嵌入（Apache-2.0 活跃，需 WAL 断点续传时升级）＞ Sequin（**停更实锤**：2026-02 起零推送，❌）。配置式管道如需要用 **Bento（MIT）** 而非许可证混杂的 Redpanda Connect |

AutoMQ、RocketMQ、Pulsar、EventMesh 均因 Java 排除。

### §1 选型论证（2026-08-20 初选存档，对抗评审已通过）

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

**现状订正（2026-08-20）**：ES 已随集群重建退役（address/search 两服务因此 CrashLoop）；**Meilisearch v1.53 已装**（`search/meilisearch:7700`），2026-08-16 已有拍板，代码迁移在 TODO「搜索引擎切换」小节。

| # | 状态 | 工具 | 语言 | 来源 | 结论 |
|---|---|---|---|---|---|
| 2.1 | ❌ | Quickwit | Rust | 收录 | 否决于 §2，转介 §8 备选：定位是 observability 检索，无 typo/facet/即时搜索；Datadog 收购后 AGPL→Apache-2.0 兑现、v0.9.0 仍活但节奏放缓计入减分 |
| 2.2 | ✅ | **Meilisearch** | Rust | ⚠️仓外 | **定稿（既有拍板 + 三方对抗一致维持）**：v1.53.1 活跃、meilisearch-go v0.36.3 同步；中文 charabia+jieba 开箱、facet/typo/sortable 覆盖 search.md 全部未落地能力。**警示条款**：2025-08-27 起双许可——CE 保持 MIT，EE（BUSL）专属 sharding/replication，**开源版无 HA**：单实例 + 备份重建 + 索引可全量重放为可用性模型，读高可用走双实例双写；确认集群拉的是 CE 镜像；扩到 3 物理节点或 HA 成硬需求时重议（对照组 Typesense）。执行按 TODO「搜索引擎切换」小节 |
| 2.3 | ❌ | Typesense | C++ | ⚠️仓外 | 否决（对抗第 1 轮 captain 自我改判定稿）：其 OSS raft HA 优势在「3 VM 同宿主 Mac」下无法兑现真容灾，且 2 节点起步组不成奇数仲裁；GPL-3.0；Meili 已部署为既成事实。**翻盘条件 = HA 成硬需求且有 ≥3 物理故障域** |
| 2.4 | 🟡 | ParadeDB (pg_search) | Rust | ⚠️仓外 | 降权观察：AGPL-3.0；Pigsty 关机后「零成本装扩展」前提消失（CNPG 下需自定义镜像+preload+升级运维）。触发条件 = Meili 路线失败的回退位 |
| 2.5 | ✅ | 向量：**pgvector 起步** + Qdrant 规模位 | — | 收录 | **定稿（对抗第 2 轮 D4 组合裁决）**：pgvector 为权威 embedding 存储——**CNPG 官方 standard 操作数镜像已内置 pgvector**（换 imageName + `CREATE EXTENSION`，零自定义镜像；落地时实证版本）；Meili hybrid（userProvided 向量）作召回展示层。**Qdrant 🟡 触发条件** = embedding 数百万级或 HNSW 挤压交易库（34k⭐/Apache-2.0/官方 Go client 同版发布）。Milvus/LanceDB ❌ 规模不符 |
| 2.6 | ❌ | Vald | Go | 收录 | 否决：超大规模位无场景，更新慢（v1.7.17@2025-07） |

---

## §3 数据层

**现状订正（2026-08-20）**：PG 已迁**集群内 CNPG `pg-main`**（单实例，Pigsty 已关机退役）；每服务一 schema、TLS verify-full 延续；埋点无独立分析存储。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 3.1 | ✅ | **CloudNativePG** | Go | sandbox（incubation 尽调中） | **既成事实确认 + 补强定稿**：集群重建时已采用（`pg-main`，Database CR 声明式建库模式已验证）。补强待办：**instances=2 反亲和（N1/N2，异步复制——同宿主 sync 无意义）+ Barman Cloud Plugin → 4c4G 云箱异地 PITR + 每周恢复演练**。第 1 轮「保持 Pigsty」结论因前提过期作废（captain 认账在案） |
| 3.2 | ✅ | **ClickHouse** | C++ | 收录 | **采纳（用户拍板：单节点）**：49k⭐/Apache-2.0；官方 clickhouse-go v2.48。落地：单节点 @与 PG 主错开的节点，`max_server_memory` 顶格 2G（T2 预算），数据目录 localPV SSD；摄入用**原生 NATS 表引擎**直连 JetStream（免 Kafka）或批量导入；埋点可断代重放故单点可接受。装不下时按 T2 砍序可暂停（埋点断代重放） |
| 3.3 | ❌ | GreptimeDB | Rust | 收录 | 否决：2026 年才推进 v1.0 GA、主轴偏时序，广泛使用不及 CH |
| 3.4 | ❌ | Databend | Rust | 收录 | 否决：仓库许可证 NOASSERTION 未澄清，不进核心路径 |
| 3.5 | 🟡 | Multigres | Go | 收录 | 观察：PG 水平分片的未来答案，规模远未到 |
| 3.6 | 🟡 | YugabyteDB / CockroachDB | — | 收录 | 观察：分布式 PG 路线，规模到了再议（CRDB 许可已非开源） |
| 3.7 | ❌ | Valkey | C | 收录 | 备选记录不引进。**行内订正**：缓存现实已是 `redis.redis.svc`（TLS），dragonfly 为残留部署待清理（原「已是 DragonflyDB」表述过期） |

**附**：PeerDB（PG→CH CDC，AGPL，v0.37.4 活跃）🟡——CH 基线稳定后 PoC（验证 PG 版本/DDL/TOAST/断点恢复）。

---

## §4 身份 / 授权 / 证书 / 凭据

**现状**：Casdoor(Go，已走 Pangolin HTTPS，8000 明文口已关) + 网关 Casbin RBAC；cert-manager 证书链已在用；凭据泄露事故整改进行中。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 4.1 | ✅ | **OpenFGA** | Go | incubating（2025-11 起） | **采纳（用户拍板；形态经对抗第 2 轮 T5 定）**：v1.18.3/5.6k⭐/Apache-2.0。**落地形态**：2 副本反亲和 N1/N2；store = pg-main 内 CNPG `Database` CR 建独立 `openfga` 库+独立 role+连接池上限；**边界条款 = 网关 Casbin 管「JWT/角色×路由」粗闸（进程内不动），FGA 管「主体×资源实例×关系」（商家-店铺-商品-操作员），禁止网关热路径远程 check**；首接 merchant 域影子双跑后强制；check p95≤15ms 验收/p99 25ms 目标/50ms 熔断；**失败分级原则：降级只准缩小授权集**（写/资金 fail-close、列表/推荐降「仅本人+公开」）。address 越权类 P0 正解仍是 SQL user_id 过滤，不等本项 |
| 4.2 | ❌ | SpiceDB | Go | 收录 | 否决为备选：能力相当（6.9k⭐/Apache-2.0），输在 CNCF 中立治理；需要 Watch/Operator 级运维工具时替代 |
| 4.3 | ❌ | Cerbos / Permify | Go | 收录 | 否决：Cerbos 是 ABAC/PDP 定位不解决关系图；Permify AGPL |
| 4.4 | 🟡 | Zitadel | Go | 收录 | 观察（触发式）：14.8k⭐ 活跃但 **AGPL-3.0**（v3 起）；登录链路刚修顺、换 IdP 全端震动。**触发条件 = Casdoor 高危 CVE 响应不及时 / 企业 SSO 治理缺口阻塞业务** |
| 4.5 | ❌ | Ory Hydra + Kratos | Go | 收录 | 否决：双组件对单人过重，2026-03 后发版放缓 |
| 4.6 | ❌ | Dex | Go | sandbox | 否决：无 OIDC 联邦场景 |
| 4.7 | ✅ | **trust-manager** | Go | graduated 家族 | **采纳（用户拍板）**：v0.24.0；标准化分发 CA bundle，正面解决「library chart 整卷挂载 /etc/ssl/certs 遮蔽系统 CA」坑（TODO L32） |
| 4.8 | 🟡 | SPIFFE / SPIRE | Go | graduated | 观察：attestation 体系对 10 服务小集群过重；触发条件 = 跨集群工作负载身份成硬需求 |
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
| 5.8 | 🟡 | Istio ambient | Go+Rust | graduated | 未来 PoC 位（不上网格 = 用户拍板）：**当前以 Cilium WireGuard 节点间加密 + NetworkPolicy + Hubble 顶层**（诚实边界：传输加密非 workload mTLS、无 L7 治理——服务间调用本就未接线）。触发条件 = workload 级 mTLS/L7 治理成硬需求 |
| 5.9 | ❌ | Linkerd | Rust 数据面 | graduated | 否决：数据面非 Go；稳定版发布绑定 Buoyant 商业渠道（GitHub 仅 edge 线） |
| 5.10 | ❌ | LoxiLB | Go+eBPF | sandbox | 否决：与 Cilium LB-IPAM/Gateway 重复数据面（LB 零新增 = 用户拍板）。维持 Cilium LB-IPAM + L2（注意 L2 Announcement 为 Beta，安排 VIP 故障切换演练） |
| 5.11 | ❌ | Kuadrant | Go+Rust | sandbox | 否决：网关策略层无场景（自研网关自带限流） |

---

## §6 服务发现 — 去 Consul 化

**现状**：Consul 仅注册发现（gossip 明文、8501 未启 HTTPS；HashiCorp BSL 许可）；服务全量在 K8s。

| # | 状态 | 方案 | CNCF | 结论 |
|---|---|---|---|---|
| 6.1 | ✅ | **CoreDNS + K8s Service 原生发现，Consul 退役** | CoreDNS graduated | **采纳（三方一致 + 对抗第 2 轮 T1 补全开发机通信）**。集群内：网关直连 ClusterIP（Cilium KPR eBPF socket LB）；**gRPC/h2c 长连接钉死单 endpoint 的对策**（按序）：每 endpoint 多连接+优雅轮换 → headless+DNS → 网关 watch EndpointSlice。kratos kubernetes registry 官方自标「未生产验证」不用。**四步迁移**：①每服务建 ClusterIP+readiness ②网关双写影子解析比对 ③灰度切 ClusterIP 观察连接分布 ④删 Registrar、退役 Consul、收 NetworkPolicy+开 WireGuard。**Mac 开发机 ↔ 集群双向通信（用户点名议题定稿）**：集群→Mac = **mirrord**（默认 mirror、steal 限 dev+TTL；进程级不动集群对象、与发现机制无关）；Mac→集群 = **零新件**（常规走网关 VIP 与生产同路径；单服务调试直连其 Cilium LB VIP 仅限 dev；兜底 port-forward）；否决手工 EndpointSlice 指 Mac IP（stale IP 静默黑洞）/CoreDNS 静态映射/为此留 Consul/Telepresence |
| 6.2 | ❌ | Oxia | Go, sandbox | 否决：无 ZooKeeper 语义需求场景 |

---

## §7 弹性 / 调度 / 成本

**现状**：VPA 已用；无事件驱动扩缩；发布走 Deployment 滚动重建。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 7.1 | ✅ | **KEDA** | Go | graduated | 采纳：v2.20/10.4k⭐。`cron`（大促预热保底副本）+ `prometheus`（VictoriaMetrics）scaler **先行，不等 NATS**（对抗第 2 轮裁决）；NATS 落地后加 `nats-jetstream` scaler（社区维护，试点验收 lag 语义）。固定节点上限：`maxReplicaCount` 按余量圈死；与 VPA 分工（KEDA 管副本数、VPA 管 request），不同调同一指标 |
| 7.2 | 🟡 | OpenKruise | Go | incubating | 试点缓上：**ImagePullJob 先用**（大促镜像预热、零工作负载迁移）；CloneSet 原地升级降为可选（Deployment→CloneSet 语义迁移，单人不全量吃） |
| 7.3 | ❌ | Karpenter | Go | 收录 | 否决：固定 3 VM 无按需节点供给可言 |
| 7.4 | ❌ | Koordinator / Katalyst / gocrane | Go | sandbox/收录 | 否决：混部压榨在 19.5G 集群上无意义 |
| 7.5 | 🟡 | OpenCost | Go | incubating | 可选：要核算服务成本时再上 |
| 7.6 | 🟡 | Goldilocks | Go | 收录 | 可选：已有 VPA，仅是建议可视化 |
| 7.7 | ❌ | kube-green | Go | sandbox | 否决：无独立 dev 负载可休眠 |

**附（T2 资源预算定稿）**：先杀残留回收 ≈1.4Gi（seata 613Mi 零引用领衔/strimzi/loki 切换后/cilium-test/集群内 minio/tempo/dragonfly/consul 退役后）；全栈 requests ≈12.9–13.3Gi/19.5Gi，**余量 22–34%（≥20% 达标）**；limits=1.5×requests（CH/网关 2×）；requests 按 VPA 实测校准（现状教训：requests 95% vs 实用 62%）。砍序：残留→Tetragon→Kyverno audit-only→Jaeger 采样→CH 降档→KEDA 缓→OpenFGA 2→1。不可砍：CNPG×2、VL+Vector、VM、网关+服务、redis、cert-manager、ArgoCD、备份组件。全表见 [`对抗审阅表-第2轮.md`](技术栈选型对抗/对抗审阅表-第2轮.md) C'.1。

---

## §8 可观测性

**现状**：日志已拍板（下）；OTel Collector → Jaeger／VictoriaMetrics／Grafana；fluent-bit 的 PII 脱敏失效为 P0。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 8.1 | ✅ | **VictoriaLogs** | Go | 独立仓（Landscape 归 VM 条目） | **采纳（用户拍板替 Loki）**：2.2k⭐/Apache-2.0/v1.52，cluster 版随 v1.46（2026-02）GA；与 VM 同族运维、LogsQL 原生全文、OTLP 原生+兼容 Loki push API；对照 Loki AGPL + 本集群 OOMKill 前科。**切换程序（对抗第 1 轮 D2 合成）**：**≤72h 有界双写**（验收=PII 反例、3 个 logs 面板改写、查询等价抽查、丢/重检查——Loki 耦合面实测仅 6 处 datasource 引用+0 告警）→ 切主 → Loki 冻结只读至保留期满退役。**先单机版**，量级到了再切 cluster。完整论证见 [`claude2 稿`](技术栈选型对抗/claude2-日志栈拍板-VictoriaLogs+Vector.md) |
| 8.2 | ❌ | Quickwit | Rust | 收录 | 否决：8.1 已拍板；节奏减分同 2.1 |
| 8.3 | ❌ | OpenObserve | Rust | 收录 | 否决：8.1 已拍板；一体化单二进制与既有 VM/Jaeger 栈重叠 |
| 8.4 | ❌ | Parseable / SigLens | Rust/Go | 收录 | 否决：更年轻无翻盘论据 |
| 8.5 | ✅ | **Vector** | Rust | 收录 | **采纳（用户拍板替 fluent-bit）**：22.4k⭐/MPL-2.0，Datadog 治下发版正常（v0.57 线）。DaemonSet 采集容器日志；**VRL 重写 PII 脱敏 + `vector test` 把「故意未脱敏样本必须被拦截」用例进 CI**（正面修 P0 + 固化「静默失效要实测」教训）；端到端 ack。应用日志继续 OTLP 直发，不走「Collector filelog 一把抓」 |
| 8.6 | ❌ | Grafana Tempo | Go | 收录 | 否决：保持 Jaeger（graduated，v2 已基于 OTel Collector 重构）；触发条件 = 需要 TraceQL/对象存储规模化 |
| 8.7 | 🟡 | Profiling：Parca（首选）/ Pyroscope | Go | 收录 | **不常驻（三方收敛）**：先用 Go 原生 pprof/PGO；需要持续平台时做 **Parca 短 PoC**（Apache-2.0，vs Pyroscope AGPL+更活跃——许可优先取 Parca，属可辩护偏好）。用法=大促前/回归排查短期开 |
| 8.8 | 🟡 | Coroot | Go | 收录 | 观察：7.9k⭐/Apache-2.0 活跃，但已有手动 OTel+Hubble，再引 eBPF APM 属重复采集；历史有许可反复，用则锁版本 |
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
| 9.3 | ✅ | **ko** | Go | sandbox | 采纳试点：10 服务全命中 CGO_ENABLED=0；免 Dockerfile 秒出多架构镜像+默认 SPDX SBOM；保留 buildx 主线过渡，对比镜像/SBOM/多架构一致性后切换 |
| 9.4 | 🟡 | Spegel | Go | 收录 | **试装**（对抗第 2 轮翻案：第 3 节点触发条件命中；3 节点并发拉 TCR=3×WAN，P2P 省 2/3）：无损试装、保直连回退，按冷拉 p95/WAN 流量定去留 |
| 9.5 | ❌ | Dragonfly（P2P 分发） | Go | graduated | 否决：Manager/Scheduler/SeedPeer 控制面对 3 节点过重 |
| 9.6 | ❌ | zot | Go | sandbox | 否决：已有 TCR+GHCR+Harbor 三仓，重复建设 |
| 9.7 | ✅ | **k6** | Go | 收录 | 采纳：31k⭐ 压测事实标准；先建网关/搜索/订单/库存基线（也是 5.1 触发条件的测量工具） |
| 9.8 | 🟡 | Keploy | Go | 收录 | 观察：Go API 录制回放补测位，非首要 |
| 9.9 | ❌ | Testkube | Go | 收录 | 否决：集群内测试编排无场景 |
| 9.10 | 🟡 | Chaos Mesh | Go | incubating | **触发式（对抗双方收敛，claude2 自我改判）**：项目活跃非衰减（v2.8.4），但常驻控制面与使用频率不成比。先徒手 staging 演练 Runbook（pod kill/drain/单 VM prlctl stop）；**触发条件 = 需要 NATS 分区/PG failover 级网络注入**，届时最小形态（无 dashboard、仅 Pod/NetworkChaos、限 staging）。Litmus 同判 |
| 9.11 | ✅ | **mirrord** | Rust | 收录 | **采纳（对抗双方一致）：默认内环工具 + Okteto 保留特例**——mirrord 进程级介入不动集群对象（根治 okteto×ArgoCD selfHeal 的 devwindow 坑）；Okteto 降级保留给 uid 1000/Secret 0400/镜像内行为等「集群身份」场景。**PoC 验收单（含 netkit 兼容第一判据、trailers 保真、健康检查排除 steal 等 5 补丁）见 [`对抗审阅表-第3轮.md`](技术栈选型对抗/对抗审阅表-第3轮.md) R3-B** |

---

## §10 存储 / 备份

**现状订正**：OpenEBS LVM localPV（实跑）；**MinIO 上游仓库已归档（2026-02 首次/04 再次）**；集群级灾备空白；**3 VM 同宿主 ⇒ 异地备份是硬前提，两台云箱是唯一真异地**。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 10.1 | ❌ | Longhorn v2 引擎 | Go+SPDK | incubating | 否决不动：v2 仍按技术预览对待（hugepages/NVMe-oF 前提、实例管理器 ~1 CPU）；localPV 继续，节点级风险由备份补偿 |
| 10.2 | ❌ | Piraeus / LINSTOR | Go+DRBD | sandbox | 否决：运维复杂度不匹配，且同宿主复制无容灾意义 |
| 10.3 | ✅ | **Velero** | Go | sandbox | **采纳（分工经对抗精确化）**：Velero FSB/Kopia 管 K8s 资源与非 PG localPV；**CNPG 一致性恢复归 Barman Cloud Plugin**（「Velero 文件备份 ≠ DB 一致性恢复」）。目标 = 4c4G 云箱 SeaweedFS S3，**age 客户端加密后密文着陆**；推送型+归档年龄监控+哨兵互拨告警；RPO=WAL 5min/夜间 Velero；**每周恢复演练**；可选冷云第三副本凑 3-2-1 |
| 10.4 | ❌ | K8up / Kanister | Go | sandbox | 否决：需应用一致性 hook 时再补，不替代 Velero |
| 10.5 | ❌ | JuiceFS | Go | 收录 | 否决：无 POSIX 共享盘场景 |
| 10.6 | ✅ | **MinIO → SeaweedFS 迁移** | Go | ⚠️仓外 | **采纳（风险已兑现：上游归档）**：SeaweedFS 34k⭐/Apache-2.0/Go 本体，4.42 活跃。落点：4c4G 云箱跑 SeaweedFS 单机 S3 作备份靶 + 商品图迁移（S3 兼容 PoC：签名/multipart/presigned/生命周期）；**新增备份流量即刻不写 MinIO**；加速触发 = 未修复 CVE 或 SDK 兼容故障。Garage（AGPL）轻量备选；RustFS 无正式 release 只看不碰 |

**附（2c2G 云箱定位）**：域外哨兵——拨测网关 VIP/集群健康 + 独立于集群的告警出口；容量允许时做备份第二副本。两台云箱均不承载业务（casdoor 收编见 §4 附）。

---

## §11 安全 / 供应链

**现状**：cert-manager 已在用；trivy/cosign/syft/gitleaks 在 DEVOPS.md 有规划未实现；无运行时安全、无准入 policy。

| # | 状态 | 工具 | 语言 | CNCF | 结论 |
|---|---|---|---|---|---|
| 11.1 | 🟡 | Tetragon | Go+eBPF | Cilium 家族 | **试点缓上（对抗修正）**：同栈方向确认，但 T2 预算首批不上（两方一致）；**无可信的 Tetragon vs Falco 同条件开销横评**——「开销远低」不写进验收，上线前各开一周实测 CPU/内存/事件丢失率再定稿。注意它是 Cilium 生态项目而非独立 CNCF 身份 |
| 11.2 | ❌ | Falco | C++ | graduated | 否决为备选：规则生态最大，合规/SIEM 需求优先时替代 11.1 |
| 11.3 | ✅ | **Kyverno** | Go | graduated | 采纳：YAML 策略门槛低。**audit 14 天零误报 → enforce**（对抗第 3 轮 C2 补丁：节点重启史支持保守）；enforce 前必须处理**签名纪元**（对存量运行 digest 补签 + 删 pod 强制重建演练——C1 最高危补丁）；`PolicyException` 带 ns+digest+事故号+到期 |
| 11.4 | ❌ | OPA / Gatekeeper | Go | graduated | 否决：健康无虞但 Rego 成本对单人不值 |
| 11.5 | ✅ | **Trivy** | Go | 收录 | 采纳：CI 门禁（HIGH/CRITICAL 阻断+豁免流程带 CVE/责任人/到期）；含 fs（secret/config）与 image（对 TCR@digest）双档。落地并入 DEVOPS.md，实施稿见对抗第 3 轮 R3-C |
| 11.6 | ✅ | Syft（+Grype 抽检） | Go | 收录 | Syft ✅ 进链路（SPDX SBOM 随镜像 attest）；Grype 🟡 二次抽检位，与 Trivy feed 冲突时勿直接放行 |
| 11.7 | ✅ | **cosign**（Ratify ❌） | Go | 收录 | **采纳（签名选型经对抗裁决）**：**key-based、仅强制 TCR（集群拉取侧）**，policy 显式 `rekor.ignoreTlog:true`——LAN+代理环境下弃 keyless（Rekor 公网依赖=部署单点，设计方与红队独立同判）；GHCR 暂不签。验签走 **Kyverno verifyImages**；Ratify 否决（迁 notaryproject 后仅 308⭐，不加独立验证平面） |
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

1. **灾备与对象存储止血（唯一「不做会出事」层）**：Velero + CNPG Barman Cloud Plugin → 4c4G SeaweedFS 备份靶（age 加密）；每周恢复演练；MinIO 停止新增写入。
2. **凭据整改次序化**：止血轮换（即刻，用现有手段）→ AGENTS.md 硬规则 4 治理修订 → ESO + OpenBao → 新链路轮换闭环；trust-manager 同窗上。
3. **NATS JetStream + CloudEvents + 自写 relay**：3-server meta R3、stream 交易 R3/埋点 R1；首接 search 索引喂养；R1 故障重放演练是交易事件前置。
4. **VictoriaLogs + Vector**：≤72h 有界双写切换；VRL 重写 PII 脱敏（P0）并带反例用例进 CI。
5. **Consul 退役四步走 → KEDA（cron/prometheus 先行）→ Argo Rollouts**：注意 Rollouts 硬依赖发现改造完成。
6. **搜索收尾 + OpenFGA + CI 供应链**：Meilisearch 代码迁移（TODO 既有小节）；OpenFGA merchant 域影子双跑；Trivy/cosign/Kyverno 按 R3-C 实施稿三阶段。

## 附录 — 因 Java 被排除（明确不引进）

Kafka、Strimzi、Debezium、Kafka Connect、Pulsar、RocketMQ、Flink、AutoMQ、EventMesh、Elasticsearch、OpenSearch、Keycloak、Nacos、Seata、ShardingSphere、Cassandra、Doris/StarRocks(FE)、SkyWalking、Zipkin、Pinpoint、Jenkins、Microcks；Backstage（TS/Node 但体量重，一并不引）。

## 附录 — 与真相源的关系

- 本文件**只做评估与结论登记**；✅ 采纳后：技术选型写进 `STACK.md` §二（已回填定稿指针与现状订正）、执行待办登记 `TODO.md`「技术选型定稿（2026-08-20）」小节（并按 [kaneo 同步约定](../context/INDEX.md) 建卡）、CI/交付类并入 `docs/DEVOPS.md` 对应阶段。
- 对抗过程完整证据链：[`技术栈选型对抗/`](技术栈选型对抗/)——`claude-选型结论`、`codex的选型`、`claude2-日志栈拍板`（截断残卷，立场重建在第 2/3 轮任务 output）+ 三轮审阅表。
- 已在用的相关事实（cert-manager 证书链、TLS 盘点、fluent-bit 脱敏失效）以 `TODO.md` 对应行为准，本文件不复制细节。
