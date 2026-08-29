# Descheduler 采用决策：当前不安装

> 决策日期：2026-08-29  
> 适用范围：当前三节点 dev 集群与 ecommerce 工作负载  
> 状态：已定稿。Descheduler 保留为条件采纳项，不进入当前部署基线。

## 1. 结论

当前不安装 Descheduler。现阶段采用以下组合：

1. suite-wide 硬 `topologySpreadConstraints` 保证新 Pod 的节点数量 skew；
2. VPA 使用 `Off` 模式积累推荐值，不自动修改 Pod；
3. 结合至少 7 天观测、正常启动窗口和固定数据集 k6 压测，人工校准 `resources.requests`；
4. 通过受控 rollout 应用新 requests，并让新 Pod 重新经过 kube-scheduler；
5. 用节点 skew、`FailedScheduling` 和节点恢复告警发现历史落点漂移；
6. 低频节点恢复使用人工 Runbook，不引入常驻自动驱逐控制器。

这不是永久拒绝 Descheduler。只有节点变化或落点漂移反复出现，并且多副本、PDB、可信 requests 和 N+1 容量均已满足时，才重新评估。

## 2. Descheduler 解决什么问题

kube-scheduler 只为尚未绑定节点的 Pending Pod 选择节点。Pod 开始运行后，scheduler 不会因为新增节点、节点恢复、标签变化或负载变化而主动迁移 Pod。

Kubernetes 也不支持把已绑定 Pod 原地改到另一个节点。所谓迁移实际是：

```text
Descheduler 识别落点过时的 Pod
  -> 通过 Eviction API 驱逐
  -> Deployment / ReplicaSet 创建替代 Pod
  -> kube-scheduler 为替代 Pod 选择节点
```

Descheduler 不直接决定最终节点，也不扩缩副本或修改 requests。它的价值是自动触发「重新调度机会」，而不是成为第二个 scheduler。最终落点继续由 kube-scheduler 根据 affinity、taint、topology spread、requests 和节点容量决定。

## 3. 当前集群证据

| 证据 | 当前实况 | 对决策的影响 |
|---|---|---|
| Pod 分布 | 17 个 active ecommerce Pod 为 node101/node102/node103=`5/6/6` | 当前不存在需要自动修复的数量 skew |
| 调度约束 | 15/15 Deployment 使用 suite-wide `DoNotSchedule`、`maxSkew: 1` | 新 Pod 已受硬约束保护 |
| 副本与 PDB | 13 个 Deployment 为单副本且没有 PDB；仅 consumer-next、gateway 为双副本并有 PDB | 安全策略只能处理 4 个 Pod，无法重平衡整套应用；放宽保护会造成单副本中断 |
| requests | 业务合计 request 为 `1500m/2240Mi`；低流量瞬时实际约 `19.7m/378Mi`；frontend 没有 requests | `LowNodeUtilization` 当前会使用失真的容量信号 |
| 节点实际用量 | node101 的部分内存来自 control-plane、宿主机进程和缓存 | 驱逐业务 Pod 不能消除全部节点差异 |
| VPA | 控制面只运行 recommender `1.7.1`；15 个 ecommerce VPA 已全部发布为 `Off`/`RequestsOnly`，且 `RecommendationProvided=True` | 已进入代表性资源基线观测期；发布证据见 [`2026-08-29-vpa-recommendation-only.md`](2026-08-29-vpa-recommendation-only.md) |
| 节点变化频率 | 当前没有 Cluster Autoscaler，也没有频繁扩缩节点的证据 | 自动重平衡的收益不足以覆盖新增控制器和 eviction 风险 |

## 4. 为什么当前不启用两类策略

### 4.1 `RemovePodsViolatingTopologySpreadConstraint`

该策略适合在节点恢复或新增节点后修复历史 skew，但当前有三个限制：

1. 当前分布已经是 `5/6/6`，没有待修复对象；
2. 使用 `minReplicas: 2` 和 `PodsWithoutPDB` 保护后，只剩 consumer-next 与 gateway 可驱逐；
3. 取消保护才能移动 13 个单副本服务，但会产生短暂不可用。

