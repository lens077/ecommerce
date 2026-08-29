# 可观测性方法论与指标基线

> 创建:2026-08-07。定位:**方法论 + 本仓指标基线清单**(应采什么、为什么、异常了该做什么)。
> 与其他文档的关系:落地阶段与验收标准见 `DEVOPS.md` §5/阶段3;
> 当前实况与缺陷以 `.service-matrix.yaml`、`docs/reports/2026-08-27-infrastructure-audit.md` 和 `TODO.md` 为准；旧 review 只作历史证据;
> 看板生成脚本在 `grafana/`（本目录下）；[`面板设计.md`](面板设计.md) 保留指标口径与信息架构，但其中 VictoriaTraces/VictoriaLogs/vmalert 目标态配置尚未全部落地，不能作为现网部署真相源。
> 核心取向(消化自 2026-08 一篇 Prometheus 方法论文章,结合本仓教训):
> **上线前关注功能对不对,上线后要回答的是「服务现在健康吗」**。没有指标,出问题只能
> 看日志、查服务器、猜。

---

## 1. 三支柱分工:不是三选一,是三问三答

| 支柱 | 回答的问题 | 本仓实现 |
|------|-----------|----------|
| Logs | **发生了什么?** | 应用 OTel logs + Kubernetes Vector → VictoriaLogs |
| Trace | **一次请求经过了哪里?** | OTel SDK（otelconnect）→ collector → VictoriaTraces |
| Metrics | **系统现在怎么样 / 是否正在变坏?** | OTel metrics → collector → VictoriaMetrics（Prometheus 兼容） |

排障动线:**Metrics 发现异常 → Trace 定位调用链 → Logs 看具体错误**。
三者靠 trace_id 与统一资源标签(`service.name`/`service.namespace`/`service.instance.id`)互跳——
这也是为什么标签规范是硬规则(见 §6)。

Prometheus 与 OpenTelemetry 不是竞争关系：本仓用 OTel 统一应用侧采集与传输，VictoriaMetrics 做 Prometheus 兼容指标存储，Grafana 统一展示。当前规则评估与分发链是 `vmalert → Alertmanager → node3 bridge → authenticated ntfy`；firing/resolved receiver 已实测，规则语义仍须逐条注入故障验收。`面板设计.md` 中基于 Grafana unified alerting 的旧结论须按现网重新验收。

## 2. 方法论:RED 看服务,USE 看资源

**RED(每个服务/每条 RPC 都要有)**:

- **R**ate — 请求量(QPS)。没有流量基线就无法判断异常;
- **E**rrors — 错误率(**比率**,如 5xx/Total 或 `rpc.code!="ok"`/Total,不是每秒错误数——
  本仓看板曾把「DB 错误率」画成错误/秒,评审已抓过,口径写死在这);
- **D**uration — 延迟分位数。**不看平均值**,看 p50/p95/p99:少量慢请求就能毁掉用户体验,
  平均值会把它们抹平。

**USE(每种资源:节点、连接池、队列)**:

- **U**tilization — 利用率(CPU、内存);
- **S**aturation — 饱和度(队列长度、连接池等待数)。**很多线上故障不是资源挂了,
  是池子满了**——饱和度是比利用率更早的预警;
- **E**rrors — 资源层错误(磁盘、网络)。

## 3. 本仓指标基线(每个 Go 服务上线后的最低配置)

> 判断一个指标要不要采,只问一句:**这个指标异常了,我应该做什么?**
> 答不上来的不采。指标不是越多越好——存储涨、查询慢、没人维护;
> 本仓已付过基数学费:`net_peer_port` 按 TCP 连接取值导致 rate() 恒为 0、请求率/错误率全错
> (已修,`WithoutServerPeerAttributes()`)。

### 3.1 服务层(RED,来自 otelconnect,10 服务同构中间件)

| 指标 | 异常时的行动 |
|------|-------------|
| RPC QPS(按 service + rpc.method) | 对照基线:突降查上游/网关/发现,突增查刷量/重试风暴(网关重试放大已有前科:内层 3×路由 2=一个 POST 打 6 次,已收敛) |
| p50/p95/p99 延迟 | p99 单独恶化 → 查慢查询/GC/锁;整体抬升 → 查依赖服务,用 trace 下钻 |
| 错误率(`rpc.code` 维度) | 突升即告警。⚠️ 口径注意:成功记 `"ok"` 的修复**只落在日志侧,metrics 实况并非如此**(实测见 `面板设计.md` §实测口径)——面板与告警一律按 `面板设计.md` 的实测口径写,不要按本行早期说法 |
| 状态码/错误码分布 | 区分是客户端错(4xx/invalid_argument)还是服务端错(5xx/internal),定位责任边界 |

