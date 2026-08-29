# B2B2C 电商平台：生产级架构蓝图与实施纲领（最终修订版）

> Tetragon 三节点 audit-only 闭环之后仍未完成的权限、长期基线、事件完整性、配置残留与 enforcement 门禁，统一见 [Tetragon 后续工作与已知缺口](reports/2026-08-28-tetragon-follow-ups.md)。

## 技术选型总览与研究中项目

### A. 已确定的核心技术选型（非基础设施类）

| 类别 | 技术选型 | 用途说明 |
|------|----------|----------|
| 编程语言 | Go（最新稳定版） | 所有后端微服务的实现语言 |
| 微服务框架 | ConnectRPC（Buf） | 同步 RPC 通信；支持 gRPC、gRPC-Web、Connect 协议 |
| 依赖注入 | Fx（Uber） | 服务内部依赖管理、生命周期管理 |
| 数据库访问 | pgx + sqlc + goose | pgx 作为 PostgreSQL 驱动；sqlc 生成类型安全的查询代码；goose 做数据库迁移 |
| API 定义与代码生成 | Protobuf 3 + Buf CLI + Protovalidate | 定义 API 契约；Buf 管理 proto 文件与兼容性；Protovalidate 做请求参数校验 |
| 前端框架 | React + TanStack Router + TanStack Query | SPA 开发；路由与状态管理 |
| 前端 API 通信 | Connect Query ES + Connect Web + Protobuf-ES | 类型安全的 RPC 客户端；与网关交互 |
| 前端构建 | vite-plus（`vp`） | 开发与构建工具（一体化 dev/build/test/lint/fmt/git 钩子） |
| 桌面端 | Tauri | 桌面客户端壳 |
| 测试 | k6（负载/容量）、Playwright（E2E）、property-based testing（如 gopter）、状态机测试 | 验证容量基线、关键业务旅程、领域不变量 |
| 安全 | Casdoor（IAM）、OpenFGA（关系授权）、Bugsink（错误监控） | 身份认证、对象级授权、前端异常监控 |
| 可观测性 SDK | OpenTelemetry Go SDK + Protobuf-ES 内置追踪 | 日志、指标、链路埋点 |
| 消息序列化 | Protobuf | RPC 与领域事件的统一序列化格式 |
| 构建与 CI | Docker Buildx、GitHub Actions、Renovate | 多架构镜像构建、自动化流水线、依赖更新 |
| 开发内环 | mirrord（mirror）+ Okteto（2026-08-28 PoC 定稿分工） | **观察用 mirrord mirror**（本地 `go run` 按需获得集群 DNS/出站、镜像入站真实流量，只读零影响）；**接管用 Okteto**（`okteto up` 替换工作负载，本地代码真实接请求、复现 Pod 身份）。steal 在本集群不可用不启用（Cilium KPR/BPF host routing 绕过 netfilter）；日常默认仍是本地 `make dev`。证据与使用约定：`docs/reports/2026-08-28-mirrord-poc.md` |

### B. 正在研究和考虑中的技术栈与工具

| 领域 | 技术/工具 | 状态 | 说明 |
|------|-----------|------|------|
| 前端 SSR | Next.js | 已确定：局部迁（2026-08-28 POC 判 go 并转正） | 公开可收录页归 `consumer-next`（App Router，匿名 transport + ISR `revalidate=60`，2 副本 + PDB，`/zh` `/en` `/_next` 前缀分流）；登录后交易页与 Merchant/Admin/Tauri 留 vite-plus SPA。架构规则：公开 ISR 页服务端取数必须匿名，per-request Cookie transport 只用于显式 dynamic 路由。证据：[Next.js POC](reports/2026-08-28-nextjs-poc.md) |
| 前端本地状态 | Zustand | 已确定（2026-08-28 迁移完成） | valtio→zustand 全量迁移收口：3 个 store 重写为 vanilla store + 模块级 action，valtio 依赖移除，顺带修复 `AppBar` 直读 proxy 不订阅的刷新 bug；服务端状态仍归 TanStack Query |
| 前端编译优化 | React Compiler（Oxc 原生） | 已评估：搁置（2026-08-28 试点） | consumer 单应用试点通过（构建/测试/冒烟绿，Zustand 组件零诊断），但原生实现仍实验性、生产构建 2 处显式 bailout、全量 JS gzip +7.97%，运行时收益未证实可抵消体积增长。保持默认关闭，环境变量可复跑同一试点。证据：[试点报告](reports/2026-08-28-react-compiler-pilot.md) |
| 按请求接管（多人个人金丝雀） | Telepresence personal intercept / mirrord Teams | 待触发 | 「多人同时对同一服务做按请求接管」（filter 式个人金丝雀）是 steal 真正不可替代、当前给不了的能力——Okteto 接管是排他的整体替换。触发信号（任一）：出现第二个长期后端贡献者共享 dev 联调；发生「一人的 okteto up/调试会话打断另一人联调」的真实冲突；前端/QA 需同时验证两个未合入后端分支；每人独立环境的资源账算不过来。触发后先验 Telepresence personal intercept（开源，但须复测本集群 Cilium KPR 兼容——mirrord steal 的教训），对照 mirrord Teams（约 $50/人/月）；两者都不行才考虑「基线+泳道」自建染色路由。此前不为此花任何成本。开发内环现行分工见 A 表；mirror 推广门禁：cart 及一个下游完成 K8s DNS 调用 |
| 东西向身份 | SPIFFE/SPIRE | 暂不引入（2026-08-28 调研收口） | 先做低成本高确定性动作：CiliumNetworkPolicy default-deny 补全、每服务独立 ServiceAccount + 最小 RBAC、关闭无用 token automount、审计 projected SA token 与「只信任网关头」边界。需要 workload 级身份时首选评估 Istio Ambient，不单独引入 SPIRE（`csi-driver-spiffe` v0.15.0 活跃，但须禁用 cert-manager 默认 approver 以防审批竞速绕过策略）。证据：[技术调研](reports/2026-08-28-tech-research.md) §6 |
| 传输层安全 | mTLS | 分阶段：先节点级加密（2026-08-28 调研收口） | 优先级排序：①**Cilium WireGuard 节点间透明加密**（零应用改造，非 workload 级）——首选，小范围实测后再全集群启用；②真需要 workload mTLS + 授权时首选评估 Istio Ambient；③**Cilium Mutual Authentication 1.20.1 仍 Beta 且官方自述安全模型不完整，不得当作 workload mTLS**；④Linkerd OSS 自 2024 起不再发 semver stable 工件，不选。ConnectRPC 从 H2C 切 mTLS 的代码改动相对集中，真实成本在身份注册、授权矩阵、证书轮换与探针——这正是它留在 P2 的原因。证据：[技术调研](reports/2026-08-28-tech-research.md) §6 |
| 运行时安全 | Tetragon | 三节点观察与告警闭环已落地（2026-08-28） | chart 1.7.1 在 node101/102/103 `3/3` Ready，ARM64 内核 7.0 BTF 已实测；仅导出 `ecommerce` 的 `PROCESS_EXEC/EXIT/KPROBE`，开启 credential/namespace 上下文。唯一策略 `ecommerce-service-account-token-access` 为 namespaced audit-only，不阻断；原始事件已入 VictoriaLogs，token-access/可疑 exec 指标已入 VictoriaMetrics，vmalert→Alertmanager→通知审计桥已真实注入验收。部署资产在 `~/lens077/kubernetes/components/tetragon/`，策略真相源在 `infrastructure/tetragon/`；enforcement 仍待独立评估 |
| 混沌工程 | Chaos Mesh | P1 条件触发（2026-08-28 由「必引入」改判） | v2.8.4，CNCF Incubating，官方构建链含 arm64。最小形态：**仅 staging**、不装 Dashboard、只启用 `PodChaos`/`NetworkChaos`，禁 StressChaos 与内核/IO/DNS 类。前置门槛（全满足才引入）：staging 副本/PDB/告警与生产一致、手工演练 ≥2 轮、每类实验有稳态指标与中止条件、承诺每季度至少跑一次（否则撤掉控制面）。常驻预算约 0.2–0.35 CPU / 448–640Mi。对照 Litmus：月更更快但 ChaosCenter+MongoDB 控制面更重，单集群场景无收益。证据：[技术调研](reports/2026-08-28-tech-research.md) §8 |
| 供应链安全 | Cosign、Syft、Kyverno、Trivy、Grype、Gitleaks、zizmor | PR、Syft 与 GHCR keyless 已全绿；TCR 单服务兼容实测通过 | PR 三件套已红测并全绿；`1.5.2` 完成 10 服务双架构 SPDX，`1.5.3` 完成 GHCR index keyless 签名与平台 attestation，`1.5.4` 在 TCR `user` 实际 digest 上成功写入并回读同类 Cosign 工件。当前最大缺口是签名前 Trivy image；Kyverno 尚未开始。进度、边界与剩余路线见 [供应链安全演变全景](reports/2026-08-28-supply-chain-evolution-overview.md)，命令与验收证据见 [详细验证报告](reports/2026-08-28-supply-chain-pr-validation.md) |
| 成本治理 | OpenCost | P1 条件评估（2026-08-28 由「P1 引入」改判） | v1.121.1，CNCF Incubating。三项前置未完成前不常驻：①节点小时成本模型达成共识（Helm `customPricing`：硬件摊销+电力+存储+网络 ÷730h；仅异构节点才用 CSVProvider）②VictoriaMetrics 兼容 PoC（Prometheus API 足以起步，但无官方认证矩阵，须实测 7 天/30 天窗口查询不超时）③10 服务统一成本标签。**「每订单成本」不是 OpenCost 的原生模型**——它只给资源成本，业务分摊需自建（资源成本 ÷ 可归因订单数），且**禁止给 `order_id` 打 metric label**（基数爆炸）。预算 100–250m CPU / 256–512Mi（官方默认 request 10m/55Mi 是调度值非容量）。证据：[技术调研](reports/2026-08-28-tech-research.md) §8 |
| 长流程编排 | Temporal | 待触发（P2，2026-08-28 触发信号已量化） | v1.31.0。**强信号（任一即评估）**：跨服务 >24h 的 durable workflow ≥3 条；单流程 ≥8 个持久步骤或 ≥4 个补偿分支；人工恢复每月 >4 次或 >8 工时；≥2 个服务各自实现 Saga/定时器/重试框架。**弱信号（三项连续两个迭代成立）**：PG 活跃未来任务 >10 万、到期定时器峰值 >1 万/分钟、单流程状态机迁移 >15 条边等。PG 任务表若要通用化，**下一步先看 River**（Go + PG 事务型队列，无新增控制面）而非直接上 Temporal。自托管可用 PostgreSQL（12+ 兼 Advanced Visibility，不必 ES）；生产 HA 需 3–6 CPU / 6–12Gi + DB，超出现集群承载，若触发应落外置基础设施。证据：[技术调研](reports/2026-08-28-tech-research.md) §8 |
| 消息流式处理 | Kafka Streams / ksqlDB | 不引入（2026-08-28 调研收口） | 维持 **franz-go 自写消费者**（Inbox 幂等 + 状态写 PG + 投影可重建）：搜索投影、通知、对账、销量累计全是无窗口幂等 sink 或副作用工作流，不需要通用流引擎。Kafka Streams 是嵌入 JVM 应用的库，纯 Go 团队引入 = 长期维护 Java 服务孤岛（JDK/GC/RocksDB 状态/rebalance 全套）；ksqlDB 仍发版但 license 为 Confluent Community License（非 OSI），且 Confluent 新增战略投入已明显转向 Flink。触发（任两项：生产窗口聚合/流 join ≥3 条、≥2 个消费者重复实现 watermark/迟到修正/状态 TTL、报表新鲜度要求 P95 <30s、PG Cron 聚合开始影响 OLTP）后**先 POC RisingWave**（Apache-2.0、PG wire protocol、单机起点约 2c/8Gi）；只有乱序/watermark/多流 temporal join/大状态 checkpoint 成为业务正确性的一部分才评估 Flink。证据：[技术调研](reports/2026-08-28-tech-research.md) §4 |
| 嵌入式分析（OLAP 跑批） | DuckDB（v1.5.5，MIT） | 采纳（试点待执行，2026-08-28） | 定位=**零常驻批分析/报表/对账引擎**：支付渠道账单对账、`behaviors.events` 增量导出 Parquet 落 Silo 后的分析卸载、经营报表 ad-hoc 维度。集成形态：**CLI 子进程跑批优先**——业务服务 `CGO_ENABLED=0` 一字不改（duckdb-go 预编译静态库仍需 cgo）；复杂化后建独立 analytics-runner 镜像（显式 CGO 例外）；不嵌业务服务、不做常驻任意 SQL 服务、不用 Quack（Beta）。红线：不替代 PG（OLTP 真相源）/搜索投影/Kafka/VictoriaMetrics/流处理（<30s 新鲜度归流处理触发项）。升级路径：多写者/快照/模式演进需求出现后启用 DuckLake 1.0（catalog 存 Pigsty PG + Parquet 落 Silo）。与 ClickHouse 关系：承接其触发条款①②的第一响应，CH 触发条件升级为服务化信号。证据：`docs/reports/2026-08-28-duckdb-evaluation.md` |
| 持续性能分析 | Pyroscope / Parca | 待触发（2026-08-28 调研收口） | 先用 Go 原生 `pprof`/trace/基准测试 + PGO，不常驻任何分析平台。触发（至少两项）：30 天内 ≥2 次靠指标/trace/一次性 pprof 定位不了的性能故障；需要跨版本连续对比 profile；CPU 常态 >60% 可分配容量。触发后**优先 Pyroscope Go SDK push**（v2.3.0，与现有 Grafana 契合；预算 250–500m / 512Mi–1Gi + 10–20Gi 存储，SDK 端约 <1% CPU 须实测）；**Parca 暂不选**——官方 issue 明确其新 eBPF profiler 对 arm64 支持尚不完整，且 Grafana 的 Parca datasource 已弃用（2027-01 结束支持）。注意 eBPF 全局采集不替代 Go heap/mutex/goroutine profile。证据：[技术调研](reports/2026-08-28-tech-research.md) §8 |
| 服务网格 | Cilium Service Mesh | 暂不引入（2026-08-28 调研收口） | 维持 Cilium CNI + NetworkPolicy + Gateway API 覆盖。理由：Mutual Authentication 在 1.20.1 仍是 Beta 且官方自述安全模型不完整；官方也没有可直接套用于 3 节点 arm64 小集群的每节点 Envoy 内存基准（旧版大规模 agent 测试数据不可外推）。将来确需 workload mTLS + L7 授权时，评估对象是 Istio Ambient 而非本项。证据：[技术调研](reports/2026-08-28-tech-research.md) §6 |
| 前端错误监控 | Bugsink（现役 2.5.x，node3） | 已确定（2026-08-28 复核维持） | 兼容 Sentry SDK 错误事件；单容器 + PostgreSQL 已稳定运行并接通 ntfy 告警。GlitchTip 改为条件采纳：出现 transaction/span 聚合、错误频率告警或统一 uptime/logs 需求时再评估迁移。接入手册与容量证据见 §11.3 |

