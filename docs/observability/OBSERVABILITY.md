# 可观测性方法论与指标基线

> 创建:2026-08-07。定位:**方法论 + 本仓指标基线清单**(应采什么、为什么、异常了该做什么)。
> 与其他文档的关系:落地阶段与验收标准见 `DEVOPS.md` §5/阶段3;
> 当前实况与缺陷清单以 `docs/reviews/OBSERVABILITY_REVIEW_20260806.md` 和 `TODO.md` 为准;
> 看板生成脚本在 `grafana/`（本目录下）；**面板与告警的现行设计真相源是同目录 [`面板设计.md`](面板设计.md)**，与本文冲突时以它的实测口径为准。
> 核心取向(消化自 2026-08 一篇 Prometheus 方法论文章,结合本仓教训):
> **上线前关注功能对不对,上线后要回答的是「服务现在健康吗」**。没有指标,出问题只能
> 看日志、查服务器、猜。

---

## 1. 三支柱分工:不是三选一,是三问三答

| 支柱 | 回答的问题 | 本仓实现 |
|------|-----------|----------|
| Logs | **发生了什么?** | 结构化日志 → fluent-bit → Loki |
| Trace | **一次请求经过了哪里?** | OTel SDK(otelconnect)→ collector → Jaeger |
| Metrics | **系统现在怎么样 / 是否正在变坏?** | OTel metrics → collector → VictoriaMetrics(Prometheus 兼容) |

排障动线:**Metrics 发现异常 → Trace 定位调用链 → Logs 看具体错误**。
三者靠 trace_id 与统一资源标签(`service.name`/`service.namespace`/`service.instance.id`)互跳——
这也是为什么标签规范是硬规则(见 §6)。

Prometheus 与 OpenTelemetry 不是竞争关系:本仓用 OTel 做采集与传输的统一层,
VictoriaMetrics 做 Prometheus 兼容的指标存储,Grafana 统一展示;告警走 Grafana
unified alerting(2026-08-12 定,理由与规则清单见 `面板设计.md` §6——集群无
Prometheus Operator,vmalert/Alertmanager 要多养两个单副本组件,sidecar 的
alerts provisioning 通道现成)。

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
| Kafka **Consumer Lag** | Lag 持续增加 = 消费能力不足,扩消费者或查消费端慢逻辑。⚠️ 当前本仓 Kafka 集成为 0(进程内 EventBus,见 TODO),此项在 Kafka 真正接入时**必须随首个 consumer 同步上线**,不允许「先跑起来再补监控」 |
| ES / MinIO / Consul 客户端错误数 | 依赖不可用先于业务报错出现 |

### 3.4 资源层(USE,节点与容器)

CPU、内存、磁盘、网络 + k8s 对象状态(Pod restart、OOMKill、Pending)。
当前缺口:无 kube-state-metrics/容器级指标(评审已列)。本仓集群约束放大了它的重要性:
仅 2 个节点(node1/node2,均可调度)、存储钉 node1、多次 OOMKill 事故(Loki、kafka-connect)——
**OOMKill 与 restart 计数是本集群最值钱的告警源之一**。

## 4. 采集架构

```
10 × Go Service + Gateway ──OTel SDK──► otel-collector ──► VictoriaMetrics (Metrics)
        │                                     ├──────────► Jaeger          (Trace)
        └──stdout──► fluent-bit ──────────────┴──────────► Loki            (Logs)
                                Grafana(统一展示 + unified alerting 告警,2026-08-12 定)
```

- 接入方式:OTel SDK 装配在同构 `internal/pkg`,一份基线全员生效(已收敛,含采样率可配、
  `service.instance.id`、gzip);新服务照抄即得全套,不允许自造。
- ~~已知采集缺口:网关无 meter;collector 自身未被监控~~——两者已于 2026-08-12 补齐:
  网关 MeterProvider 已接(`gateway/middleware/tracing/tracing.go`),`otelcol_*` 自采已配置并实测
  核对指标名;「监控监控系统」的原则仍然成立,新增采集组件时照此办理。

## 5. 告警:方法论(规则清单已落地,真相源在面板设计.md)

指标存在但没有告警 = 只有事后分析能力,没有「提前发现故障」能力(文章的核心判词:
**成熟的监控不是收集更多指标,而是找到能帮你提前发现故障的那些**)。

~~当前为 0 条~~——2026-08-12 第一批 **17 条**规则已由 `grafana/build_alerts.py` 生成入库
(Grafana unified alerting),**分级与逐条口径见 [`面板设计.md`](面板设计.md) §告警**,
它取代了本文早期的 7 条候选清单。

告警数量刻意克制:每条告警响起,值班者必须知道下一步做什么;做不到的降级为看板曲线。

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
6. **监控随功能同行**:新依赖(如 Kafka)接入的同一个 PR 里必须带上对应指标与告警,
   不接受「先上线后补监控」。

---

*来源:三支柱分工、RED/USE、Go 指标清单与「可行动性」判据消化自 2026-08 一篇
Prometheus 方法论文章;所有「本仓教训」条目的证据见
`docs/reviews/OBSERVABILITY_REVIEW_20260806.md`、`docs/reviews/ADVERSARIAL_REVIEW_20260806.md` 与 `TODO.md`。*
