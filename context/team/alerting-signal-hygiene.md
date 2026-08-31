---
name: alerting-signal-hygiene
layer: team
description: 告警的价值等于它承载的新信息量——一条长期 firing 的告警等于没有告警。含 2026-08-29 实测：61 条/24h 推送里 0 条误报，而一场 9 小时的真事故因此完全没被发现；以及「健康检查绿、功能已死」的三个实例与探针设计判据。加告警规则、调阈值或排查「为什么没人发现」前必读
---

# 告警信号卫生：慢性红等于没有告警

## 触发它的事故（2026-08-29）

集群里 12 个 Pod 崩溃循环了 **9 小时**，没有人发现。

事后复盘的第一直觉是「缺告警」——**错的**。告警一直在响，规则正确，
通知链路（vmalert → Alertmanager → ntfy 桥 → 手机）完全可用，实测 24 小时成功推送 **61 条**。

真正的原因是：`EcommerceNetworkPolicyDeniedBurst` 在事故发生前**已经连续红了 14 小时**
（起因是一个不相关的慢性配置错误）。事故来临时，它**无法产生任何新信号**——
一条已经红的告警不会「更红」。

实测曲线（`sum(increase(hubble_drop_total{reason="POLICY_DENIED"}[2h])`，2026-08-29 采）：

```
08-28 10:23Z   1644   ← 慢性基线（另一个服务的配置指向已退役地址）
08-28 22:23Z    368
08-29 00:23Z   3698   ← 真事故开始
08-29 06:23Z   8320   ← 峰值
08-29 08:23Z   6566   ← 修复落地
08-29 10:23Z   1202   ← 回到慢性基线
```

同期 `ALERTS{alertname="EcommerceNetworkPolicyDeniedBurst"}` 在 48 个采样点里
**34 个处于 firing**。它整整一天几乎没灭过。

## 第一条规矩：告警的价值 = 它承载的新信息量

一条长期 firing 的告警，信息量是 **0 bit**。它不再区分「正常」和「异常」，
只是持续宣告一件你已经知道的事。更糟的是它训练你忽略整个通知渠道。

由此推出两条硬约定：

1. **不允许存在「已知的、不打算修的」firing 告警。** 要么修，要么删规则，
   要么明确记录为已接受的风险并加 silence（带到期时间）。**「先放着」是最坏的选项。**
2. **加新规则前先清理存量 firing。** 往一个已经在响的渠道里加规则，
   新规则出生即被淹没。

## 第二条规矩：降噪的优先级是固定的

```
修掉根因  >  调 repeat_interval  >  改阈值 / 加 for
                                    ↑ 最后手段，且必须写明为什么原阈值是错的
```

**绝不能靠调阈值让数字变好看。** 2026-08-29 那次复盘，最初的方案是
「把 `NodeMemSwapped` 阈值从 1% 调到 50%」——真按这个做，就会把
「node3 只剩 102 MiB 空闲内存、已 swap 1.7 GiB」这件事永久藏起来。
**那正是造成这次事故的机制，等于原样复制一遍。**

对那 61 条做完逐条归因后的结论是：**一条误报都没有**。

| 分类 | 条数 | 性质 |
|---|---|---|
| 运维自身产生 | 22 | 排查期间的 `kubectl exec` 触发 Tetragon，判断完全正确 |
| 指向真问题 | 21 | 两个真实故障（CDC 槽滞留、节点内存不足） |
| 一次真抖动的重复播报 | 9 | 事件真实，只是被 `repeat_interval` 放大 |
| 等待外部条件 | 7 | 配置修复卡在凭据 |

**所以「噪音」这个词本身有误导性**——61 条里唯一可以纯粹削减的，
只有 `repeat_interval` 造成的重复播报。

## 三个时间参数（Alertmanager）

| 参数 | 管什么 | 本项目取值 |
|---|---|---|
| `group_wait` | 新组产生后等多久发第一条（攒同组） | 30s |
| `group_interval` | 同组有新成员时的最小更新间隔 | 5m |
| `repeat_interval` | **已发过且仍未恢复的告警，多久原样重发一次** | **1h**（2026-08-29 由 4h 改，开发期要求尽快知道） |

`repeat_interval` 只影响「唠叨频率」，不影响发现速度——第一条通知永远立刻到。
调短它会**增加**总条数，是拿噪音换时效，只在开发期成立；
进入长期运行前应调回 4h 或更长，并靠「修掉根因」而不是靠它来控制条数。

规则侧对应的是 `for:`：**缺省 `for:` 的规则一有波动就红**。
`EcommerceNetworkPolicyDeniedBurst` 就没写 `for:`，这是它容易长期挂红的直接原因之一。

## 第三条规矩：探针必须探「功能有没有推进」

2026-08-29 一天之内撞到**三个**「健康检查绿、功能已死」：

| 组件 | 表面 | 实际 |
|---|---|---|
| 业务服务的 Consul 注册 | Pod `1/1 Running`、重启 0、`/healthz` 通 | 启动瞬间 DNS 失败后**永久放弃注册**，对网关不存在 |
| CNPG 集群 | `Phase: Cluster in healthy state`、`Ready: True` | 已被 hibernate，**0 个实例**，Service 无 endpoint |
| Debezium CDC | 容器 `healthy`、连接器 `RUNNING`、任务 `RUNNING`、日志无报错 | 22 小时没推进过复制位点，WAL 无限滞留 |

共同点：**探针探的是「进程活着」，故障却发生在「工作有没有进展」上。**