---


## 1. 架构定位与核心原则

### 1.1 项目定位

本项目是一个面向中大型生产环境的 B2B2C 电商平台，服务消费者、商家、平台运营与内部管理。系统设计目标是在百万至千万级数据量下，保证**交易正确性、数据一致性、故障可隔离性、容量可预测性**与**变更可回滚性**。它不是一个组件堆砌的 Demo，而是一个有容量模型、有不变量、有故障预算、有恢复证据的工程系统。

### 1.2 核心架构原则

- **正确性优先于性能**：交易、库存、资金流转必须通过数据库不变量和状态机严格约束，禁止“假成功”路径。
- **单一事实源**：PostgreSQL 是 OLTP 唯一真相源。搜索、缓存、分析、事件投影都是可重建的派生数据。
- **深度模块化（Deep Module）**：将复杂性隐藏在小的接口后面。例如 `PaymentPort`、`ObjectStore`、`SearchCatalog`。调用方不应感知 Elasticsearch、Kafka 或 Silo 的细节。
- **显式边界，默认拒绝**：网络、权限、服务间调用均采用白名单模型。后端服务不暴露公网，仅信任网关，且该信任由网络策略强制。
- **容量是可复现的指标**：通过固定数据集、k6 压测脚本和基线报告来证明，而非声称“支持千万级”。
- **可观测性是设计的一部分**：指标、日志、链路必须结构化，且能回答“某个订单为什么失败”这样的业务问题。


## 2. 总体架构与流量拓扑

### 2.1 全局流量路径

```text
客户端 (Web / Next.js / Tauri / Mobile)
        │
        │  QUIC (HTTP/3) · Protobuf-ES
        ▼
[CDN / WAF / Cloud边缘]  ← 大流量清洗、Static ETag/stale-while-revalidate、AVIF/WebP
        │
        │  公网回源
        ▼
[Pangolin 公网入口]  ← 端口转发/安全反向代理 (不叠加 WireGuard/IPsec 隧道)
        │
        │  内网明文转发 (K8s 网络隔离)
        ▼
[Cilium Gateway API]  ← TLS 终止、L7 路由、eBPF 负载均衡 (KPR 严格模式)
        │
        │  CiliumNetworkPolicy: 仅放行 Gateway → control-tower
        ▼
[control-tower 网关]  ← Session 校验 / OpenFGA 鉴权 / 租户路由 / ConnectRPC over H2C
        │
        ▼
[业务微服务 Cell] ──(Outbox 事务)──► [Kafka 编舞事件总线]
   ├── PostgreSQL (Pigsty)               ├── Search Projection (Elasticsearch)
   ├── Dragonfly (故障域隔离)             ├── Notification / Analytics
   └── Inbox (幂等消费)                   └── Reconciliation
```

### 2.2 关键流量节点契约

| 节点层级 | 核心技术选型 | 策略约束与职责 |
|---|---|---|
| 边缘层 | CDN / Cloud WAF | 承接 DDoS/Bot 防御，商品图片与静态资源应用 stale-while-revalidate 缓存 |
| 入口层 | Pangolin Ingress | 负责公网穿透与入口路由，避免公网暴露内部 Service；不引入额外隧道开销 |
| 网关层 | Cilium Gateway API | 终止 TLS；开启 eBPF Kube-proxy Replacement (KPR) 严格模式，绕过 iptables/IPVS |
| 应用网关 | control-tower | 执行 Casdoor Stateful Session 校验与 OpenFGA 关系鉴权；对内透传 HTTP/2 (H2C) |
| 微服务层 | ConnectRPC (Go) | 服务间仅信任网关注入的 X-User-ID / X-Merchant-ID 头部；强制通过 DB 状态机保障业务约束 |


## 3. 协同模型：中心化编排与去中心化编舞的灵活组合

### 3.1 设计决策

系统不采用单一的中心化编排引擎，也不完全依赖去中心化编舞。**根据场景特点灵活组合两种模式，甚至可以在同一个业务流程中混合使用**。这种混合协同模型兼顾了强一致性与系统伸缩性。

**不做全局强制**：各微服务/限界上下文按自身场景自行选择编排、编舞或组合模式（下文 Order 的 Saga 编排是该域的选择，不是全系统模板）；但无论选哪种，都必须符合对应模式的最佳实践——幂等消费、超时与逆向补偿、状态机合法迁移、Outbox/Inbox 契约与全链路可观测。

