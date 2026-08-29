# VPA Recommendation-only 发布与容量校准基线

> 发布日期：2026-08-29  
> 适用范围：三节点 dev 集群、`ecommerce` namespace 的 15 个 Deployment  
> 状态：VPA recommendation-only 已发布并验收；当前处于观测期，不得把初始 Target 直接写回 requests。

## 1. 结论

本次发布完成以下目标：

1. VPA Helm release 从 revision 1 升级到 revision 2；
2. 集群继续只运行 recommender `1.7.1`，不安装 updater 或 admission-controller；
3. recommender 全局推荐地板从上游默认 `25m/250Mi` 调整为 `10m/32Mi`；
4. `ecommerce` 的 15 个 Deployment 均有对应 VPA，全部使用 `updateMode: Off` 和 `controlledValues: RequestsOnly`；
5. 15 个 VPA 均满足 `RecommendationProvided=True`；
6. 发布没有修改业务 requests、没有驱逐 Pod、没有触发业务 rollout；
7. Descheduler 不安装。节点落点漂移继续由硬 topology spread、告警和受控 rollout 处理。

VPA `Off` 不是关闭 VPA。recommender 仍持续计算 Lower Bound、Target、Upper Bound 和 Uncapped Target，只是不自动应用推荐值。

## 2. 发布前问题

### 2.1 目标对象不完整

发布前，live 只有 behavior、cart、order 三个 ecommerce VPA。根目录旧清单只覆盖 8 个 API，而且使用 `address`、`cart` 等不存在的裸 Deployment 名称；当前真实名称是 `ecommerce-address-deploy`、`ecommerce-cart-deploy` 等。

archive 中的 ecommerce VPA 曾因同类 targetRef 错误悬空 44 天，状态里残留的 checkpoint 一度让失效对象看起来仍有推荐值。因此本次没有复用 `../kubernetes/archive/vpa/`，而是以现行 `../kubernetes/components/vpa/` 和当前 Deployment 清单为准。

### 2.2 自动模式语义与实际组件不一致

原 behavior、cart、order VPA 写着 `InPlace`，但集群只有 recommender，没有 updater 或 admission-controller。它们当时不会修改 Pod，却留下一个潜在风险：未来如果补装自动组件，行为可能从「只观察」静默变成「自动修改」。

本次将三个对象改为 `Off`，并用 structcheck 禁止 ecommerce VPA 回退到 `InPlace`、`Auto` 或 `Recreate`。

### 2.3 默认推荐地板伪装成测量结果

发布前，三个 VPA 的内存 Lower Bound、Target、Upper Bound 和 Uncapped Target 全部恰好为 `250Mi`。这不是三个服务真实用量一致，而是 recommender 的全局默认地板。

本次将全局地板改为 `10m/32Mi`。该值只解除默认地板，不是每个容器的最终安全下限。观测清单也不设置 `minAllowed`/`maxAllowed`，避免人为边界把假设伪装成 Target。

## 3. 实施内容

### 3.1 VPA 控制面

现行配置位于 `../kubernetes/components/vpa/values.yaml`：

```yaml
admissionController:
  enabled: false
updater:
  enabled: false
recommender:
  enabled: true
  replicas: 1
  extraArgs:
    - --pod-recommendation-min-cpu-millicores=10
    - --pod-recommendation-min-memory-mb=32
```

发布命令使用现行组件安装器：

```bash
cd ../kubernetes
bash components/vpa/install.sh
```

Helm 发布结果：

| 项目 | 结果 |
|---|---|
| release | `vpa` |
| namespace | `kube-system` |
| chart / app | `vertical-pod-autoscaler 0.11.0` / `1.7.1` |
| revision | `2` |
| Deployment | 仅 `vpa-vertical-pod-autoscaler-recommender` |
| Ready | `1/1` |
| updater | 未安装 |
| admission webhook | `0` |

### 3.2 ecommerce VPA

完整清单位于 [`application-vpa.yml`](../../application-vpa.yml)。每个对象都满足：

```yaml
updatePolicy:
  updateMode: "Off"
resourcePolicy:
  containerPolicies:
    - controlledResources: [cpu, memory]
      controlledValues: RequestsOnly
```

发布结果：

- 新建 12 个 VPA；
- 更新 behavior、cart、order 三个 VPA；
- 最终正好 15 个 ecommerce VPA；
- 15/15 为 `Off`；
- 15/15 为 `RecommendationProvided=True`；
- targetRef 和 container 名称均与 live Deployment 一致；
- 发布后 `kubectl diff -f application-vpa.yml` 返回零差异。

