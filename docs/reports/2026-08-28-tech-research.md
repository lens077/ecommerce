# 2026-08-28 技术评估深度调研

> 范围：用户点名项（valtio/Zustand、mirrord/Okteto、Consumer 端 Next.js）+ `docs/TECH.md` B 表全部评估项（流处理、SPIFFE/mTLS/Tetragon/Cilium Service Mesh、供应链七件套、OpenCost、Pyroscope/Parca、Chaos Mesh、Temporal、GlitchTip）+ Elasticsearch 回归可行性验证。
> 方法：7 个并行调研代理，一手来源优先（官方文档/GitHub releases/npm/许可证原文），关键结论逐条附来源；仓库侧事实以只读检查核实。执行工具：内置 web_search + agent-reach（Exa/Jina Reader/GitHub CLI 零配置通道）。
> 结论的采纳状态以 [`docs/TECH.md`](../TECH.md) 后续修订为准；本文是证据存档。

## 决策速览

| 主题 | 建议 | 一句话理由 |
|---|---|---|
| valtio vs Zustand | **迁 Zustand**（约 0.5–1 人日） | 使用面仅 3 个文件、迁移窗口成本最低；生态约 27 倍、官方 Next.js/SSR 指南完备、React Compiler 摩擦更小。valtio 并未失修，「不迁」也成立但须补订阅规范 |
| Consumer 端 Next.js | **局部迁**：新建 Next.js 应用只承载公开可收录页（详情/分类/首页，ISR），登录后交易页与 Merchant/Admin/Tauri 留 Vite SPA | ConnectRPC SSR 集成可行（connect-node transport + Query prefetch/Hydration）；整迁成本与风险不成比 |
| 开发内环 | **三层**：日常 `go run` 默认；mirrord OSS 先做 cart 单服务 PoC；Okteto 保留为集群身份兜底 | mirrord 有 Cilium KPR 已知阻断风险（ClusterIP 流量不被 mirror/steal），PoC 通过前不得定为主路径 |
| Kafka Streams / ksqlDB | **暂不引入**，维持 franz-go 自写消费者 | Streams=JVM 库（技术栈孤岛）；ksqlDB 仍发版但 Confluent 战略转 Flink 且 CCL 非 OSI。触发后先 POC RisingWave |
| Elasticsearch 回归 | **可行，按门禁验证**：9.x 单节点 4c/8–12Gi/4Gi heap/100Gi NVMe 起步，万级 SPU 单分片 | 「性能够了」成立条件=固定中文查询集+压测门禁全过；HA 最低形态是 2 data + 1 tiebreaker，不存在「双节点 HA」 |
| 零信任四件套 | **均不现在上**；先补 default-deny/SA 治理，加密首选 Cilium WireGuard 小范围实测 | Cilium Mutual Auth 仍 Beta 且安全模型未完成；需要 workload mTLS 时首选 Istio Ambient 评估 |
| 供应链管线 | **分阶段**：PR 跑 Gitleaks/zizmor/Trivy；tag 发布 Syft SBOM + Cosign 签名（GHCR keyless 最稳，TCR 待实测）；Kyverno 先 Audit 单副本 | TCR 对 cosign/referrers 无官方确证，必须实测后才设集群验签 |
| OpenCost / Pyroscope / Chaos Mesh / Temporal / GlitchTip | 见 §8（触发式为主；GlitchTip vs 现役 Bugsink 的净收益需对照定夺） | — |

---

## 1. 前端本地状态：valtio vs Zustand

**结论：建议 A「迁移 Zustand」，成本约 0.5–1 人日（5–8 小时）。** 理由不是 valtio 不可用——valtio 2.3.2 活跃维护、React 19 正式兼容、v2 已为 React Compiler 调整 `useSnapshot`——而是在状态规模还极小时以最低成本统一到更主流的模型。

**关键事实**