```text
                               ┌─────────────────────────────────────────┐
                               │   中心化编排器 (Order Process Manager)   │
                               └────────────────────┬────────────────────┘
                                                    │
                                     同步 / 显式状态 Saga 驱动 (强一致性)
                                                    │
         ┌──────────────────────────────────────────┼──────────────────────────────────────────┐
         ▼                                          ▼                                          ▼
┌─────────────────┐                        ┌─────────────────┐                        ┌─────────────────┐
│ Catalog Service │                        │Inventory Service│                        │ Payment Service │
└─────────────────┘                        └─────────────────┘                        └─────────────────┘
         │                                          │                                          │
         └──────────────────────────────────────────┼──────────────────────────────────────────┘
                                                    │
                                   写入 Outbox 事务，发布 Protobuf 领域事件
                                                    │
                                                    ▼
                                     ┌─────────────────────────────┐
                                     │  Kafka 领域事件总线 (编舞)   │
                                     └──────────────┬──────────────┘
                                                    │
                                     异步订阅 / 最终一致性解耦 (副作用/派生数据)
                                                    │
         ┌──────────────────────────────────────────┼──────────────────────────────────────────┐
         ▼                                          ▼                                          ▼
┌─────────────────┐                        ┌─────────────────┐                        ┌─────────────────┐
│SearchProjection │                        │ Notification Svc│                        │ Analytics Svc   │
└─────────────────┘                        └─────────────────┘                        └─────────────────┘
```

### 3.2 两种协同模式的分工与组合

| 模式 | 适用场景 | 驱动机制 | 一致性要求 |
|------|----------|----------|------------|
| **中心化编排（Orchestration）** | 核心交易链路：Checkout → 价格快照 → 库存预占 → 支付意图创建 | Order Service 内置 Saga Process Manager 显式调度，管理状态迁移、超时定时器与逆向补偿路径 | 强一致性 |
| **去中心化编舞（Choreography）** | 派生与副作用链路：搜索投影、通知、分析、对账 | 主流程在数据库事务中达成阶段性终态时，通过 Transactional Outbox 向 Kafka 投递领域事件，下游自行订阅消费 | 最终一致性 |

**组合机制**：
- 编排流程的每一个关键阶段动作均可触发编舞事件（如库存预占成功 → `StockReserved`）。
- 外部编舞事件（如第三方支付异步回调发出的 `PaymentCaptured`）也可作为输入信号驱动编排流程状态机向前演进。
- 同一业务用例中，**同步编排用于强一致的核心步骤，异步编舞用于可延迟的副作用**，两者不是二选一，而是各司其职。


## 4. 数据一致性与事件驱动体系

### 4.1 Transactional Outbox + Relay

业务写操作与事件投递通过 Transactional Outbox + Relay 模型绑定在同一 PostgreSQL 本地事务中：

```text
[ 业务操作请求 ]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ PostgreSQL 事务 (ACID 唯一真相源)                         │
│  ├── 1. 业务数据变更 (UPDATE inventory / ORDER status)  │
│  └── 2. 写入 Outbox 表 (Protobuf Payload + Trace Header)│
└────────────────────────────────────────────────────────┘
       │
       │ (异步轮询 / CDC 读取)
       ▼
[ Relay 进程 ] ──( At-Least-Once 投递 )──► [ Kafka Topic (非 K8s 独立集群) ]
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────┐
│ 消费者服务 (如 search-projection / payment-service)     │
│  ├── 1. 检查 Inbox 表 (或 aggregate_id + event_id 唯一约束) │
│  ├── 2. 未消费则执行领域逻辑                               │
│  └── 3. 提交 Offset 并写入 Inbox 表                       │
└────────────────────────────────────────────────────────┘
```

### 4.2 事件可靠性契约

| 机制 | 约束 |
|------|------|
| **Outbox 保证** | Relay 仅在收到 Kafka Broker 的 `acks=all` 响应后，方可更新 Outbox 表状态为 `published` |
| **Inbox 幂等消费** | 消费端统一维护 `inbox_events` 记录表，主键为 `(consumer_group, event_id)`。重试导致重复消费时，利用唯一键冲突直接忽略 |
| **DLQ 处置机制** | 连续失败超过 5 次的事件直接转投 DLQ Topic，同时触发 Alertmanager 警报，禁止无休止重试阻塞 Partition |
| **Kafka Topic 规划** | 按限界上下文划分。以 `aggregate_id` 作为 Partition Key 保证同一聚合根的事件有序 |
| **事件 Schema** | 使用 Protobuf 定义事件，通过 Buf Schema Registry 管理兼容性。事件 envelope 包含 `event_id`、`aggregate_id`、`tenant_id`、`trace_id`、`schema_version`、`occurred_at` |

### 4.3 防超卖与状态机不变量

**绝对防超卖**：不依赖先查询后更新的竞态条件，而是通过数据库层面的原子更新与条件检查强制保证。库存扣减操作必须在单条语句中完成“检查余额足够”和“扣减”两个动作，任何情况下可用库存不得小于零。

**状态机约束**：订单状态、履约状态等关键状态机必须定义明确的合法迁移边，禁止非法逆向跃迁（如 CANCELLED 状态绝不可迁移至 PAID）。状态迁移由服务内领域逻辑强制执行，不依赖外部消息的投递顺序。

### 4.4 KEDA 与 Kafka 的自动扩缩容

**结论：KEDA 完全兼容 Kafka，无需替换。** KEDA 内置的 Kafka Scaler 直接根据 Consumer Group 的 Lag 自动扩缩容消费者 Deployment：

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: search-projection-scaler
spec:
  scaleTargetRef:
    name: search-projection
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: kafka-cluster:9092
        consumerGroup: search-projection-group
        topic: catalog.events
        lagThreshold: "50"
        activationLagThreshold: "10"
        offsetResetPolicy: latest
