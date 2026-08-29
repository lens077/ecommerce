# Kubernetes 容量均衡与自动重平衡

本文定义 ecommerce 工作负载的资源校准、节点容量均衡、VPA 使用边界、节点重启语义和 Descheduler 准入条件。Pod 数量均衡、调度容量均衡和实际利用率均衡是三件不同的事，不能用同一个 `maxSkew` 代替。

## 1. 当前事实

### 1.1 Pod 数量均衡

15 个 Deployment 都使用 suite-wide hostname topology spread：

- 共同标签：`app.kubernetes.io/part-of=ecommerce`；
- `maxSkew: 1`；
- `whenUnsatisfiable: DoNotSchedule`；
- `nodeAffinityPolicy: Honor`；
- `nodeTaintsPolicy: Honor`。

因此当前约束是**硬约束**。17 个 active Pod 已分布为 node101/node102/node103=`5/6/6`。consumer-next 与 gateway 另使用 required pod anti-affinity，保证各自两个副本不落在同一节点。

硬 spread 只限制参与计数的 Pod 数量。它不理解某个 Pod 是高负载 API 还是低负载 relay，也不会按实际 CPU、内存或节点宿主机开销加权。

### 1.2 容量快照

本次审计的瞬时值如下。业务 Pod 在最近 rollout 后只运行约 1–2 小时，且当时流量较低；该快照用于发现配置问题，不能直接作为最终 requests。

| 节点 | ecommerce Pod | ecommerce CPU request | ecommerce 内存 request | ecommerce 实际 CPU | ecommerce 实际内存 | 整节点实际 CPU/内存 |
|---|---:|---:|---:|---:|---:|---:|
| node101 | 5 | 400m | 640Mi | 7.4m | 122Mi | 252m / 3198Mi |
| node102 | 6 | 550m | 832Mi | 4.9m | 101Mi | 223m / 2378Mi |
| node103 | 6 | 550m | 768Mi | 7.5m | 154Mi | 179m / 1880Mi |
| 合计 | 17 | 1500m | 2240Mi | 19.7m | 378Mi | — |

当前主要问题：

1. 10 个 Go API 统一请求 `100m/128Mi`，但低流量瞬时使用约 `1–2m/16–45Mi`。这说明存在校准空间，不说明可以按瞬时值直接缩容。
2. `ecommerce-frontend` 没有 requests/limits，scheduler 将它视为零资源工作负载，容量评分不可信。
3. consumer-next、gateway、relay 和 indexer 有独立 requests，但尚未覆盖代表性业务峰值。
4. node101 的整节点内存更高，包含 control-plane 和宿主机开销；Descheduler 只能移动 Pod，不能迁移 control-plane 进程。
5. 当前没有 HPA、KEDA ScaledObject 或 Descheduler。只有 consumer-next/gateway 有 PDB，其余单副本服务不能被自动驱逐而不产生短暂不可用。

## 2. VPA 真相源与取舍

### 2.1 采用当前组件，不采用 archive

现行 VPA 组件位于 `../kubernetes/components/vpa/`：

- 只安装 recommender；
- 不安装 updater；
- 不安装 admission-controller；
- VPA 只提供历史推荐，不修改 Pod。

`../kubernetes/archive/vpa/` 是历史实现。archive 中的 ecommerce 清单曾因 targetRef 不存在而被排除，且注释明确说明部分 `minAllowed` 没有实测依据。archive 只提供事故经验，不作为部署源。

### 2.2 部署前发现的问题

部署前，live 只有 behavior、cart、order 三个 ecommerce VPA。它们写着 `updateMode: InPlace`，但集群没有 updater/admission-controller，因此不会调整 Pod。该配置存在潜在风险：如果以后安装 updater/admission-controller，语义会从「只观察」静默变成「自动修改」。

当时 recommender 仍使用上游默认地板 `25m/250Mi`。三个 ecommerce VPA 的内存 Target、Lower Bound、Upper Bound 和 Uncapped Target 全部恰好为 `250Mi`，证明结果被全局地板顶住，不是有效测量。

### 2.3 本项目 VPA 基线

根目录 `application-vpa.yml` 是 15 个 ecommerce Deployment 的完整推荐清单：