- 使用面：仅 3 个文件定义 store（consumer `Loading.tsx`、`store/users.ts`、packages/utils `notifications.ts`）；全仓唯一 `useSnapshot` 在 `GlobalLoadingProvider`；zustand 未安装。
- 生态：zustand 5.0.15（2026-08-13）周下载约 4476 万 vs valtio 2.3.2（2026-05-01）约 164 万，差约 27 倍；两者同属 pmndrs、核心维护者同为 daishi kato（[valtio releases](https://github.com/pmndrs/valtio/releases)、[zustand releases](https://github.com/pmndrs/zustand/releases)）。
- React Compiler：valtio v2 官方自述为兼容 Compiler 而「less optimized」（[v2 迁移指南](https://valtio.dev/docs/guides/migrating-to-v2)）；2025 年仍有 proxy 外部写入触发 Compiler lint 误报的公开讨论（[discussion #1099](https://github.com/pmndrs/valtio/discussions/1099)）。zustand 的 `set()` 对 Compiler 是普通函数调用，无同类公开问题。
- SSR/Next.js：zustand 有官方 Next.js 指南（per-request store、hydration、RSC 禁令）；valtio 无同等完整方案——与 Next.js 评估形成联动。
- 迁移中发现的真 bug：`AppBar.tsx`、`useAddresses.ts` 直接读 `userStore` 而未 `useSnapshot` 订阅，React 渲染不会因状态变化刷新——无论迁不迁都要修。

**建议与触发**：在 Next.js POC 启动、启用 React Compiler、或新增第 4 个 store 之前完成迁移；迁移时按「vanilla store + bound hook + 窄 selector」模式，顺带修复未订阅问题。若 6–12 个月内 Consumer 保持纯 SPA 且不启用 Compiler，「保持 valtio + 补齐读写规范」亦可接受。不建议长期双评估。

---

## 3. 开发内环：mirrord vs Okteto（Docker Compose 定位 pre）

**结论：不做一刀切替换。日常默认 Mac 本地 `go run`/`make dev`；mirrord OSS 以 cart 为目标做单服务 PoC（通过前不得定为主路径）；Okteto CLI 保留为「必须复现真实 Pod 身份」的兜底（已实测可用）。**

**关键事实**

- **Cilium KPR 是 mirrord 的最大阻断风险**：官方已知问题——部分 Cilium kube-proxy replacement 集群中，经 Service ClusterIP 到达目标 Pod 的流量不会被 mirror/steal（直连 Pod IP 正常）；官方临时绕法是全局 `bpf.hostLegacyRouting=true`（[issue #2777](https://github.com/metalbear-co/mirrord/issues/2777)、[common issues](https://metalbear.com/mirrord/docs/faq/troubleshooting/common-issues)）。**不应为开发工具全局改集群数据面**；若只有改 Cilium 才能通过，判定 mirrord 不适合本仓默认使用。
- mirrord 活跃（3.251.0，2026-08-25；MIT）；Go 注入有专门 hook（拦截 `syscall.Syscall6.abi0` 等，[技术文](https://metalbear.com/blog/hooking-go-from-rust-hitchhikers-guide-to-the-go-laxy/)），但**完全静态链接的二进制不支持**；Mac 侧 `go run` 产物是 Darwin/arm64，与 Linux 静态 ELF 不同，须实测。OSS 边界：多 Pod 整体拦截、同目标并发会话协调属收费 Operator（约 $50/seat/月）。
- Okteto：**开源 CLI（Apache-2.0）活跃**（2026-07 仍发版），`up/down/context` 对普通 K8s 可用；但旧「免费自托管 CE 平台」叙事已不成立——当前 Self-Hosted 是需 license 的商业平台（[BYOC vs Self-Hosted](https://www.okteto.com/docs/byoc-vs-self-hosted/)）。本仓 cart 已端到端实测（uid/Secret 0400/Pod IP/集群 DNS）。
- 备选排序：Telepresence（CNCF，持续维护，无 LD_PRELOAD 依赖、开源 personal intercept 成熟）是 mirrord 在 KPR/Go 注入失败后的首选备选；Skaffold/Tilt/DevSpace 均活跃但定位不同，暂不引入。
- **Compose 边界**（pre 半生产测试定位的诚实清单）：能模拟服务生命周期、Compose DNS、依赖、协议联调、回归；**不能**模拟 CiliumNetworkPolicy、KPR/eBPF 转发、Gateway API、CoreDNS ndots/搜索域、Pod/Service IP 语义、ServiceAccount/RBAC、Secret 文件 mode/fsGroup、readiness 摘挂、PVC 拓扑、滚动更新。K8s 行为验收必须在真 K8s pre 做。

**建议与触发**：现在就可做 mirrord targetless DNS 验证与 cart PoC（验收清单含：Go 1.26 注入稳定性、ConnectRPC H2C mirror、**Service ClusterIP 路径拦截**、CiliumNetworkPolicy 下出站行为、steal 仅 dev+header filter+TTL）；正式推广等 cart 及一个下游完成 K8s DNS 调用。多人并发调试需求出现时再比较 Telepresence personal intercept vs mirrord Teams。

> **PoC 已执行（2026-08-28，同日）**：mirror 全项通过——含 Service ClusterIP 路径（官方 issue #2777 在本集群未复现）与 H2C（毫秒级连发偶丢、1s 间隔 6/6）；Go 1.26.5 注入 20/20 稳定（会话 2–3s）。**steal 判不可用**：agent iptables-nft 装载正常但 BPF host routing 绕过 netfilter，全部未拦截（fail-safe）。裁决与使用约定见 [`2026-08-28-mirrord-poc.md`](2026-08-28-mirrord-poc.md)。

---

## 4. 流处理：Kafka Streams / ksqlDB 在纯 Go 栈下的适用性

**结论：两者均不引入。维持 franz-go 自写消费者（Inbox 幂等 + 状态写 PG + 可重建投影）；触发条件满足后先 POC RisingWave；只有复杂 event-time/大状态才评估 Flink。**

**关键事实**

- Kafka Streams 是嵌入 Java 应用的 JVM 库（[官方 DSL 文档](https://kafka.apache.org/40/streams/developer-guide/dsl-api)），纯 Go 团队引入=长期维护 Java 服务孤岛（JDK/GC/RocksDB 状态/rebalance 运维全套）。
- ksqlDB 未正式弃用（2025 年仍发 v8.0.0），但 Confluent 2025–2026 新增战略投入明显转向 Flink（[官方博客](https://www.confluent.io/blog/2025-q2-confluent-cloud-launch/)）；license 为 Confluent Community License，非 OSI（[license 文档](https://docs.confluent.io/platform/current/installation/license.html)）。新项目不押注。
- Go/轻量替代：Bento（MIT，WarpStream 维护的 Benthos 分叉）适合无状态管道，不是窗口状态引擎；Arroyo（Apache-2.0，被 Cloudflare 收购后路线受其驱动）；RisingWave（Apache-2.0、PG wire protocol、流式物化视图）最契合 SQL 需求但单机起点约 2c/8Gi（[硬件要求](https://docs.risingwave.com/deploy/hardware-requirements)）；Materialize 自管需 K8s+license key 且 BSL。
- 本仓需求盘点：搜索投影/通知/对账/销量累计全部不需要流引擎——都是无窗口幂等 sink 或副作用工作流，franz-go + PG 事实表即可；`sales_daily_agg` 预聚合路线维持。

**触发条件（满足任意两项再 POC RisingWave）**：生产窗口聚合/流 join ≥3 条；≥2 个消费者重复实现 watermark/迟到修正/状态 TTL；报表新鲜度要求 P95 <30s；PG Cron 聚合开始影响 OLTP。Flink 仅当乱序/watermark/多流 temporal join/大状态 checkpoint 成为业务正确性一部分时评估。

---

## 5. Elasticsearch 回归可行性（资源、中文检索、聚合）

**结论：回归可行，「性能够了」的判断在资源侧成立（8–12Gi RAM 可承载单节点生产投影），但必须经固定数据集压测门禁验证后才算数。**

**关键事实**

- 版本与 license：2026 主线 ES 9.x（资料显示 9.4）。**AGPL 自 8.16 起仅是免费部分源代码的许可选项；官方二进制/Docker 发行包仍按 Elastic License 2.0**（[licensing FAQ](https://www.elastic.co/pricing/faq/licensing)）——不能写成「发行版 AGPL」。arm64 自 7.12 起同等支持（[support matrix](https://www.elastic.co/support/matrix)）。
- Heap 规则：≤可用 RAM 50%（上限非目标值），其余给 Lucene page cache；compressed oops 安全上限 ~26GB（[JVM settings](https://www.elastic.co/docs/reference/elasticsearch/jvm-settings)）。当年 6.5G 节点给 1.5Gi heap 的退役决定合理；现在为 ES 预留 8–12Gi RAM/4Gi heap 即有充足余量。
- 中文检索：IK 已迁 [infinilabs/analysis-ik](https://github.com/infinilabs/analysis-ik)（活跃，2026 已合并 ES 9.4 构建修复；包改由 INFINI 分发站提供，需管控供应链）；官方 SmartCN 稳定但不可配置。商品搜索推荐 `name` 多字段（ik_smart 主相关性 + ik_max_word 召回 + keyword + pinyin + ngram）+ synonym_graph；「苹果手机→Apple iPhone」类问题靠同义词/归一化，不是分词器单独能解。
- typo/即时搜索：`fuzziness`/suggester/completion 都能做，但达到 Meilisearch 开箱体验需要 mapping+查询模板+评测投入——不能低估。
- 聚合：terms/date_histogram/sum/cardinality/composite/Transforms 覆盖销量与搜索统计报表；**订单事实报表仍优先 PG 预聚合**，ES 统计索引是派生数据不得成为财务事实源。
- 容量预算：万级 SPU→单索引 1 primary shard/0 replica，单节点 4c/8–12Gi RAM/4Gi heap/100Gi NVMe 起（重建期新旧索引并存+merge 临时空间，磁盘勿贴 85% 水位）；**HA 最低合理拓扑=2 data 节点 + 1 轻量 tiebreaker（voting-only）**——2 个 master-eligible 无法容忍任一节点失效，「双节点 HA」不成立（[voting configurations](https://www.elastic.co/docs/deploy-manage/distributed-architecture/discovery-cluster-formation/modules-discovery-quorums)）。分片扩张信号：单 primary 达 20–40GB 或恢复时间超 RTO。
- 重建模式：PG snapshot/keyset 并行读取 → `_bulk` → count/checksum/query diff 校验 → aliases API 原子 remove/add 切换 → 重放水位后 Kafka 事件；ES sliced scroll 只适用于 ES 内部 reindex，不是 PG 导出机制。
- Go 客户端：`go-elasticsearch/v9` typed API 方向正确（本仓曾用），版本随 ES major 锁定。

**验收门禁（「性能够了」的成立条件）**：三档数据集（1 万/10 万/100 万文档）+ 中文查询集（品牌中英、typo、拼音、属性、无结果）；普通搜索 P95<100ms/P99<250ms、facet 搜索 P95<200ms、投影新鲜度 P95<30s、heap 稳态<75%、磁盘<75%、全量重建在 RTO 内、单节点故障可从 PG 重建。

---

## 6. 零信任与运行时安全：SPIFFE/SPIRE、mTLS、Cilium Service Mesh、Tetragon

**结论：四项现在都不上。P2 前先做低成本高确定性的动作：补全 CiliumNetworkPolicy default-deny、每服务独立 ServiceAccount + 最小 RBAC、关闭无用的 token automount、审计 projected SA token 与「只信任网关头」的边界。**

**关键事实**

- **Cilium Mutual Authentication（SPIFFE mTLS）在 1.20.1 仍是 Beta 且官方自述安全模型不完整**——不能作为逐连接 workload mTLS 使用；「完整 Cilium Service Mesh」也没有可直接套用于小集群的官方内存基准（旧版大规模测试的 ~438MiB agent 均值不可外推）。
- 加密路线排序（按本仓内存紧、单人维护、H2C 现状）：① Cilium WireGuard 节点间透明加密（零应用改造，非 workload 级）——首选，先小范围实测再集群启用；② 需要真 workload mTLS + 授权时首选评估 **Istio Ambient**；③ 应用层 go-spiffe/cert-manager csi-driver-spiffe（活跃，v0.15.0；关键安全点=禁用 cert-manager 默认 approver 防审批竞速）与独立 SPIRE 均暂不引入；④ Linkerd OSS 自 2024 起不再发 semver stable 工件（edge 开放，stable 发行版随厂商资格/费用），不选。
- ConnectRPC 从 H2C 切 mTLS 的代码改动相对集中，但真实成本在身份注册、授权矩阵、证书轮换、探针与运维体系——这正是 P2 定位合理的原因。
- **Tetragon**：试点门槛=arm64 内核 ≥5.10 + BTF；先单节点/单 namespace 观察模式；验收门槛建议：每节点稳态内存 <250Mi、CPU <100m、业务 P99 劣化 <3%、零丢事件（官方安装示例的 151.7M 不是容量承诺）。触发条件=需要运行时取证/合规要求/已出现异常执行事件。

## 7. 供应链安全管线：Cosign/Syft/Kyverno/Trivy/Grype/Gitleaks/zizmor × 三仓分工

**结论：分阶段落地。PR 阶段先跑低噪声三件（Gitleaks、zizmor、Trivy fs/config）；tag 发布阶段加 Syft SBOM + Cosign 签名（GHCR keyless 最成熟；TCR 支持待实测）+ Trivy 镜像扫描；集群 admission 用 Kyverno 从 Audit 单副本起步，实测资源后再 Enforce。**

**关键事实**

- **三仓签名策略**：TCR 个人版（ccr.ccs.tencentyun.com）对 Cosign 签名工件/OCI referrers **无官方确证——标注待实测**；TCR 原生「镜像签名」是企业高级版 Beta、走 KMS `RSA_2048`，不等同 cosign keyless。建议：同一 digest 在 GHCR（keyless，GitHub Actions OIDC）与 TCR 双签，TCR 实测通过后 Kyverno `verifyImages` 才指向 TCR；Harbor 侧只签 Helm 制品（Harbor 对 Cosign/Notation 有原生支持）。
- Cosign 当前 v3.1.3（含 legacy bundle 验证绕过漏洞修复）——版本要钉在修复之后。
- 扫描分工：**Syft（SBOM）+ Trivy（漏洞/配置）为主，不长期双跑 Grype**；没有足够依据宣称某一扫描器在所有场景绝对更准（Anchore/Aqua 各有官方对比立场）。
- **Kyverno**：官方压测环境是高规格 x86_64（KinD/KWOK），**不能外推到 3 节点 arm64 6.5Gi 集群**——必须先 Audit 模式单副本实测常驻内存与 admission 延迟。K8s 原生 ValidatingAdmissionPolicy（CEL）可做结构策略，但**不能替代密码学镜像验签**。
- Gitleaks：CLI 仍 MIT；「组织收费」针对的是官方 GitHub Action 的 org 仓授权——CLI 直跑不受影响。zizmor（GitHub Actions 安全扫描）与 actionlint 互补，不替代。
- Renovate 已在用：叠加 pin digest（容器镜像与 GitHub Actions 均按 digest 钉住）是低成本高价值项。

**P1 最小管线设计**：①PR：`gitleaks detect` + `zizmor`（workflow 审计）+ `trivy fs`（依赖/配置）；②tag：Buildx 构建 → `syft` 生成 SPDX SBOM（cosign attest 附加）→ `cosign sign`（GHCR keyless + TCR 待实测双签）→ `trivy image` 高危阻断；③集群：Kyverno Audit（verifyImages 指向已验证仓库 + 禁 latest + digest 强制）→ 资源实测达标后 Enforce。

---

## 2. Consumer 端 Next.js 深度评估

**结论：建议「局部迁」——新建一个 Next.js（16.3.x，App Router）应用，只承载 Consumer 的公开可收录页（首页/商品详情/分类，ISR 或静态壳+动态边界）；登录后的交易页以及 Merchant/Admin/Tauri 继续 Vite SPA。不整体迁移。**

**关键事实**

- ConnectRPC SSR 集成可行且有官方路径：服务端按请求创建 `@connectrpc/connect-node` transport，用 Next `cookies()`/`headers()` **显式转发** BFF session cookie 给网关；`@connectrpc/connect-query` 通过 `createQueryOptions` + `QueryClient.prefetchQuery` + `dehydrate`/`HydrationBoundary` 完成注水；服务端/浏览器 transport 必须用相同 `addStaticKeyToTransport` key，否则 query key 对不上、注水失效。
- 主要风险清单：①cookie 泄漏——禁止创建全局共享的带 cookie transport（必须 per-request）；②公开页误用 `cookies()` 导致整页动态化、ISR 失效；③K8s 多 Pod 的 ISR 文件缓存不一致（需自定义 cache handler 或接受短 TTL）；④MUI Emotion 在 RSC 下的客户端边界成本；⑤Tauri 静态导出与 Next SSR 冲突——桌面壳继续套 Vite SPA，不套 Next。
- 自托管形态：`output: standalone` + Docker 多阶段即可上 K8s；无 Vercel 依赖；arm64 可用（需实测 standalone 镜像运行内存）。
- 替代路线定位：React Router Framework Mode 成熟度更高但需更换 Router；TanStack Start 代码迁移量最低但仍处 RC/v0——**两者当前都不优于「公开页局部 Next.js」**；Pigment CSS/TanStack Start/React Router 均作为独立后续评估，不与首轮迁移绑定。

**目标路由架构**

```text
Cilium Gateway API
├── 公开多语言、可索引路由 → Next.js App Router（仅 Consumer 公开页）
├── 登录后 Consumer 路由     → 现有 Vite SPA（购物车/结算/订单/个人中心不迁）
├── Merchant / Admin         → 现有 Vite SPA
├── Tauri                    → 现有 Vite 静态产物
└── /api、/auth              → control-tower
```

**实施优先级**：①商品详情垂直 PoC；②验证 `connect-node`、cookie 隔离与 Query hydration；③验证 arm64 standalone 镜像与运行内存；④上线详情/分类/首页公开路由；⑤完成多 Pod 共享缓存后再启用大规模 ISR；⑥最后按数据决定是否采用 PPR。前置联动：本地状态若定 Zustand，可直接用其官方 per-request store 模式。

## 8. 平台工程：OpenCost / Pyroscope vs Parca / Chaos Mesh / Temporal / GlitchTip vs Bugsink

**结论速览**

| 项 | 建议 | 触发条件/前置 | 资源预算（规划值，须实测校准） |
|---|---|---|---|
| OpenCost（v1.121.1，CNCF Incubating） | 改为「**P1 条件评估**」，不写成必装 | 前置：①节点小时成本模型达成共识（Helm `customPricing`，折旧+电力+存储/730h；异构节点才用 CSVProvider）；②VictoriaMetrics 兼容 PoC（Prometheus API 足以起步，但无官方认证矩阵，7 天/30 天窗口查询须实测）；③10 服务统一成本标签。「每订单成本」不是它的原生模型——资源成本÷可归因订单数自建，禁止给 order_id 打 metric label | exporter+UI 合计 100–250m CPU / 256–512Mi（官方默认 request 仅 10m/55Mi，是调度值非容量） |
| 持续性能分析（Pyroscope v2.3.0 / Parca v0.28.0+Agent v0.49.0） | **推迟常驻**；先 pprof/trace/基准 + PGO；触发后优先 **Pyroscope Go SDK push** 小范围 PoC | 触发（至少两项）：30 天内 ≥2 次指标/trace/一次性 pprof 定位不了的性能故障；需跨版本连续对比；CPU 常态 >60% 可分配容量。Parca 风险：官方 issue 明确 **arm64 eBPF profiler 支持不完整**，且 Grafana Parca datasource 已弃用（2027-01 结束支持）；eBPF 全局采集也不替代 Go heap/mutex/goroutine profile | Pyroscope 单体 250–500m / 512Mi–1Gi + 10–20Gi 存储；SDK 端约 <1% CPU（须实测） |
| Chaos Mesh（v2.8.4，2026-08-18，CNCF Incubating） | 「P1 必引入」改为「**P1 条件触发**」：仅 staging、无 Dashboard、只 PodChaos/NetworkChaos | 前置：staging 副本/PDB/告警与生产一致、手工演练 ≥2 轮、每类实验有稳态指标与中止条件、每季度至少跑一次否则撤控制面。对照 Litmus（月更更快但 ChaosCenter+MongoDB 控制面重，单集群场景无收益） | Controller 50m/256Mi + 3×daemon 各 50–100m/64–128Mi，常驻约 0.2–0.35 CPU / 448–640Mi |
| Temporal（v1.31.0） | **P2 待触发维持**，触发信号量化；PG 任务表若要通用化，**下一步先看 River**（Go+PG 事务型队列）而非直接 Temporal | 强信号（任一）：跨服务 >24h durable workflow ≥3 条；单流程 ≥8 持久步骤或 ≥4 补偿分支；人工恢复每月 >4 次或 >8 工时；≥2 个服务各自造 Saga/定时器框架。弱信号（三项连续两迭代）：活跃未来任务 >10 万、到期定时器峰值 >1 万/分钟等。自托管可用 PostgreSQL（12+ 兼 Advanced Visibility，不必 ES）；DBOS Conductor 专有 license、Inngest 会形成第二执行主干，均不选 | 最小非 HA PoC 1.5–3 CPU / 2.5–5Gi；生产 HA 3–6 CPU / 6–12Gi + DB——超出现集群承载，若触发应落外置基础设施 |
| GlitchTip（v6.1.8）vs Bugsink（v2.5.0 现役） | **不建议仅为错误监控迁移**；「已确定」改「**条件采纳**」（⚠️ 与 TECH.md 现行定稿相左，待拍板） | 重评触发（任一）：需要直接看 Sentry SDK transaction/span 而不走 OTel+VictoriaTraces；需要错误频率阈值告警；要统一 uptime/结构化 logs 入口；Bugsink 出现功能缺口。若迁移：先双写 14 天（新建项目→staging 双发→验 grouping/sourcemap/告警→生产灰度→Bugsink 只读保留 30–90 天） | GlitchTip all-in-one 官方最低 256Mi/推荐 512Mi + **PostgreSQL 14+ 必需、Valkey 可选**（PG 可兼任 queue/cache——「必须 Redis+Celery」是过时表述）；Bugsink 部署面仍更窄（单容器/SQLite 可跑），两者均活跃维护 |

**GlitchTip vs Bugsink 的裁决依据**：TECH.md 写 GlitchTip「已确定」的两条理由（兼容 Sentry SDK、比 Sentry 轻）对 Bugsink 同样成立；无任何基准证明 GlitchTip 比 Bugsink 更省内存。真正的差异化收益=transaction/span 端点级 p50/p95 聚合、错误频率告警、uptime/logs 统一入口——而本仓已有 VictoriaTraces+Grafana 承担完整链路，功能重叠。负收益=迁移/双写成本、PostgreSQL 硬依赖、transaction 数据量放大、GlitchTip source map CLI 仍 Beta（Bugsink 已支持标准 sentry-cli+debug ID）。**建议改判：错误监控维持 Bugsink；出现上述触发信号再评 GlitchTip。——已采纳（2026-08-28 用户拍板「维持 Bugsink」，TECH.md A/B 表与 §11.3 已同步改定；接入方案见 [`2026-08-28-bugsink-integration-research.md`](2026-08-28-bugsink-integration-research.md)）。**

**调研代理对 TECH.md B 表的建议口径（待拍板后套用）**：OpenCost→「P1 条件评估：完成 on-prem 定价与 VictoriaMetrics PoC 后决定」；Pyroscope/Parca→「待触发：先手动 pprof/PGO；常驻时优先 Pyroscope，Parca 等 arm64 eBPF 完整支持」；Chaos Mesh→「P1 条件触发：仅 staging，先 PodChaos/NetworkChaos」；Temporal→「P2 待触发：按 durable workflow/补偿/定时器/人工恢复/重复实现指标触发」；GlitchTip→「条件采纳：现役 Bugsink 满足错误监控；需要 performance/频率告警/uptime/logs 时再迁移」。

---

## 附：调研执行说明

- 7 个调研代理并行执行，全部只读，未改仓库、未跑 git；来源以官方文档/GitHub releases/npm registry/许可证原文为主，社区讨论（Reddit/HN/X）仅作定性补充。
- 与 `docs/TECH.md` 的关系：§1/§2/§3 的建议已反映为 TECH.md B 表「评估中」条目的深评输入；§8 的 GlitchTip 结论与 TECH.md 现行定稿相左，**待用户拍板后再改 TECH.md**；其余结论不改变 TECH.md 已定内容。
- 完整过程报告（含全部来源清单）存于各调研代理的会话输出；本文为可执行的浓缩版。