```

**HPA 与 KEDA 分工**：HPA 负责在线请求服务（根据 CPU/内存/RPC QPS 伸缩），KEDA 负责 Kafka 消费者（根据 lag 伸缩）。两者不会控制同一资源。


## 5. 微服务设计纲领

### 5.1 服务命名与 DDD 边界

微服务命名**不是按数据库表/实体名词来拆分**，而是按 **DDD 限界上下文（Bounded Context）和业务能力** 来命名。边界划分遵循以下原则：

1. **一致性边界**：需要强一致的数据放在同一个服务内（如订单和订单行；库存流水和余额）。跨服务通过最终一致性（事件）协作。
2. **变化率隔离**：商品目录变化慢，购物车变化快，订单和支付变化频率适中但安全性要求高。分开部署和扩展。
3. **团队拥有**：每个服务可以由一个小组独立开发和演进，接口稳定，内部可替换。
4. **语言边界**：每个服务内部使用统一的领域语言，不同服务的术语不混用。

### 5.2 Identity Service（身份与组织域）

**核心职责**：管理认证主体的业务身份、商家/店铺的组织结构、成员关系，以及对象级授权的业务上下文。它不负责认证本身（认证由 Casdoor 处理），而是负责认证通过后的业务身份和关系维护。

**边界澄清**：
- Casdoor 负责：用户登录、密码、OAuth、MFA、Session 管理、粗粒度角色（admin/merchant/customer）。
- identity-service 负责：用户档案（昵称、头像、联系方式）、商家入驻信息、店铺信息、成员关系（谁属于哪个商家/店铺、什么角色）、业务层面的身份聚合。

**领域模型**：
- `UserProfile`：用户的业务资料（关联 Casdoor user_id）。
- `Merchant`：入驻商家（法律主体、经营信息、结算账户）。
- `Store`：商家经营的店铺（一个商家可有多个店铺）。
- `MerchantMember`：用户在某商家/店铺中的成员关系和职务（如店长、员工、管理员）。
- `Customer`：消费者业务身份（关联 UserProfile，但可能有额外字段如收货地址偏好）。

**关键不变量**：
- 一个用户可以是多个商家的成员，但在同一商家内只能有一个角色（可扩展为多个）。
- 商家只能访问归属于自身的店铺和成员数据。
- 删除成员关系立即生效，不影响历史订单（订单中冗余店铺和用户快照）。

**对外接口（ConnectRPC）**：
- `GetUserProfile` / `UpdateUserProfile`
- `CreateMerchant` / `GetMerchant` / `UpdateMerchant`
- `CreateStore` / `GetStore` / `ListStoresByMerchant`
- `AddMerchantMember` / `RemoveMerchantMember` / `ListMerchantMembers`
- `GetMemberRoles`（供网关查询用户在某店铺的角色）
- `CheckMerchantOwnership`（供其他服务验证商家/店铺归属）

**交互方式**：
- **同步 RPC**：网关在授权时调用 `GetMemberRoles` 获取角色上下文；其他服务需要验证商家/店铺归属时调用 `CheckMerchantOwnership`。
- **异步事件**：发布 `MerchantCreated`、`StoreCreated`、`MemberAdded` 等事件，供通知、审计消费。

### 5.3 Catalog Service（商品目录域）

**核心职责**：管理商品本体、SKU、价格、上架状态，并提供搜索投影的源头数据。商品目录是相对稳定的读多写少域。

**边界澄清**：
- 商品本体与售卖信息分离：`Product` 是商品本体（名称、描述、属性），`Listing` 是商家在某店铺的售卖信息（价格、库存引用、上下架状态）。一个 Product 可以有多个 Listing（不同商家卖同一商品）。
- 库存不属于 Catalog：库存由 `inventory-service` 管理，Catalog 只存储 SKU 的标识和展示信息。
- 搜索投影：Catalog 发布领域事件（`ProductCreated`、`ListingUpdated`）供搜索投影消费，更新 Elasticsearch。

**领域模型**：
- `Product`：商品本体（SPU 级别）。
- `SKU`：具体可售单元（颜色、尺寸等规格）。
- `Listing`：商家在某店铺的售卖信息（关联 Merchant、Store、SKU、价格）。
- `PriceBook`：价格策略（可扩展，初期可简化）。
- `Category`：类目树。

**关键不变量**：
- SKU 必须属于某个 Product。
- Listing 必须属于某个 Store，且 Store 必须属于某个 Merchant。
- 价格变更需要保留历史版本（用于订单快照）。

**对外接口（ConnectRPC）**：
- `CreateProduct` / `UpdateProduct` / `GetProduct`
- `CreateListing` / `UpdateListing` / `GetListing` / `ListListingsByStore`
- `GetListingForCheckout`（供 Order Service 获取强一致的价格快照）
- `SearchProducts`（内部调用，或由网关直接转发给 search-projection，业务侧不直接提供搜索 RPC）

**交互方式**：
- **同步 RPC**：Cart、Order 创建时需要获取 Listing 的价格快照（`GetListingForCheckout`）。
- **异步事件**：`ListingPriceChanged`、`ProductUpdated` 等，供搜索投影、推荐、分析消费。

### 5.4 Cart Service（购物车域）

**核心职责**：管理用户的购物车状态，提供结算前的暂存与校验。购物车是高并发读写的短暂状态，最终会转化为订单。

**边界澄清**：
- 购物车是用户会话级的聚合，不属于交易核心，允许最终一致。
- 购物车中的商品条目是快照（商品 ID、SKU、单价、数量），不实时同步价格变化，而是在结算时重新校验。
- 购物车不处理优惠计算，优惠在 Checkout 阶段由 Order Service 或专门的 Pricing 模块处理。

**领域模型**：
- `Cart`：用户购物车聚合根。
- `CartItem`：购物车条目（SKU、数量、加入时价格快照、选中状态）。

**关键不变量**：
- 购物车属于用户或匿名会话，不允许跨用户访问。
- 条目数量必须 > 0，且有上限（如 100 件）。

**对外接口（ConnectRPC）**：
- `GetCart` / `AddItemToCart` / `RemoveItemFromCart` / `UpdateItemQuantity`
- `CreateCheckoutSession`（将购物车转化为结算会话，返回结算 token）

**交互方式**：
- **同步 RPC**：`CreateCheckoutSession` 调用 Catalog 获取最新价格、调用 Inventory 查询可售库存（不预占），返回校验结果。
- **异步事件**：购物车通常不发布领域事件，但可在结算时生成 `CheckoutStarted` 事件供分析。

### 5.5 Order Service（订单域）

**核心职责**：管理订单状态机、平台订单与商家子订单、订单行、价格快照、优惠快照，是整个交易流程的枢纽。同时，它充当 **Saga 编排器**，协调跨服务的强一致核心流程。

**边界澄清**：
- 订单服务不直接操作库存和支付，而是通过**同步编排**与库存、支付协作（核心链路），同时通过**异步事件**驱动下游副作用。
- 订单创建时，从 Catalog 获取价格快照，向 Inventory 发起预占请求（同步预占以保证强一致），向 Payment 发起支付意图创建。
- 订单服务发布领域事件，供下游消费。

**领域模型**：
- `OrderGroup`：用户一次下单的聚合根，包含多个 `MerchantOrder`。
- `MerchantOrder`：按商家拆分的子订单（关联 Merchant、Store）。
- `OrderLine`：子订单中的具体商品行（SKU、数量、单价、总价）。
- `OrderStateMachine`：状态枚举（`PENDING_PAYMENT`、`PAID`、`FULFILLING`、`COMPLETED`、`CANCELLED`、`REFUNDED` 等）。

**关键不变量**：
- 订单总价 = 所有订单行价格之和（快照不可变）。
- 订单状态只能按状态机允许的边迁移（例如不能从 `CANCELLED` 回到 `PAID`）。
- 同一幂等键（如 `idempotency_key`）只能创建一个订单。
- 订单中的店铺必须存在且属于商家。

**对外接口（ConnectRPC）**：
- `CreateOrder`（从 CheckoutSession 创建，幂等）
- `GetOrder` / `ListOrdersByUser` / `ListOrdersByMerchant`
- `CancelOrder` / `ConfirmPayment`（由支付服务回调触发）
- `UpdateFulfillmentStatus`（由履约服务回调）

**交互方式**：
- **中心化编排（同步 RPC）**：创建订单时，按序调用：
  1. Catalog Service：`GetListingForCheckout` 获取价格快照。
  2. Inventory Service：`ReserveStock` 预占库存。
  3. Payment Service：`CreatePaymentIntent` 创建支付意图。
  若任何步骤失败，编排器自动触发逆向补偿（如调用 Inventory `ReleaseStock`）。
- **异步编舞**：通过 Outbox 发布 `OrderCreated`、`OrderPaid`、`OrderCancelled`、`OrderFulfilled` 等事件。
- **事件订阅**：订阅 `PaymentCaptured`（更新支付状态）、`InventoryReserved`（确认预占成功）、`InventoryReleaseFailed`（触发取消流程）。

### 5.6 Payment Service（支付域）

**核心职责**：管理支付意图、授权、捕获、退款，与外部支付网关（支付宝、微信等）集成。它是资金流转的守卫。

**边界澄清**：
- 支付服务不管理订单金额，订单金额由 Order Service 提供，支付服务只负责执行支付操作并记录结果。
- 支付服务通过 `PaymentPort` 接口抽象外部网关，内部定义 `PaymentIntent`、`PaymentAttempt`、`Authorization`、`Capture`、`Refund` 等实体。
- 支付服务不直接操作账户余额（那是财务域的事，初期可简化）。

**领域模型**：
- `PaymentIntent`：支付意图（关联订单，金额、币种、状态）。
- `PaymentAttempt`：一次支付尝试（网关、交易号、状态、时间）。
- `Authorization`：授权（预授权金额）。
- `Capture`：捕获（实际扣款）。
- `Refund`：退款。

**关键不变量**：
- `Capture` 总额 ≤ `Authorization` 总额。
- `Refund` 总额 ≤ 已 `Capture` 金额。
- 同一支付意图的幂等操作（如重复回调）只处理一次。

**对外接口（ConnectRPC）**：
- `CreatePaymentIntent`（由 Order Service 调用）
- `HandlePaymentCallback`（网关回调，验证签名后处理）
- `Refund`（由 Order Service 或客服触发）
- `GetPaymentStatus`

**交互方式**：
- **同步 RPC**：Order Service 调用 `CreatePaymentIntent`；网关回调调用 `HandlePaymentCallback`。
- **异步事件**：发布 `PaymentAuthorized`、`PaymentCaptured`、`PaymentRefunded` 等，Order Service 订阅更新状态，Notification Service 订阅发送通知。

### 5.7 Inventory Service（库存域）

**核心职责**：管理可售库存、预占、释放、库存流水，是库存正确性的唯一真相源。

**边界澄清**：
- 库存余额是投影，流水才是真相。每次变动都追加 `StockLedger` 记录，余额从流水聚合或通过数据库约束维护。
- 库存服务的核心不变量：可用库存永不小于零，通过数据库约束或事务内检查保证。
- 库存服务不关心价格和商品描述，只关心 SKU 和数量。

**领域模型**：
- `StockItem`：某 SKU 在某店铺/仓库的库存聚合（`available`、`reserved`、`on_hand`）。
- `StockLedger`：库存流水（SKU、变动类型、数量、关联订单号、时间戳）。
- `Reservation`：预占记录（订单、SKU、数量、过期时间）。

**关键不变量**：
- 任何时刻，`available >= 0`。
- 预占和释放必须成对出现，且总量平衡。
- 预占过期后自动释放（通过后台任务或延迟消息）。

**对外接口（ConnectRPC）**：
- `ReserveStock`（同步，供 Order Service 调用）
- `ReleaseStock`（供 Order 取消时调用）
- `ConfirmStock`（支付成功后确认扣减）
- `GetStock` / `ListStockByStore`

**交互方式**：
- **同步 RPC**：Order Service 创建订单时调用 `ReserveStock`，取消时调用 `ReleaseStock`。
- **异步事件**：发布 `StockReserved`、`StockReleased`、`StockShortage`，Order Service 订阅处理（如预占失败则取消订单）。

### 5.8 Fulfillment Service（履约域）

**核心职责**：管理订单履约、发货、物流事件，与外部物流供应商（快递公司、WMS）集成。当前项目没有独立的物流端/仓储端，履约能力内聚于此。

**边界澄清**：
- 履约服务只处理已支付订单的履约流程。
- 通过 `FulfillmentProvider` 接口抽象外部物流，内部管理 `FulfillmentOrder`、`Shipment`、`Package`。
- 仓储管理（WMS）未来可作为独立模块或外部系统集成。

**领域模型**：
- `FulfillmentOrder`：履约单（关联订单、仓库、状态）。
- `Shipment`：一次发货（物流单号、承运商、状态）。
- `Package`：包裹（包含商品行、数量）。
- `TrackingEvent`：物流跟踪事件（从供应商回调或主动查询）。

**关键不变量**：
- 发货数量不得超过订单中该 SKU 的数量。
- 履约状态迁移遵循状态机（`PENDING → PICKING → SHIPPED → DELIVERED → RETURNED`）。

**对外接口（ConnectRPC）**：
- `CreateFulfillmentOrder`（由 Order Service 在支付成功后触发）
- `UpdateTrackingEvent`（物流回调）
- `GetFulfillmentStatus`

**交互方式**：
- **同步 RPC**：Order Service 调用 `CreateFulfillmentOrder`；客服查询履约详情。
- **异步事件**：发布 `ShipmentCreated`、`OrderDelivered` 等，Order Service 更新状态，Notification Service 通知用户。

### 5.9 Notification Service（通知域）

**核心职责**：管理邮件、短信、站内信、推送的发送，是事件驱动架构的典型消费者。

**边界澄清**：
- 通知服务不包含业务逻辑，只负责消息模板渲染和发送。
- 通过 `NotificationPort` 接口抽象发送渠道（SMTP、SMS 网关、WebPush 等）。

**领域模型**：
- `Notification`：通知记录（用户、类型、渠道、状态、内容）。
- `Template`：消息模板（支持变量替换）。

**关键不变量**：
- 同一业务事件（如 `OrderPaid`）对同一用户只发送一次（通过 Inbox 幂等表保证）。

**对外接口（ConnectRPC）**：
- `SendNotification`（内部调用，供其他服务直接发通知，但更推荐事件驱动）
- `ListNotificationsByUser`

**交互方式**：
- **纯事件驱动**：订阅 `OrderCreated`、`OrderPaid`、`OrderShipped`、`PaymentFailed` 等事件，渲染模板并发送。
- **失败重试机制**：Kafka 消费失败进入 DLQ，人工介入。


## 6. 统一领域术语映射表

为了消除团队跨服务沟通和代码实现中的语义歧义，全系统必须统一遵循以下名词定义：

| 领域分类 | 标准术语 | 含义与边界说明 | 关联服务 |
|---|---|---|---|
| 身份组织 | UserProfile | 用户的通用业务属性（头像、昵称），独立于 IAM 账号认证信息 | Identity Service |
| | Merchant | 签署入驻协议的法律主体（商家） | Identity Service |
| | Store | 商家开设的实体/线上店铺，一个 Merchant 可拥有多个 Store | Identity Service |
| | MerchantMember | 用户在某商家/店铺中的成员关系和职务 | Identity Service |
| 商品目录 | Product (SPU) | 标准商品单元，定义商品通用属性（如：iPhone 15） | Catalog Service |
| | SKU | 最小存货单元，定义具体可售规格组合（如：iPhone 15 256G 黑色） | Catalog Service |
| | Listing | 店铺上架项，绑定 Store 与 SKU，包含特定店铺的售价与上下架状态 | Catalog Service |
| 交易订单 | OrderGroup | 用户一次 Checkout 产生的总订单，包含一个或多个商家子订单 | Order Service |
| | MerchantOrder | 归属于单一商家的子订单，作为履约和结算的基本单元 | Order Service |
| | OrderLine | 订单明细行，固化下单时刻的 SKU 信息、快照单价与分摊优惠 | Order Service |
| | Saga Manager | Order Service 内置的分布式事务编排器，显式调度主流程与补偿动作 | Order Service |
| 支付解耦 | PaymentIntent | 支付意图，代表一次交易支付的声明，跟踪整个支付生命周期 | Payment Service |
| | PaymentAttempt | 针对某个意图发起的具体一次支付尝试（可能因通道失败而发起多次尝试） | Payment Service |
| | Authorization | 授权（预授权金额） | Payment Service |
| | Capture | 捕获（实际扣款） | Payment Service |
| | Refund | 退款 | Payment Service |
| 库存管控 | StockItem | 某 SKU 在特定仓库/店铺的实时库存汇总记录 | Inventory Service |
| | StockLedger | 库存变动流水，记录每一次预占、扣减、释放的明细，为绝对真相源 | Inventory Service |
| | Reservation | 库存预占记录，关联订单与 SKU，包含预占数量与到期时间戳 | Inventory Service |
| 履约通知 | FulfillmentOrder | 履约单，对应一个已支付的 MerchantOrder 的发货任务 | Fulfillment Service |
| | Shipment | 物流发货单，包含快递单号、承运商及发货包裹明细 | Fulfillment Service |
| | TrackingEvent | 物流跟踪事件 | Fulfillment Service |
| 基础设施 | Inbox / Outbox | 基于数据库事务的消息收发记录表，用于保证事件投递与消费的 At-Least-Once 与幂等性 | 全服务 |


## 7. 基础设施与部署模型

### 7.1 核心中间件部署拓扑

为保障故障隔离，计算集群 (K8s) 与核心数据/观测存储实施物理/集群级解耦：

```text
[ K8s 业务计算集群 ]                    [ 非 K8s 专用基础设施/数据集群 ]
├── Control-Tower 网关                   ├── PostgreSQL (Pigsty / Patroni HA)
├── 微服务 Pod Cells                     ├── Apache Kafka 集群 + Schema Registry
├── Dragonfly (分实例部署)               ├── Elasticsearch 集群
├── Vector / VMAgent (仅采集器) ──────┐  └── VictoriaMetrics / VictoriaLogs 栈
└─────────────────────────────────┼─────────────────────────────────────
                                  └─► (日志/指标/链路 数据远端写入)