判据：给一个组件设计健康检查时，先问「**它完全不干活，但进程活着，这个探针会红吗？**」
答案是「不会」的，这个探针就挡不住真实故障。对应到指标，
优先选**单调推进量**（位点、offset、处理计数）而不是**存活布尔值**。

## 元规则：给告警本身加告警

上面所有规矩都依赖人去维护，所以需要一条自举的兜底：

```promql
# 任何告警持续 firing 超过 N 小时 → 它已经失去信号价值，要么修要么删
ALERTS{alertstate="firing"}  持续 > 4h
```

这条直接针对本次的失败模式。**它是唯一一条在「所有人都不看告警了」之后仍然有用的规则。**

配套的是采集侧兜底——监控自身失效时，依赖它的告警会安静地变成「无数据」而不是「报警」，
因为 PromQL 里没数据的表达式不会 firing：

```promql
absent({__name__="<关键指标>"}) == 1   for: 10m
```

现网已有 `HubbleFlowTelemetryMissing` 是这个模式，但它只保 hubble；
新增任何一类指标的告警时，都要配一条对称的 `absent()`。

## K8s 告警规则（2026-08-29 已落地）

规则文件在 node3 `/infra/rules/ecommerce-k8s.yml`（组名 `ecommerce-k8s`，6 条，属主
`victoria:victoria`，与 `ecommerce-security.yml` 同目录同约定）：

| 规则 | 表达式要点 | `for` | severity |
|---|---|---|---|
| `K8sPodRestartStorm` | 15 分钟重启增量 > 2（稳态 CrashLoop 退避上限 5 分钟≈3 次，正常发布为 1 次） | 5m | critical |
| `K8sContainerNotReady` | `k8s_container_ready == 0` | 15m | warning |
| `K8sDeploymentDegraded` | `available < on(k8s_deployment_uid) desired` | 10m | warning |
| `K8sNodeNotReady` | `k8s_node_condition_ready == 0` | 5m | critical |
| `K8sClusterMetricsMissing` | `absent(...)` 兜底 | 10m | critical |
| `AlertFiringTooLong` | `(time() - ALERTS_FOR_STATE{alertname!="AlertFiringTooLong"}) > 4*3600` | 15m | warning |

**数据来源不需要 kube-state-metrics**：集群内 otel collector 的 `k8s_cluster` receiver
已在采集并远端写入 node3，26 个 `k8s.*` 指标可用。

写这类规则时的三个硬坑（都实测踩过）：

1. **指标名与 label 名的口径变过一次，写之前必须现查。** 本条最初记录的是点号命名
   （`{__name__="k8s.container.restarts"}`），那是 VM 的 OTLP 摄入未开
   `usePrometheusNaming` 时的口径；**实测 2026-08-31 已全部转为下划线**
   （`k8s_container_restarts`、`by (k8s_namespace_name)`，全库含点号的指标为 0 个），
   规则文件 `/infra/rules/ecommerce-k8s.yml` 已同步。
   **两种写法都会「查不到数据且不报错」**，所以真正的纪律不是记住某一种写法，
   而是写规则或探针前先跑一次
   `curl -s 'http://127.0.0.1:8428/api/v1/label/__name__/values'` 确认当前口径。
   2026-09-01 就有一条 Gatus 检查因沿用旧口径而长期红，被误判成「K8s 指标断流」，
   实际采集链路一直正常（下划线口径下 51 条 series、数据年龄 0 秒）。
2. **以 `{` 开头的表达式必须加引号**，否则 YAML 把它解析成 flow mapping 直接报错。
3. **`ALERTS_FOR_STATE` 没有 `alertstate` label**。加了该过滤条件会永远查不到，
   元规则静默失效。

**验收方式（只验「加载成功」不算数）**：把规则表达式用 `query_range` 回放到历史事故窗口，
确认它当时会命中；再确认当前健康态下不命中。本组 `K8sPodRestartStorm` 回放到
2026-08-29 06:00Z 命中 31 个 Pod，当前为 `inactive`。

## 本项目的现网事实（实测 2026-08-29）

- 告警链路：vmalert（node3 `/infra/rules/*.yml`，10s 评估）→ Alertmanager（`receiver: local-audit`）
  → `pigsty-alert-audit.service`（`/usr/local/libexec/pigsty-alert-ntfy.py`）→ ntfy
- severity 映射：`critical`→priority 5，其他→4，resolved→3；tag `rotating_light` / `white_check_mark`
- 规则总数 869 / 19 组，其中 18 组是 Pigsty 自带的基础设施规则（node/pgsql/redis/kafka/etcd/minio/mysql），
  **唯一的自定义组是 `ecommerce-security`（4 条）**
- **Pigsty 自带规则是按 HA 集群假设写的**。本集群 `pg-meta` 是单节点，
  于是 `PostgresReplicationLag`/`Break` 实际套到了 Debezium 的逻辑槽上——
  规则用错了对象，但**恰好指向了真问题**，不要因此静音它

## 相关

- 慢性告警背后的那个真问题：[`project/ecommerce/events/experience/debezium-idle-slot-wal-retention.md`](../project/ecommerce/events/experience/debezium-idle-slot-wal-retention.md)
- 「健康绿、功能死」之一：[`project/ecommerce/registry/experience/consul-register-once-then-give-up.md`](../project/ecommerce/registry/experience/consul-register-once-then-give-up.md)
- 事故当天的网络侧根因：[`cilium-datapath-ops.md`](cilium-datapath-ops.md)
- 写集群数字的纪律：[`live-facts.md`](live-facts.md)