### 3.2 Go 运行时(RED 之下第一层怀疑对象)

| 指标 | 异常时的行动 |
|------|-------------|
| **Goroutine 数** | 持续增长 = 泄漏/Channel 阻塞/资源未释放,按服务定位到最近变更;这是 Go 服务最重要的单一健康指标 |
| GC 压力(runtime instrumentation v0.70 **无 GC pause 指标**,用调度延迟直方图 `go.schedule.duration` 做替代信号,见 TODO.md 面板体系行) | 接口变慢不一定是数据库——先排除 GC/调度压力 |
| Heap / Allocation rate | 与 GC 联看;持续爬升配合 goroutine 平稳 → 查缓存无界增长 |

### 3.3 依赖层(USE,故障往往在这层先冒头)

| 指标 | 异常时的行动 |
|------|-------------|
| **pgx 连接池**:active / idle / **wait count** | 「很多故障不是数据库挂了,是连接池耗尽」——wait 出现即预警,查慢查询占坑或池子配小 |
| Redis:连接数、**命中率**、响应时间、错误数 | 经典联动:**Redis Hit ↓ + DB QPS ↑ = 缓存失效击穿**,两条曲线必须放同一张看板 |
| Kafka **consumer lag / lag growth / rebalance / commit latency**；迁移期同时看 NATS pending/redelivery | 持续增加 = 消费能力不足、rebalance 抖动或 poison message；扩消费者前先查幂等、retry/DLQ 与下游慢逻辑。首个 Kafka consumer 必须同时带指标与告警 |
| Elasticsearch / S3-compatible / Consul 客户端错误数；迁移期同时看 Meilisearch | 依赖不可用通常先于业务错误率上升，需与 gateway 无节点、搜索投影 lag 联看；目标搜索依赖是隐藏在 `SearchCatalog` 接口后的 Elasticsearch 只读投影 |

### 3.4 资源层(USE,节点与容器)

资源层目标覆盖 CPU、内存、磁盘、网络、Kubernetes 对象状态和 Event。当前 `k8s_cluster` 已提供 workload desired/available、Pod phase、container ready/restart 和 requests/limits；`k8sobjects` 已采集 Event。容器实际 CPU/MEM、filesystem、network 和 OOM reason 仍需 kubeletstats/cAdvisor，不能把 requests/limits 当成实际利用率。

资源观测要覆盖 3 个 Kubernetes 节点、Cilium/Gateway、Vector DaemonSet，以及集群外 node3 的 PG/OTel/Victoria 数据面。对象状态作为 metrics 写 VictoriaMetrics，Event 作为 logs 写 VictoriaLogs。Gatus 直接查询 VictoriaLogs 中 24 小时内的 `object.kind=Event`，不以 receiver counter 代替落库验证。node3 或 Pangolin 故障会同时影响数据库与观测链，必须把隧道可达性、restart、磁盘、连接池和 collector 丢弃量作为高优先级告警源。

## 4. 采集架构

```text
10 × Go Service + control-tower gateway
  └── OTel SDK / Agent（OTLP 导出 trace；部分 logs 现网鉴权失败）──┐
Kubernetes stdout → Vector DaemonSet（轻量采集，不做复杂过滤）──────┤
VMAgent（指标抓取）───────────────────────────────────────────────┤
Kubernetes OTel collector(k8s_cluster + k8sobjects，存量)─────────┤
                                                                 ▼
                                            外置 OTel Collector 中继
                                              ├── 尾采样：Error/高延迟 100%，正常 1%~5%
                                              ├── PII 脱敏与 /healthz、/metrics 噪声过滤
                                              ├── 动态批处理与按租户/服务重打标
                                              └── VictoriaMetrics / VictoriaLogs / VictoriaTraces
Grafana → VM/VL/VT                 vmalert → Alertmanager → ntfy
Gatus / Healthchecks / Bugsink / certificate timer ───────→ ntfy
```