```

| 组件 | 技术选型 | 部署与故障隔离策略 |
|---|---|---|
| OLTP 数据库 | PostgreSQL (Pigsty) | 外部物理机/VM 部署，Patroni 自动 Failover，PgBouncer 连接池治理，UUIDv7 为默认主键 |
| 分布式缓存 | Dragonfly | 严禁混用实例：Session 实例启用 `noeviction` + 持久化；业务 Cache 实例启用 `allkeys-lru`；限流实例独立 |
| 事件总线 | Apache Kafka | 部署于非 K8s 物理集群；按限界上下文规划 Topic，以 `aggregate_id` 作为 Partition Key 保证顺序 |
| 搜索存储 | Elasticsearch | 作为只读 Projection，隐藏于 `SearchCatalog` 接口后；支持从 PG 全量重建索引 |
| 对象存储 | Silo (基于 MinIO) | S3 兼容，开启 Versioning 与 Lifecycle。前端上传统一使用 Backend 签发的预签名 URL |
| 制品仓库 | TCR（主）+ Harbor（Helm）+ GHCR（可选） | TCR 为主仓库，主要存储业务镜像（集群同区直连拉取）；Harbor 存储 Helm 制品（OCI）；GHCR 可选，可同时存储镜像与 Helm 制品，因网络差异是否推送由 CI 决定 |

### 7.2 K8s 网络策略与 Pod 高可用隔离

所有 Namespace 默认开启 **default-deny**，仅允许配置指定的流量矩阵通路：

```text
Cilium Gateway API ──► control-tower 网关 ──► 业务服务 Pod Cells
                                                    │
                     ┌──────────────────────────────┼──────────────────────────────┐
                     ▼                              ▼                              ▼
           PostgreSQL (Pigsty)              Dragonfly (Cache)                Kafka Brokers
```

**Cilium 启用的核心特性**：

| 特性 | 在本项目中的具体用途 |
|------|----------------------|
| CNI 网络 | 所有 Pod 的基础网络层 |
| kube-proxy Replacement | 用 eBPF 完全替代 kube-proxy，Service 负载均衡下沉到内核 |
| KPR 严格模式 | 完全绕过 iptables/IPVS，所有 Service 流量经 eBPF |
| 内置 LB | 为 Cilium Gateway API 提供 L4 负载均衡 |
| Gateway API | 实现 L7 路由、TLS 终止、流量拆分 |
| CiliumNetworkPolicy | 实现 namespace 级 default-deny、白名单流量、FQDN 策略 |
| Hubble | 观测真实流量，验证 NetworkPolicy，排查连通性问题 |

**高可用调度三要素**：

| 机制 | 作用 | 本项目配置 |
|------|------|------------|
| **Pod 反亲和与拓扑分布** | 同时控制整套应用的节点 skew 和同一服务的故障域 | 所有业务 Pod 以共同 `part-of` 标签进入 suite-wide hostname spread，`maxSkew: 1`、`DoNotSchedule`；多副本服务另用 required pod anti-affinity |
| **中断预算 (PDB)** | 声明服务可容忍的最小可用副本数 | 当前只有双副本的 consumer-next 与 gateway 使用 `minAvailable: 1`；其余 13 个单副本 Deployment 无法无损 eviction，扩为多副本并补 PDB 是进入自动重平衡或灰度发布的前置条件 |
| **容量冗余 (N+1)** | 集群总容量 = 峰值需求 + 1 个节点冗余 | 当前尚未完成可信 requests 与单节点故障容量验证；「任意 1 台 Node 宕机不引发级联 Pending」是待验收目标，不是 live 既成事实 |

### 7.3 Pod 容量调度与资源校准

容量治理必须区分三个层次：

| 层次 | 回答的问题 | 工程规则 |
|---|---|---|
| Pod 数量均衡 | 各节点承载多少个业务 Pod | suite-wide `topologySpreadConstraints` 使用 `DoNotSchedule` 和 `maxSkew: 1`；这是硬约束，不是调度偏好 |
| 调度容量均衡 | scheduler 认为各节点还剩多少 CPU/内存 | 所有容器必须提供经过验证的 `resources.requests`；缺失或虚高都会让调度评分失真 |
| 实际利用率均衡 | 节点和容器真实消耗是否接近 | 结合长期指标、VPA 推荐、k6 容量窗口和节点宿主机开销判断，不能用 Pod 数或一次 `kubectl top` 代替 |

VPA 只以 recommendation 模式进入容量流程：当前组件只安装 recommender，业务 VPA 必须使用 `updateMode: Off` 和 `controlledValues: RequestsOnly`。推荐值至少观察 7 天，并覆盖正常发布启动和固定数据集的 k6 容量窗口；Target 只是 requests 候选值，必须与 Uncapped Target、实际峰值、OOM/GC、延迟和 N+1 预算交叉验证。未经这组证据，不启用 updater、admission-controller 或自动 `InPlaceOrRecreate`。

节点重启不保证全局重平衡。Pod 对象仍绑定原节点时，容器通常在原节点恢复；只有 Pod 被终止或驱逐后，新副本才会重新经过 scheduler。原节点恢复不会让已经迁走的 Pod 自动搬回，需要通过告警发现持续 skew，再执行受控 rollout。

**当前定稿不安装 Descheduler**：现有 `5/6/6` 分布〔实测 2026-08-29〕无需修复，13 个单副本服务没有 PDB，requests 尚未校准，node101 的部分内存又来自不可迁移的 control-plane 与宿主机开销。VPA Off 校准后的 requests rollout 本身会触发一次重新调度；在当前三节点、17 个 Pod 的规模下，硬 spread + 可信 requests + skew 告警 + 节点恢复 Runbook 比常驻 eviction 控制器更可控。只有节点变化或 placement drift 反复出现，并且多副本、PDB、N+1 和告警均已验证时，才重新评估 `RemovePodsViolatingTopologySpreadConstraint`；`LowNodeUtilization` 仍需额外证明容量漂移无法由 requests 校准和正常 rollout 收敛。

VPA recommendation-only 的发布证据、经验、回滚与下一步操作见 [`docs/reports/2026-08-29-vpa-recommendation-only.md`](reports/2026-08-29-vpa-recommendation-only.md)；Descheduler 的替代方案与重评条件见 [`docs/reports/2026-08-29-descheduler-decision.md`](reports/2026-08-29-descheduler-decision.md)；容量校准、故障注入与持续告警清单见 [`docs/design/platform/capacity-balancing.md`](design/platform/capacity-balancing.md)。

## 8. 零信任鉴权与统一 Session 架构

### 8.1 架构概览

系统完全废弃 JWT 架构，全面采用以 **Casdoor 为 IAM 相位点 + Dragonfly 持久化 Session Store + OpenFGA 关系授权** 的零信任体系：

```text
客户端 ──(Session Token)──► control-tower ──(验证)──► Dragonfly Session Store
                                │
                                ├──( Check API )──► OpenFGA (鉴权真相源)
                                │
                                └──(透传 X-User-ID / X-Merchant-ID)──► 后端服务
