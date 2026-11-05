# 运行证据(runtime-evidence)

> 对应课程第 02 章「运行证据」交付物。全部为**只读探测**(get/ps/version),未对集群做任何变更。
> 采集时刻:2026-10-31 08:47–09:05(+08:00)。集群 context:`kubernetes-admin@kubernetes`(kubectl client v1.37.2)。
> 证据属性:以下 Kubernetes/Docker 状态是**瞬时快照**。按 AGENTS.md 口径,故障证据不能当稳态基线;引用时须带本时刻。

## 1. 本机验证链(Facts)

`scripts/verify-quick.sh` 于 2026-10-31 08:50 前后执行,**5 项全绿**:

| 检查 | 结果 | 耗时 |
|---|---|---|
| backend(go build + vet + test -short) | ✅ | 10s |
| frontend(pnpm ready) | ✅ | 29s |
| sensitive-data(worktree + history) | ✅ | 29s |
| notices(THIRD_PARTY_NOTICES 新鲜度) | ✅ | 29s |
| deploy-manifests(KYAML + helm≡裸 manifest + promote 回归) | ✅ | 29s |

工具链:go 1.27.3 / node 26.8.1 / pnpm 12.15.0 / docker 29.9.2 / helm v4.3.1 / argocd CLI v3.5.6 / python 3.14.7。
Docker:仅 `buildx_buildkit_multi0` 在跑,无本地 compose 栈(本地环境未拉起,未验证 compose 全链)。

## 2. 集群工作负载快照(Facts,`kubectl -n ecommerce get deploy,pods`)

13 个 Deployment,镜像全部为腾讯云仓库 pin digest:后端 10 服务 `:1.8.1@sha256:…`(与 TODO 2026-10-25「对齐线上实跑的 1.8.1 digest」一致);`control-tower-gateway:0.2.22`;`ecommerce-frontend` 与 `consumer-next` `:1.7.13@sha256:…`。

**异常快照(与本轮静态审计结论相关)**:

| 现象 | 证据 |
|---|---|
| behavior 两个 ReplicaSet 各 1 pod,**双双 0/1 Running,已持续 4h9m / 4h2m** | `ecommerce-behavior-deploy-55fc84764b-*`(旧 RS)、`-65554788cd-*`(新 RS);滚动卡住,新旧都过不了 readiness |
| order 0/1(user 0/1 ContainerCreating、consumer-next 1/2 Init:0/1、gateway 有 11s 新 pod) | 采集时点恰逢一轮滚动更新进行中;main HEAD `7fe3294c`(今日 05:10)是 consumer 提交,consumer-next 的时间线吻合,但**镜像 digest 与该 commit 的对应关系未验证** |
| ArgoCD `Application/ecommerce-prod` = **Synced / Degraded**;`ecommerce-kyverno` = Synced/Healthy;`control-tower-gateway/config` = Synced/Healthy | `kubectl -n argocd get applications`。TODO 2026-10-25 记录手工 sync 后 56 资源 Synced+Healthy;今日 Degraded 与上表非 ready 工作负载的时间线一致,根因未归因(未验证) |

其余 8 个后端服务(address/cart/inventory/merchant/payment/product/search/frontend)1/1 Running。

## 3. CDC 链路运行证据(Facts)

| 组件 | 状态 | 命令证据 |
|---|---|---|
| Kafka(Strimzi 单节点 KRaft) | entity-operator 2/2 Running;kafka-exporter ContainerCreating(滚动中) | `kubectl -n kafka get pods` |
| KafkaConnect `my-connect-cluster` | DESIRED 1 / READY True | `kubectl -n kafka get kafkaconnect` |
| Debezium source `ecommerce-postgres-source` | **READY True** | `kubectl -n kafka get kafkaconnectors` |
| ES sink `ecommerce-elasticsearch-sink` | **READY True** | 同上 |
| Elasticsearch `elasticsearch-0` | 1/1 Running(restarts 0) | `kubectl -n elasticsearch get pods` |
| `cdc-reconcile-es` CronJob | 历史 3 批 pod **Error**(29889875/80/85,约 4h13m–4h18m 前),最近一批(29890130)**Completed**(采集前 119s) | `kubectl -n kafka get pods`。失败原因未查日志,未归因 |

清单本体在 `/Users/lens/lens077/kubernetes/components/kafka/cdc/`(main @ `7d72643b`):`ecommerce-postgres-source.yaml`、`ecommerce-elasticsearch-sink.yaml`、`kafka-connect.yaml`、`connect-metrics-configmap.yaml`、`kafka-external-gateway.yaml`、`rbac.yaml`、`reconcile/`、`reflow-sink.sh`。

## 4. 命名空间存在性(Facts)

`argocd` `argo-rollouts` `cert-manager` `cilium-secrets` `cnpg-system` `config-center`(遗留标签 ns) `consul` `dragonfly` `ecommerce` `elasticsearch` `external-secrets` `kafka` `keda` `kyverno`* 等均 Active——与 TODO「集群 2026-09-22 重建为 k1/k2/k3」的组件布局吻合。(*kyverno 从 argocd app 与 ns 列表交叉确认。)

## 5. 本轮未验证清单(TODOs,后续章节补)

- TODO-R1 behavior 0/1 的 readiness 根因(容器日志/事件未读)。
- TODO-R2 ArgoCD Degraded 的具体资源与条件。
- TODO-R3 connector 内部 task 状态(RUNNING/PAUSED/FAILED)、Kafka topic 列表、sink lag、slot 位点差——CRD READY=True 不等于无延迟。
- TODO-R4 ES `ecommerce_catalog_products` alias 的文档数对账、增量延迟(约 6s 是 matrix 2026-09-03 实测值,非本轮复测)。
- TODO-R5 配置中心实际内容(含 matrix 标注「未核实」的 behavior 副本)、pg-main/CNPG 状态、Gorse、Silo、Dragonfly 实测。
- TODO-R6 「镜像 digest ↔ main commit」的可追溯链(课程第 10 章验收项,本轮只观察到时间线吻合)。

## 6. Decisions

- DEC-1 运行证据只记瞬时快照并标注时刻,不写入任何稳态结论;后续章节引用时以「2026-10-31 08:5x 观测」为准。
- DEC-2 探测全部只读;任何涉及集群变更的动作不属本轮审计范围(硬规则 6)。