## 4. 无业务扰动证据

发布前后分别保存 15 个 Deployment 和 17 个 active Pod 的 API 快照，并比较以下字段：

| 对象 | 比较字段 | 结果 |
|---|---|---|
| Deployment | UID、generation、revision、镜像、副本数 | 完全一致 |
| Pod | 名称、UID、节点、镜像、restart | 完全一致 |
| readiness | 15 个 Deployment desired/ready | `15/15` |
| placement | node101/node102/node103 | `5/6/6` |
| VPA webhook | MutatingWebhookConfiguration 数量 | `0` |
| VPA 控制器 | kube-system 中 VPA Deployment 数量 | `1`，仅 recommender |

因此本次发布只新增推荐状态，不改业务 Pod template，不执行 eviction，也不触发 rollout。

## 5. 初始推荐快照

刚发布后，15 个容器的 CPU Target 都约为 `11m`。内存 Target 分布如下：

| 内存 Target | workload |
|---:|---|
| `32Mi` | gateway、address、frontend、merchant、outbox-relay、payment、search-indexer |
| 约 `34.6Mi` | inventory、product、user |
| 约 `47.3Mi` | behavior |
| 约 `60.6Mi` | cart、order、search |
| 约 `74.6Mi` | consumer-next |

部分内存值由 VPA 以裸字节数输出，表中已换算为 MiB。

这些值只能证明推荐链路已经工作，不能作为最终 requests，原因包括：

- 新 VPA 尚未覆盖 7 天代表性窗口；
- 当前流量较低；
- 尚未覆盖正常发布启动峰值；
- 尚未执行固定数据集 k6 容量窗口；
- relay/indexer 尚未覆盖积压恢复；
- container CPU/内存长期时间序列仍需补齐 kubeletstats/cAdvisor 采集证据。

## 6. 本次经验

### 6.1 `RecommendationProvided=True` 只证明有结果

该条件不证明 targetRef 正确、观测窗口充分或推荐值可信。历史对象曾在 targetRef 失效后继续展示 checkpoint 残留；本次发布前的 `250Mi` 也只是默认地板。

验收必须同时检查：

1. targetRef 存在；
2. container 名称匹配；
3. VPA status 持续更新；
4. Target 与 Uncapped Target 是否被边界或全局地板顶住；
5. 推荐窗口是否覆盖真实负载；
6. live requests 是否与源码一致。

### 6.2 VPA Target 不是 requests 真相源

Target 是当前观测模型给出的候选值。最终 requests 还要结合：

- 启动峰值；
- CPU P95/P99 与 throttling；
- 内存 working set、GC 和 OOM；
- k6 下的延迟、错误率和饱和点；
- consumer 积压恢复；
- 单节点故障后的 N+1 容量。

limits 也不能由 Target 机械生成。requests 用于调度和 CPU 权重，limits 是运行时边界，两者需要分别决策。

### 6.3 观察工具也要验证「没有副作用」

配置写着 `Off` 还不够。本次通过发布前后对象身份比较，证明业务 Deployment 和 Pod 没有被重建；同时验证没有 updater 和 mutating webhook。以后升级 VPA chart 时必须重复这组检查。

### 6.4 自动组件不能在存量 CR 未审计时补装

`config-center` namespace 仍有两个历史 `InPlace` VPA。当前没有 updater/webhook，因此不会修改 Pod。未来如评估自动模式，必须先审计全集群 VPA，而不能只检查 ecommerce。

### 6.5 Descheduler 不是 VPA 的下一步默认组件

可信 requests 能改善新 Pod 的调度决策，但不自动证明需要 Descheduler。当前已经是 `5/6/6`，13 个 Deployment 仍是单副本且没有 PDB。requests 校准后的受控 rollout 本身会产生一次重新调度机会，因此当前不安装常驻 eviction 控制器。

完整决策见 [`2026-08-29-descheduler-decision.md`](2026-08-29-descheduler-decision.md)。

## 7. 下一步操作

### 7.1 观测期

至少观察 7 天。7 天是最低窗口，不是自动采纳时点；如果没有代表性负载，继续观察。

观测期必须覆盖：

- 正常发布和完整启动；
- 工作日与低谷流量；
- 固定数据集 k6；
- consumer 积压与恢复；
- 搜索、推荐、下单、支付等差异化路径；
- restart、OOM、GC、延迟和错误率。