```

### 8.2 OpenFGA 领域关系模型

```python
model
  schema 1.1

type user

type merchant
  relations
    define admin: [user]
    define staff: [user]

type store
  relations
    define parent: [merchant]
    define manager: [user]
    define member: [user]
    define can_view: manager or member or admin from parent
    define can_edit: manager or admin from parent

type order
  relations
    define parent: [store]
    define customer: [user]
    define can_view: customer or manager from parent or admin from parent
    define can_cancel: customer or manager from parent
```

### 8.3 鉴权评估与异常处理矩阵

| 访问场景 | 校验路径 | 决策结果 |
|---|---|---|
| 商家 Admin 跨店铺查看订单 | OpenFGA Check(user:alice, can_view, order:1001) → 解析 order:1001 属于 store:1 属于 merchant:a | ALLOW |
| 商家 Staff 企图跨租户越权 | OpenFGA Check(user:bob, can_view, order:1001) → bob 仅属于 merchant:b | DENY (403) |
| Session 登出/注销 | 直接删除 Dragonfly 中该 Session Key | 即刻失效 (0s 延迟) |
| 第三方 API 对接 | 网关校验 HMAC 签名与 API Key → 映射为对应 Merchant 身份 | ALLOW (注入标头) |


## 9. 统一可观测性体系

### 9.1 部署模式：采集与存储解耦（外置 OTel Collector 中继处理）

计算集群仅部署轻量级采集器，所有日志、指标与链路数据统一通过**外置的 OpenTelemetry (OTel) Collector** 进行中继处理，再分流转投至对应的存储后端。这种模式实现了业务故障域与观测基础设施的绝对隔离，并显著降低业务 K8s 集群的计算资源消耗。

```text
[ K8s 业务集群 Pods ]
   ├── Vector (DaemonSet)  ───(日志数据)───┐
   ├── VMAgent (DaemonSet) ───(指标数据)───┼──► [ 外部集群 OTel Collector 管道 ]
   └── OTel SDK / Agent   ───(链路数据)───┘           │
                                                       ├── 1. PII 敏感信息脱敏 (红化)
                                                       ├── 2. 噪声过滤 (健康检查/无用日志)
                                                       ├── 3. Tail-based Trace 采样
                                                       └── 4. 动态批处理与指标重打标
                                                               │
                                       ┌───────────────────────┼───────────────────────┐
                                       ▼                       ▼                       ▼
                               VictoriaLogs            VictoriaMetrics          VictoriaTraces
```

| 层 | 工具 | 职责 |
|----|------|------|
| 采集层（K8s 集群内） | Vector (DaemonSet) | 节点日志收集，不做复杂过滤 |
| | VMAgent | Metrics 抓取 |
| | OTel SDK / Agent | 通过 OTLP 协议导出 Trace |
| 处理与过滤层（外置 OTel Gateway Pipeline） | OTel Collector | 集中执行尾部采样、PII 脱敏、噪声清洗、动态批处理与指标重打标 |
| 存储层（外置集群） | VictoriaLogs / VictoriaMetrics / VictoriaTraces | 分流转投存储 |

**外置 OTel Collector 管道核心逻辑**：

| 功能 | 描述 |
|------|------|
| **Tail-based Sampling** | 100% 保留包含 Error 或高延迟的调用链，正常请求按 1%~5% 概率采样 |
| **PII 敏感数据脱敏** | 动态正则过滤用户手机号、身份证、支付 Token 等敏感信息 |
| **静态噪声清洗** | 过滤 `/healthz`、`/metrics` 等高频探针日志与链路 |
| **动态批处理与指标重打标** | 按租户/服务维度重新打标，统一指标命名规范 |

### 9.2 Kafka 异步链路追踪上下文传递

针对跨 Kafka 的异步事件，使用 W3C Trace Context 格式将 `traceparent` 注入 Kafka Header，确保分布式链路断点续连：

```text
[ Gateway / HTTP Request ]
       │  (span_id: 01)
       ▼
[ order-service ] ──(写 DB Outbox, 存储 traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01)
       │
       ▼
[ Relay 进程 ] ──(读取 Outbox，透传 Header `traceparent`)──► [ Kafka Topic ]
                                                                   │
                                                                   ▼
[ search-projection ] ◄──(从 Header 提取 traceparent，开辟子 Span)──┘
```


## 10. 服务间通信与服务发现

### 10.1 同步通信：ConnectRPC over HTTP/2

- **协议**：所有服务间同步调用使用 **ConnectRPC over HTTP/2**（gRPC over H2C 或 Connect protocol over H2）。网关与后端之间同样使用 HTTP/2。
- **严禁降级 HTTP/1.1**。HTTP/2 提供多路复用、头部压缩、流式传输、更好的超时和取消语义。
- **Go 实现**：ConnectRPC 的 Go 服务端支持 HTTP/2（使用 `golang.org/x/net/http2`）。在 K8s 内网中，使用 H2C（HTTP/2 Cleartext，不带 TLS）避免 TLS 开销。

### 10.2 服务发现方案

| 环境 | 方案 |
|------|------|
| **生产（K8s）** | Kubernetes Service + CoreDNS，DNS 名格式 `<service>.<namespace>.svc.cluster.local` |
| **pre 半生产测试** | Docker Compose 编排，通过 Compose 服务名作为 DNS 名互访 |
| **Mac 开发内环** | 已定分工（2026-08-28 PoC）：日常默认本地 `make dev` 直连；**观察用 mirrord mirror**（按需集群 DNS/出站/入站镜像）；**接管用 Okteto**（`okteto up` 整体替换，复现 Pod 身份）；steal 不可用不启用。多人按请求接管属待触发评估（见 B 表） |

**统一抽象**：在配置层抽象一个 `ServiceRegistry` 接口，业务代码不感知具体发现机制：

```go
// 开发环境
cfg.GetServiceAddr("inventory-service") // 从环境变量 INVENTORY_SERVICE_ADDR 读取