- `updateMode: Off`；
- 明确匹配真实 Deployment 和 container 名称；
- `controlledResources: [cpu, memory]`；
- `controlledValues: RequestsOnly`；
- 观测阶段不设置 `minAllowed`/`maxAllowed`，避免边界把假设伪装成测量结果。

`../kubernetes/components/vpa/values.yaml` 将 recommender 全局地板调整为 `10m/32Mi`。该数值只用于解除默认 `250Mi` 地板，不是每个业务容器的最终安全下限。

2026-08-29，VPA Helm 已升级至 revision 2，并应用完整清单。live 仍只运行 recommender `1.7.1`，没有 updater 或 admission webhook；15 个 ecommerce VPA 均为 `Off`，且全部满足 `RecommendationProvided=True`。发布前后的 15 个 Deployment 与 17 个 active Pod 在 UID、镜像、revision、落点和 restart 上完全一致，证明本次发布没有触发业务 rollout 或 eviction。

初始推荐已经产出，但只代表部署时的短观测窗口。CPU Target 当前集中在约 `11m`，内存 Target 约为 `32–75Mi`；这些值不是最终 requests，必须完成阶段 B 后再评审。完整发布证据、经验、回滚和日常检查命令见 [`docs/reports/2026-08-29-vpa-recommendation-only.md`](../../reports/2026-08-29-vpa-recommendation-only.md)。

## 3. requests 校准流程

### 阶段 A：发布 recommendation-only VPA（已完成）

已完成以下操作：

1. 确认 live Deployment 的 targetRef、container 名称和源码一致。
2. 将现有 behavior/cart/order VPA 从 `InPlace` 改为 `Off`。
3. 升级 recommender，使 `10m/32Mi` 地板生效。
4. 应用 `application-vpa.yml`，确认正好 15 个 ecommerce VPA，且全部为 `Off`。
5. 比较发布前后业务 Deployment 和 Pod 身份，确认没有业务对象被重建。

结果：VPA 只更新 status，不改 requests、不驱逐 Pod、不创建 admission webhook。

### 阶段 B：建立代表性观测窗口

至少观察 7 天，并覆盖：

- 一次正常发布和完整启动窗口；
- 工作日与低谷流量；
- 一次固定数据集的 k6 容量窗口；
- 消费者积压后恢复；
- 搜索、推荐、结算等差异化业务路径；
- OOM、restart、GC、延迟和错误率记录。

每个容器同时记录 VPA Lower Bound、Target、Upper Bound、Uncapped Target，以及 metrics-server/长期指标中的实际峰值。不得只抄 Target，也不得用一次 `kubectl top` 定稿。

### 阶段 C：写回可信 requests

每个 workload 单独形成决策记录，至少说明：

- 观测时间范围和流量 profile；
- 当前 requests/limits；
- 启动峰值和稳定期峰值；
- VPA 四档推荐值；
- k6 下的 P95/P99、错误率和资源饱和点；
- 选择新 CPU/内存 request 的理由；
- limits 是否修改及 OOM 风险；
- 单节点故障后的 N+1 容量是否仍成立。

requests 用于 scheduler 容量评分，limits 用于运行时边界。两者不得由同一个 VPA Target 机械生成。

### 阶段 D：受控 rollout

每次只调整一组同类 workload：

1. API；
2. relay/indexer；
3. frontend/consumer-next；
4. gateway。

调整后检查 Pod 落点、Node Allocated resources、实际使用、延迟、错误率、OOM 和 Pending。新 requests 未经过一轮完整峰值前，不进入 prod。

## 4. 节点重启是否会自动重平衡

节点重启不等于全局重平衡，结果取决于 Pod 是否被重新创建：

- 短暂或非驱逐式重启：Pod 对象仍绑定原节点，kubelet 恢复后通常在原节点重启容器，不重新调度。
- 优雅关机或离线时间超过驱逐条件：旧 Pod 进入终态或被驱逐，ReplicaSet 创建新 Pod；新 Pod 会按当时可调度节点和硬 spread 重新选择落点。
- 原节点恢复后：已经迁移到其他节点的 Pod 不会自动搬回。集群可能长期保留「恢复节点为空、其他节点偏满」的状态。

`nodeTaintsPolicy: Honor` 会在节点 NotReady/被 taint 时把该节点排除出 spread 计数，但节点恢复后不会主动触发既有 Pod 重调度。恢复后的重平衡需要受控 rollout，或经过准入评估的 Descheduler。