每日检查：

```bash
kubectl get vpa -n ecommerce
kubectl get vpa -n ecommerce -o json | jq -r '
  .items[]
  | .metadata.name as $vpa
  | .status.recommendation.containerRecommendations[]?
  | [$vpa, .containerName,
     .lowerBound.cpu, .lowerBound.memory,
     .target.cpu, .target.memory,
     .upperBound.cpu, .upperBound.memory,
     .uncappedTarget.cpu, .uncappedTarget.memory]
  | @tsv'
```

停止条件：出现 targetRef 失效、`RecommendationProvided` 长时间消失、recommender restart/OOM，或推荐值被同一边界整齐顶住时，先修采集链，不进入 requests 写回。

### 7.2 补齐独立使用量证据

VPA 维护聚合模型，但不替代长期时间序列。需要把容器实际 CPU、memory working set、filesystem、network 和 OOM reason 经 kubeletstats/cAdvisor 写入 VictoriaMetrics，并验证按 namespace/workload/container 查询。

长期指标补齐前，不能只凭 metrics-server 瞬时值和 VPA Target 定稿。

### 7.3 形成每个 workload 的校准记录

每个 workload 单独记录：

1. 当前 requests/limits；
2. 观测范围和流量 profile；
3. VPA 四档推荐；
4. 启动峰值与稳定期峰值；
5. k6 P95/P99、错误率和饱和点；
6. 新 requests 的选择理由；
7. limits 与 OOM 风险；
8. N+1 场景是否仍可调度。

frontend 当前没有 requests，应优先补齐，但仍要经过同一证据流程。

### 7.4 分批写回和 rollout

按以下批次执行，禁止同时重启全部 Deployment：

1. API；
2. relay/indexer；
3. frontend/consumer-next；
4. gateway。

每批先改源码并执行 structcheck/server dry-run，再发布 dev。发布后检查 Pod 落点、Node Allocated resources、实际用量、延迟、错误率、OOM 和 Pending。至少覆盖一轮代表性峰值后，才进入下一批或晋级 prod。

### 7.5 告警和故障演练

后续仍需完成：

- VPA 推荐停更和 targetRef 失效告警；
- ecommerce 节点 skew 告警；
- `FailedScheduling` topology/anti-affinity/insufficient resources 告警；
- 节点宕机、资源耗尽、并发 rollout 和扩缩容演练；
- 单节点故障后的 N+1 容量验证。

完整清单见 [`docs/design/platform/capacity-balancing.md`](../design/platform/capacity-balancing.md)。

## 8. 回滚与故障边界

recommender 不在业务数据面。它停止工作时，影响是推荐值不再更新，不影响业务 Pod 运行。

需要停止本次观察时，可以删除 ecommerce VPA CR。不要把旧 `InPlace` 清单重新应用到 live：

```bash
kubectl delete -f application-vpa.yml
```

如果 revision 2 的 recommender 参数导致控制面自身异常，可以回滚 Helm release：

```bash
helm rollback vpa 1 -n kube-system
```

回滚后默认 `25m/250Mi` 地板会重新生效，已有推荐值将失去当前口径，因此必须在报告中记录口径变化。删除 VPA 或回滚 recommender 都不应触发业务 rollout；执行后仍要比较业务 Pod 身份并检查 webhook/updater 数量。

## 9. 验证记录

本次已通过：

- `kubectl apply --dry-run=server -f application-vpa.yml`；
- `kubectl diff -f application-vpa.yml`，发布后零差异；
- 15 个 VPA target/container/live condition 结构验证；
- VPA Helm recommender-only 渲染验证；
- 发布前后 Deployment/Pod 身份比较；
- `go test -count=1 ./structcheck/...`；
- `scripts/verify-quick.sh backend`；
- `scripts/verify-context.sh`。

## 10. 关联文档

- 容量校准、故障注入与告警清单：[`docs/design/platform/capacity-balancing.md`](../design/platform/capacity-balancing.md)
- Descheduler 当前不安装的决策：[`docs/reports/2026-08-29-descheduler-decision.md`](2026-08-29-descheduler-decision.md)
- 技术架构入口：[`docs/TECH.md`](../TECH.md)
- 当前环境事实：[`context/team/local-env.md`](../../context/team/local-env.md)
- 进度真相源：[`TODO.md`](../../TODO.md)