在当前规模下，节点恢复后先告警，再按 Runbook 逐个扩副本和受控 rollout，比周期自动驱逐更可控。

### 4.2 `LowNodeUtilization`

该策略默认结合 Pod requests 和节点 allocatable 判断低载与过载节点。当前 requests 既有统一虚高，也有完全缺失。此时启用会产生错误判断，而且替代 Pod 仍由 kube-scheduler 根据同一组失真 requests 调度。

即使未来使用 Kubernetes Metrics 或 Prometheus 指标源，可信 requests 仍是前置条件。原因是 eviction 只触发重新调度；新 Pod 的可调度性和 NodeResourcesFit 评分仍依赖 requests。

## 5. 当前替代方案

### 5.1 正常运行

保留 suite-wide 硬 spread。所有新建 Pod 必须满足 hostname `maxSkew: 1`；consumer-next 与 gateway 继续使用 required pod anti-affinity。

### 5.2 requests 校准

1. 15 个 `updateMode: Off`、`RequestsOnly` VPA 已发布并完成无业务扰动验收；
2. 从发布时点起观察至少 7 天，并覆盖启动、正常流量、k6 和积压恢复；
3. 同时检查 VPA Lower/Target/Upper/Uncapped Target、实际峰值、OOM/GC、延迟和错误率；
4. 将经过验证的 requests 写回 Deployment；
5. 分批 rollout。rollout 会创建新 Pod，因此自然触发一次基于最新容量信息的重新调度。

7 天是最低观察窗口，不是自动采纳时点。如果窗口内没有代表性负载，继续观察。

### 5.3 节点恢复

节点恢复后出现持续 skew 时：

1. 确认恢复节点为 Ready、可调度，且 CNI、CRI 和镜像拉取正常；
2. 优先 rollout 有双副本和 PDB 的 workload；
3. 单副本服务先临时扩为 2 副本，确认新副本 Ready；
4. 删除过载节点上的旧 Pod；
5. 恢复目标副本数；
6. 验证最终 skew、业务路径和 `FailedScheduling` 事件。

不得通过同时重启全部 Deployment 追求重平衡。硬 spread、required anti-affinity 和无 surge 策略组合下，并发 rollout 可能产生调度死锁。

## 6. 重新评估 Descheduler 的条件

以下条件同时满足后，重新评估 Descheduler：

- 节点新增、恢复或替换已经成为重复发生的运维事件；
- placement drift 反复出现，人工 Runbook 成为稳定负担；
- 目标 workload 至少 2 副本；
- PDB 覆盖完整，且演练证明允许一次 eviction；
- CPU/内存 requests 已由 VPA、长期指标和 k6 校准；
- 任意一个节点失效时，剩余容量满足 N+1；
- dry-run 候选 Pod、目标节点可调度性和单轮 eviction 上限均已验收；
- skew、Pending、eviction 和业务 SLO 告警均可用。

重新评估时，先考虑 `RemovePodsViolatingTopologySpreadConstraint`。只有长期证据证明节点容量漂移无法由 requests 校准和正常 rollout 收敛时，才考虑 `LowNodeUtilization`。

## 7. 参考与关联文档

- VPA 发布证据、经验与下一步：[`docs/reports/2026-08-29-vpa-recommendation-only.md`](2026-08-29-vpa-recommendation-only.md)
- 容量校准、故障注入和告警待办：[`docs/design/platform/capacity-balancing.md`](../design/platform/capacity-balancing.md)
- 节点优雅关机与重启语义：[`context/team/node-graceful-shutdown.md`](../../context/team/node-graceful-shutdown.md)
- Descheduler `v0.36` / Kubernetes `v1.36` 官方文档：[release-1.36 README](https://github.com/kubernetes-sigs/descheduler/blob/release-1.36/README.md)
- 官方 Helm chart 配置：[chart README](https://github.com/kubernetes-sigs/descheduler/blob/release-1.36/charts/descheduler/README.md)