## 5. Descheduler 准入条件

当前集群没有 Descheduler，不应立即安装。主要原因：

- 13 个业务 Deployment 是单副本且没有允许驱逐的 PDB；
- requests 尚未校准，`LowNodeUtilization` 会基于不可信容量信号做决定；
- suite-wide spread 是硬约束，驱逐后 scheduler 可能因容量不足而让 Pod Pending；
- node101 的部分内存来自 control-plane，移动业务 Pod 不能消除全部差异。

候选策略分两类：

1. `RemovePodsViolatingTopologySpreadConstraint`：用于节点恢复或新增节点后修复历史 skew。启用前必须明确单副本中断窗口，或先把目标服务扩为至少 2 副本并配置 PDB。
2. `LowNodeUtilization`：只在 requests 校准完成、利用率指标来源经过验证、N+1 容量成立后评估。不能把一次 metrics-server 瞬时值作为阈值依据。

准入门禁：

- 先生成候选驱逐清单，不直接执行；
- 排除 kube-system、带本地卷/状态的工作负载和 critical Pod；
- 单轮限制驱逐数量；
- 尊重 PDB；
- 失败时停止，不连续驱逐；
- 完成一次节点恢复演练后再考虑周期运行。

## 6. 故障与容量验收待办

### 6.1 长期和故障注入

- [ ] **节点宕机演练**：依次 drain/reboot node101、node102、node103；验证业务路径、PDB、硬 spread、Tetragon 覆盖和节点恢复后的落点。记录是否需要受控 rollout 才能重新利用恢复节点。
- [ ] **节点资源耗尽演练**：分别制造 CPU、内存压力；验证无级联驱逐、OOM 可定位、Pending 原因可见，且硬 spread 不被绕过。
- [ ] **同时滚动多个 Deployment 的压力测试**：限定并发批次，验证硬 spread、镜像拉取、PDB、Consul 注册和业务路径不会形成滚动死锁。
- [ ] **长时间 skew 监控**：连续 7 天记录 Pod 数、requests、实际 CPU/内存和节点宿主机开销，区分 Pod 数均衡与容量均衡。
- [ ] **扩缩容验证**：覆盖单服务扩副本、批量扩副本、节点新增和节点恢复；确认 scheduler 能在硬约束下找到合法落点。
- [ ] **调度失败注入**：故意制造无法满足的 request 或 affinity，确认 `FailedScheduling` 在规定时间内进入告警和 Runbook。

### 6.2 持续告警与结构门禁

- [ ] **ecommerce 节点 skew 告警**：`part-of=ecommerce` 的 active Pod 在可调度节点间差值超过 1，并持续一个评估窗口时告警；节点被 taint/NotReady 时按 eligible domain 重新计算。
- [ ] **Tetragon 覆盖告警**：DaemonSet desired 与 ready 不一致，或三个目标节点缺少任一 agent 时告警。
- [ ] **topology spread 调度失败告警**：Kubernetes Event 出现与 topology spread、anti-affinity 或 insufficient resources 相关的 `FailedScheduling` 时，按 workload 聚合并附 Runbook。
- [ ] **共同标签门禁**：structcheck 继续覆盖仓库内清单；为集群侧新增 Kyverno Audit/Enforce 规则，阻止 ecommerce Deployment 漏掉 `app.kubernetes.io/part-of=ecommerce` 和 suite-wide hard spread。
- [ ] **VPA 停更告警**：VPA 长时间没有 `RecommendationProvided`，或 targetRef 不存在时告警；不能只看 CR 是否存在。
- [ ] **requests 漂移告警**：源码与 live requests 不一致，或 requests 长期显著偏离经过验收的容量区间时进入评审，不自动修改。

## 7. 完成定义

容量均衡只有同时满足以下条件才算完成：

1. 15 个 Deployment 均有经过代表性窗口验证的 CPU/内存 requests；
2. 三节点 requests 与实际利用率差异可解释，N+1 场景仍能调度核心负载；
3. 节点重启、资源压力、并发 rollout 和扩缩容演练都有可复现记录；
4. skew、Tetragon 缺口、FailedScheduling 和 VPA 停更都有可行动告警；
5. Descheduler 如启用，必须有驱逐边界、PDB、回滚和一次完整恢复演练；
6. dev 证据通过后才允许把新 requests 晋级到 prod。