- 应用 OTel SDK 装配在同构 `internal/pkg`，gateway 在 control-tower 中独立装配。SDK 支持资源标签、gzip 与 OTLP 认证；最终采样决策由外置 OTel Collector 的尾采样承担，SDK 侧不承担最终采样决策。2026-08-27 现网多个服务向 `node3-otlp.apikv.com/v1/logs` 发送时收到 `401 missing or empty authorization header`；必须单独修正运行时 endpoint/header，不能把代码支持写成现网已生效。
- 容器 stdout 由 Vector 直接写 VictoriaLogs 是存量现状，目标态按 [`docs/TECH.md`](../TECH.md) §9.1 收为「Vector 轻量采集 → 外置 OTel Collector 中继 → VictoriaLogs」。stdout 链与 Kubernetes Event 链当前正常；排查日志缺失时必须区分「应用 OTel log」「容器 stdout」和「Kubernetes Event」三条链。
- collector、Vector、Pangolin、Victoria 后端和 Alertmanager 都必须自监控；配置存在不等于数据到达。

## 5. 告警:方法论(规则清单已落地,真相源在面板设计.md)

指标存在但没有告警 = 只有事后分析能力,没有「提前发现故障」能力(文章的核心判词:
**成熟的监控不是收集更多指标,而是找到能帮你提前发现故障的那些**)。

历史上由 `grafana/build_alerts.py` 生成过 17 条 Grafana unified alerting 规则；现网已迁为 vmalert + Alertmanager，规则是否等价迁移必须逐条实测。Alertmanager 的 firing/resolved payload 已经通过本机 bridge 实际送达认证 ntfy；这只证明 receiver 链可用，不代表 17 条规则都已完成故障注入。

ntfy 不是单一兼容 webhook：Gatus 用 `custom` provider 直接 POST ntfy 的 JSON 发布格式（2026-08-29 由内置 bearer `ntfy` provider 改造，因其通知文案硬编码在 Go 源码里、无法中文化），Healthchecks 使用 v4.3 原生 `ntfy` Channel，Bugsink（错误监控定稿，2026-08-28 复核维持，兼容 Sentry SDK 错误事件）通过带随机 URL token 的本机 Slack-compatible bridge，证书 timer 由 root wrapper 直接发布。token、topic、Healthchecks ping URL 和错误监控 DSN 均不得进入仓库或日志。**告警与通知链路接入手册**（三条链路边界、Gatus 中文化、K8s 指标点号命名口径、验收与回退）见 [alerting-notification.md](alerting-notification.md)；前端 SDK 接入手册见 [error-monitoring.md](error-monitoring.md)，容量证据见 [`../reports/2026-08-28-bugsink-integration-research.md`](../reports/2026-08-28-bugsink-integration-research.md)。

告警数量刻意克制:每条告警响起,值班者必须知道下一步做什么;做不到的降级为看板曲线。Gatus、Healthchecks、Bugsink 和 Victoria 数据面都在 node3，本机监控不能发现 node3 整机失联；异机探针仍是未消除的故障域。

## 6. 硬规则(本仓教训沉淀,新增指标/看板/告警一律遵守)

1. **标签必须能区分同名进程**:强制 `service.namespace` + `service.instance.id`,
   禁止按进程名过滤——config-service 两个程序撞名,按名过滤出的是混合值(不可信)。
   实况注脚:电商 10 服务当前**未设** `service_namespace`(实测),面板过滤暂以
   `service_name!="config-service"` 绕行(见 `面板设计.md`);新增服务仍应把两个标签设齐;
2. **错误率画比率不画速率**,分位数不用平均值替代;
3. **凭据/token 不得入日志**(user SignIn 曾把 access token 打进 debug 日志);
4. **控制基数**:label 里禁止放无界值(port、uuid、user_id);新增 label 先回答基数上限是多少;
5. **验收看实测行为不看配置**:看板/告警上线后要用注入故障(杀 Pod、断依赖)验证真的会响——
   「配置在骗人」在本仓已出现两次(VPA min-replicas、consul deregister 钳制);
6. **监控随功能同行**：新依赖（如 Kafka consumer、Elasticsearch 搜索投影）接入的同一个 PR 里必须带上对应指标与告警；存量 NATS consumer、Meilisearch indexer 在迁移期继续保留对应监控，
   不接受「先上线后补监控」。

---

*来源:三支柱分工、RED/USE、Go 指标清单与「可行动性」判据消化自 2026-08 一篇
Prometheus 方法论文章;所有「本仓教训」条目的证据见
`docs/progress-archive/OBSERVABILITY_REVIEW_20260806.md`、
`docs/progress-archive/ADVERSARIAL_REVIEW_20260806.md`；未完成项见
`docs/todo/统一可观测性体系.md`，状态以 `TODO.md` 为准。*