// 生产环境
cfg.GetServiceAddr("inventory-service") // 从 K8s DNS 解析
```


## 11. 前端技术栈与工程化

### 11.1 当前技术栈（保留）

- **构建**：vite-plus（`vp`）
- **API 通信**：Connect Query ES + Connect Web
- **API 契约**：Protobuf-ES 生成的类型安全客户端
- **状态管理**：TanStack Query 管服务端状态；本地 UI 状态定稿 **Zustand**（2026-08-28 完成 valtio→zustand 全量迁移：3 个 store，vanilla store + 模块级 action）

### 11.2 Next.js 评估

| 维度 | vite-plus + SPA | Next.js |
|------|---------------|---------|
| 首屏速度 | 依赖客户端渲染 | SSR/SSG 显著提升 LCP |
| SEO | 差 | 原生支持 SSR/SSG/ISR |
| ConnectRPC 集成 | Connect Query ES 原生支持 | 需配置 SSR 场景下的数据获取 |
| 适用场景 | Merchant/Admin 后台 | Consumer 端 |

**结论**（2026-08-28 定稿并转正）：Consumer 端**局部迁**——公开可收录页（商品详情起步）归 `consumer-next`（App Router + Connect Query 注水 + ISR 短 TTL `revalidate=60` 缓解多 Pod 缓存不一致），登录后交易页与 Merchant/Admin/Tauri 留 vite-plus SPA，两者共享 API 契约。POC 判定、架构规则（公开 ISR 页匿名取数 / Cookie transport 仅 dynamic 路由）与转正部署证据见 [`docs/reports/2026-08-28-nextjs-poc.md`](reports/2026-08-28-nextjs-poc.md)。

### 11.3 错误监控

**维持 Bugsink**（2026-08-28 复核，推翻此前 GlitchTip 替换定稿）：兼容 Sentry SDK 的错误事件（官方明确不处理 traces/metrics，推荐 `traces_sample_rate=0`），单容器 + PostgreSQL 部署在非 K8s 基础设施节点（node3），New Issue 告警已接通认证 ntfy。复核依据：GlitchTip「兼容 Sentry SDK、比 Sentry 轻」两条理由对 Bugsink 同样成立，且无基准证明 GlitchTip 更省内存；链路追踪已由 OTel + VictoriaTraces 承担，与 Bugsink 职责边界清晰。GlitchTip 转为条件采纳：确需 Sentry SDK 的 transaction/span 端点聚合、错误频率阈值告警或统一 uptime/logs 入口时再评估。**接入手册**（改动清单/验收门禁/回退）见 [`docs/observability/error-monitoring.md`](observability/error-monitoring.md)；**容量证据与调研结论**（node3 实测 55 MiB/0.02% CPU、官方 2 GiB/10 worker≈150 万事件/日容量参考、三阶段接入）见 [`docs/reports/2026-08-28-bugsink-integration-research.md`](reports/2026-08-28-bugsink-integration-research.md)。


## 12. 实施路线图

> **本节只声明「哪件事属于哪个阶段」，不承载完成状态。**
> 进度与待办的唯一真相源是 [`TODO.md`](../TODO.md)，分类明细在 [`docs/todo/`](todo/README.md)。
> 2026-08-29 起本节刻意去掉复选框：目标文档一旦长出第二套勾选视图，必然与 `TODO.md` 漂移
> （当时已实测到漂移——P1/P2 各有一项被勾选，而 P0 九项全空，与真实进度不符）。

**P0 阶段 · 生产发布基线**

核心交易闭环（Cart → Checkout → Order → Payment → Inventory）；
PostgreSQL HA（Pigsty）与 PITR 恢复演练；
Dragonfly 分实例拆分（Session / Cache / Ratelimit）；
Cilium Gateway API + Namespace default-deny 网络隔离；
Outbox + Relay + Kafka（外部集群）+ Inbox 幂等保障；
Casdoor Stateful Session + OpenFGA 鉴权落地；
Vector + VMAgent + OTel → 外部 OTel Collector → VictoriaStack 链路贯通；
固定数据集、k6 基线、容量文档；核心服务 SLO、Runbook、手动故障演练。

**P1 阶段 · 业务扩展与自动化**

Next.js SSR（Consumer 端公开可收录页）；HPA / KEDA 自动伸缩 + Argo Rollouts 灰度发布；
前端接入 Bugsink 错误监控（SDK + Source Map 验收）；
供应链安全扫描流水线（Gitleaks + Trivy + Syft + Cosign + Kyverno）；
Chaos Mesh 自动化故障演练（仅 staging，条件触发）；
商家子账号、履约、售后、结算、双重记账；
数据分区、冷热归档、成本治理（OpenCost，条件评估）。

**P2 阶段 · 极高负载演进（待需求触发）**

SPIFFE/SPIRE 东西向微服务身份标识（当前判定暂不引入，见 B 表）；
Tetragon 运行时安全 enforcement（audit-only 已落地，enforcement 待独立评估）；
多 Region Active-Passive 容灾。


## 13. 绝对工程红线

- **状态绝对收敛**：绝对禁止将业务正确性建立在 Redis/Dragonfly 缓存或 Kafka 投递语义上。所有关键不变量（库存、账目、状态机）必须由数据库本地事务或领域逻辑兜底。
- **链路协议对齐**：网关与后端服务之间、服务与服务之间，必须统一采用 HTTP/2 (H2C) 传输 ConnectRPC，严禁降级到 HTTP/1.1。
- **入口故障隔离**：生产网络入口必须走 Pangolin 或云厂商 LB，内网 Service 通信完全依赖 Cilium 策略隔离，禁止内网服务连通性依赖任何临时公网隧道。
- **单一身份真相**：严格遵循 Casdoor 有状态 Session 模型，绝不允许同时维护 JWT 兼容逻辑或双重鉴权代码路径。
- **严禁虚拟容量**：严禁在未经压测基线 (k6) 验证和恢复演练的前提下声称平台支持千万级容量。
- **禁止复制粘贴**：配置、日志、OTel 初始化代码必须提取共享库，禁止复制到多个服务。
- **禁止将 ArgoCD 作为摆设**：GitOps 断线等于没有部署真相源。

# 架构文档规范出处对照表

以下按架构文档中各技术决策和模式的出处，逐一列出对应的官方规范、标准或权威文档。


## 1. 通信协议与 API 契约

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **QUIC / HTTP/3** | [RFC 9000 (QUIC)](https://www.rfc-editor.org/rfc/rfc9000)、[RFC 9114 (HTTP/3)](https://www.rfc-editor.org/rfc/rfc9114) | IETF 标准，QUIC 传输协议与 HTTP/3 语义 |
| **HTTP/2** | [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113) | 多路复用、头部压缩（HPACK，RFC 7541）、流式传输 |
| **Protobuf 3** | [Protocol Buffers Language Specification](https://protobuf.dev/reference/protobuf/proto3-spec/) | Google 官方 proto3 语言规范 |
| **ConnectRPC** | [Connect Protocol Specification](https://connectrpc.com/docs/protocol/) | Buf 官方 Connect 协议文档，定义 gRPC/gRPC-Web/Connect 三种协议的语义 |
| **gRPC over HTTP/2** | [gRPC over HTTP/2 (gRFC A2)](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md) | gRPC 官方 HTTP/2 映射规范 |
| **Buf Schema Registry** | [Buf BSR Documentation](https://buf.build/docs/concepts/modules-workspaces/) | Buf 官方文档：模块、兼容性检查、breaking change 检测 |
| **Protovalidate** | [Protovalidate Documentation](https://github.com/bufbuild/protovalidate) | Buf 官方验证框架，基于 Common Expression Language (CEL) |
| **W3C Trace Context** | [W3C Trace Context Recommendation](https://www.w3.org/TR/trace-context/) | `traceparent` header 标准格式，用于 Kafka 异步链路追踪 |
| **CloudEvents** | [CloudEvents Specification (CNCF)](https://cloudevents.io/) | 事件 envelope 标准（可选采用） |


## 2. Kubernetes 与云原生基础设施

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **Kubernetes Gateway API** | [Gateway API Specification](https://gateway-api.sigs.k8s.io/) | K8s SIG-Network 官方规范，L7 路由、TLS 终止、流量拆分 |
| **Cilium CNI** | [Cilium Documentation](https://docs.cilium.io/) | Cilium 官方文档：CNI、KPR、NetworkPolicy、Hubble |
| **CiliumNetworkPolicy** | [CiliumNetworkPolicy Reference](https://docs.cilium.io/en/stable/security/policy/) | Cilium 官方网络策略 CRD 文档 |
| **Kube-proxy Replacement (KPR)** | [Cilium KPR Documentation](https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/) | Cilium 官方：eBPF 替代 kube-proxy 的说明 |
| **Hubble** | [Hubble Documentation](https://docs.cilium.io/en/stable/observability/hubble/) | Cilium 官方：网络可观测性 |
| **KEDA Kafka Scaler** | [KEDA Kafka Scaler Specification](https://keda.sh/docs/2.16/scalers/apache-kafka/) | KEDA 官方文档：Kafka lag 驱动自动扩缩容 |
| **HPA** | [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) | K8s 官方：基于 CPU/内存/自定义指标的自动伸缩 |
| **Pod Disruption Budget (PDB)** | [Kubernetes PDB Documentation](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/) | K8s 官方：自愿中断预算 |
| **Topology Spread Constraints** | [Kubernetes Topology Spread Documentation](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/) | K8s 官方：跨节点/可用区均匀分布 |
| **Pod Anti-Affinity** | [Kubernetes Affinity/Anti-Affinity](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/) | K8s 官方：调度约束 |
| **ArgoCD** | [ArgoCD Documentation](https://argo-cd.readthedocs.io/) | GitOps 声明式交付标准工具 |
| **Argo Rollouts** | [Argo Rollouts Documentation](https://argoproj.github.io/rollouts/) | Canary/Blue-Green 发布策略 |


## 3. 数据一致性与事件驱动

| 模式/技术 | 规范/标准出处 | 说明 |
|---|---|---|
| **Transactional Outbox Pattern** | [Microservices.io: Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) | Chris Richardson 的微服务模式权威文档 |
| **Saga Pattern** | [Microservices.io: Saga](https://microservices.io/patterns/data/saga.html) | 分布式事务补偿模式 |
| **Choreography vs Orchestration** | [Microservices.io: Choreography](https://microservices.io/patterns/data/saga.html#solution-using-choreography) | 编舞与编排的对比与适用场景 |
| **Inbox Idempotency** | [Microservices.io: Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html) | 消费端幂等模式 |
| **Apache Kafka** | [Kafka Documentation](https://kafka.apache.org/documentation/) | 官方文档：Topic、Partition、Consumer Group、acks 语义 |
| **Kafka Exactly-Once / At-Least-Once** | [Kafka Semantics](https://kafka.apache.org/documentation/#semantics) | Kafka 官方：投递语义定义 |
| **Domain-Driven Design (DDD)** | [Domain-Driven Design: Tackling Complexity in the Heart of Software (Eric Evans)](https://www.domainlanguage.com/ddd/) | DDD 原始著作，限界上下文、聚合根、领域语言 |
| **Saga Choreography & Orchestration (NServiceBus)** | [NServiceBus Sagas](https://docs.particular.net/nservicebus/sagas/) | 微软生态中 Saga 模式的详细实践 |


## 4. 身份认证与授权

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **Casdoor** | [Casdoor Documentation](https://casdoor.org/docs/overview) | 开源 IAM 平台官方文档 |
| **OpenFGA** | [OpenFGA Documentation](https://openfga.dev/docs) | 关系型访问控制官方文档 |
| **OpenFGA Modeling Language (DSL)** | [OpenFGA DSL Specification](https://openfga.dev/docs/modeling/building-blocks) | 关系模型 type definitions 语法 |
| **Relationship-Based Access Control (ReBAC)** | [Google Zanzibar Paper](https://research.google/pubs/pub48190/) | Google Zanzibar 原始论文，OpenFGA 的理论基础 |
| **OAuth 2.0** | [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) | Casdoor 支持的 OAuth 标准 |
| **OIDC** | [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) | Casdoor 支持的 OIDC 标准 |
| **Stateful Session** | [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) | OWASP：有状态 Session 的安全实践 |


## 5. 可观测性

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **OpenTelemetry** | [OTel Specification](https://opentelemetry.io/docs/specs/otel/) | CNCF 标准：Trace、Metrics、Logs 三大信号 |
| **OTLP Protocol** | [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/) | OTel 数据导出协议 |
| **Tail-based Sampling** | [OTel Sampling Documentation](https://opentelemetry.io/docs/concepts/sampling/) | 尾部采样策略 |
| **VictoriaMetrics** | [VictoriaMetrics Documentation](https://docs.victoriametrics.com/) | 官方文档：Metrics 存储与查询 |
| **VictoriaLogs** | [VictoriaLogs Documentation](https://docs.victoriametrics.com/victorialogs/) | 官方文档：日志存储 |
| **VictoriaTraces** | [VictoriaTraces Documentation](https://docs.victoriametrics.com/victoriatraces/) | 官方文档：Trace 存储 |
| **Vector** | [Vector Documentation](https://vector.dev/docs/) | 日志采集器官方文档 |
| **VMAgent** | [VMAgent Documentation](https://docs.victoriametrics.com/vmagent/) | Metrics 抓取与转发 |
| **Grafana** | [Grafana Documentation](https://grafana.com/docs/) | 可视化平台 |
| **Alertmanager** | [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/) | 告警路由与通知 |
| **SLO / Error Budget** | [Google SRE Book](https://sre.google/sre-book/service-level-objectives/) | Google SRE：SLO 定义与错误预算 |


## 6. 数据库与存储

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **PostgreSQL** | [PostgreSQL Documentation](https://www.postgresql.org/docs/) | 官方文档：事务、约束、索引、分区 |
| **Pigsty** | [Pigsty Documentation](https://pigsty.io/docs/) | 开源 PostgreSQL HA 发行版 |
| **Patroni** | [Patroni Documentation](https://patroni.readthedocs.io/) | PostgreSQL 自动故障转移 |
| **PgBouncer** | [PgBouncer Documentation](https://www.pgbouncer.org/) | 连接池治理 |
| **pgx** | [pgx Documentation](https://github.com/jackc/pgx) | Go PostgreSQL 驱动 |
| **sqlc** | [sqlc Documentation](https://docs.sqlc.dev/) | 类型安全 SQL 代码生成 |
| **goose** | [goose Documentation](https://pressly.github.io/goose/) | 数据库迁移 |
| **Dragonfly** | [Dragonfly Documentation](https://www.dragonflydb.io/docs) | Redis 协议兼容缓存 |
| **Elasticsearch** | [Elasticsearch Documentation](https://www.elastic.co/docs) | 搜索引擎 |
| **Silo (MinIO)** | [MinIO Documentation](https://min.io/docs/) | S3 兼容对象存储 |


## 7. 供应链安全

PR 阶段已经落地 Gitleaks、zizmor、Trivy fs/config 三件套，并采用「Gitleaks 扫提交范围，zizmor/Trivy 只阻断基线外新增项」的棘轮门禁。tag `1.5.2` 已验收 10 服务双架构 SPDX；`1.5.3` 已验收 GHCR Cosign 3.1.3 keyless index 签名与平台 SBOM attestation；`1.5.4` 已在 TCR `user` 实际 digest 上完成同类工件写入和回读。TCR 结论是有边界的兼容实测，不是腾讯云官方承诺。当前最大缺口为签名前 Trivy image；TCR 全服务扩展、Harbor Helm 签名和 Kyverno `verifyImages` 尚未完成。目标、演变、已做/未做、遗漏与剩余路线见 [供应链安全演变全景](reports/2026-08-28-supply-chain-evolution-overview.md)，详细命令与验收证据见 [供应链验证报告](reports/2026-08-28-supply-chain-pr-validation.md)。

| 技术/标准 | 规范/标准出处 | 说明 |
|---|---|---|
| **SLSA** | [SLSA Specification](https://slsa.dev/) | 软件供应链安全等级框架 |
| **SBOM** | [SPDX Specification](https://spdx.dev/specifications/)、[CycloneDX](https://cyclonedx.org/specification/overview/) | 软件物料清单标准 |
| **Syft** | [Syft Documentation](https://github.com/anchore/syft) | SBOM 生成工具 |
| **Cosign** | [Cosign Documentation](https://docs.sigstore.dev/cosign/overview/) | Sigstore 镜像签名 |
| **Kyverno** | [Kyverno Documentation](https://kyverno.io/docs/) | K8s 策略引擎 |
| **Trivy** | [Trivy Documentation](https://aquasecurity.github.io/trivy/) | 镜像漏洞扫描 |
| **Gitleaks** | [Gitleaks Documentation](https://github.com/gitleaks/gitleaks) | 密钥泄露检测 |
| **zizmor** | [zizmor Documentation](https://woodruffw.github.io/zizmor/) | CI/CD 安全检查 |
| **Renovate** | [Renovate Documentation](https://docs.renovatebot.com/) | 依赖自动更新 |


## 8. 前端与客户端

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **React** | [React Documentation](https://react.dev/) | 官方文档 |
| **TanStack Router** | [TanStack Router Documentation](https://tanstack.com/router/latest) | 类型安全路由 |
| **TanStack Query** | [TanStack Query Documentation](https://tanstack.com/query/latest) | 服务端状态管理 |
| **Connect Query ES** | [Connect Query Documentation](https://connectrpc.com/docs/web/query/) | ConnectRPC 的 TanStack Query 集成 |
| **Protobuf-ES** | [Protobuf-ES Documentation](https://github.com/bufbuild/protobuf-es) | Buf 官方前端 Protobuf 运行时 |
| **Vite** | [Vite Documentation](https://vite.dev/) | 构建工具 |
| **Tauri** | [Tauri Documentation](https://tauri.app/) | 桌面客户端框架 |
| **Next.js** | [Next.js Documentation](https://nextjs.org/docs) | SSR/SSG 框架（已定局部迁：Consumer 公开页） |
| **Playwright** | [Playwright Documentation](https://playwright.dev/) | E2E 测试 |
| **k6** | [k6 Documentation](https://grafana.com/docs/k6/latest/) | 负载测试 |
| **Lighthouse CI** | [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci) | Web 性能指标（LCP/INP/CLS） |


## 9. 安全与网络策略

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **Cilium Network Policy** | [Cilium Network Policy Docs](https://docs.cilium.io/en/stable/security/policy/) | L3/L4/L7 网络策略 |
| **Kubernetes NetworkPolicy** | [K8s NetworkPolicy Documentation](https://kubernetes.io/docs/concepts/services-networking/network-policies/) | K8s 原生网络策略 |
| **Zero Trust Architecture** | [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) | 零信任架构标准 |
| **HMAC API 认证** | [RFC 2104 (HMAC)](https://www.rfc-editor.org/rfc/rfc2104) | 第三方 API 签名认证 |
| **mTLS** | [RFC 8446 (TLS 1.3)](https://www.rfc-editor.org/rfc/rfc8446) | 双向 TLS 认证（分阶段：先 WireGuard 节点级） |
| **SPIFFE/SPIRE** | [SPIFFE Specification](https://spiffe.io/docs/latest/spiffe-about/overview/) | 工作负载身份标准（暂不引入） |


## 10. 故障演练与混沌工程

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **Chaos Mesh** | [Chaos Mesh Documentation](https://chaos-mesh.org/docs/) | K8s 混沌工程平台（P1 条件触发，仅 staging） |
| **Chaos Engineering Principles** | [Principles of Chaos Engineering](https://principlesofchaos.org/) | 混沌工程核心原则 |
| **Toxiproxy** | [Toxiproxy Documentation](https://github.com/Shopify/toxiproxy) | 网络故障注入工具 |


## 11. 测试与质量保证

| 技术/模式 | 规范/标准出处 | 说明 |
|---|---|---|
| **Property-Based Testing** | [gopter Documentation](https://github.com/leanovate/gopter) | Go 属性测试库；不变量验证 |
| **State Machine Testing** | [State Machine Testing Pattern](https://www.infoq.com/articles/state-machine-testing/) | 状态机合法性验证 |
| **pgbench** | [pgbench Documentation](https://www.postgresql.org/docs/current/pgbench.html) | PostgreSQL 基准测试 |


## 12. 总结：规范优先级

在实施过程中，当存在多个规范来源时，按以下优先级排序：

1. **IETF RFC / W3C Recommendation**：作为协议级标准，最高优先级（如 HTTP/2、QUIC、Trace Context）。
2. **CNCF 官方规范**：作为云原生生态标准（如 Gateway API、OTel、CloudEvents）。
3. **K8s 官方文档**：作为平台行为标准（如 PDB、HPA、NetworkPolicy）。
4. **组件官方文档**：作为具体实现的行为规范（如 Cilium、KEDA、OpenFGA、Casdoor）。
5. **行业公认模式文档**：作为设计模式参考（如 Microservices.io、Google SRE Book、NIST）。

以上所有链接均为各技术或模式的**官方规范、标准文档或权威来源**，可直接作为实施依据和团队培训材料。