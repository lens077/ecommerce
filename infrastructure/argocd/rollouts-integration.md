# ArgoCD 与 Argo Rollouts 集成边界

## 当前已验证状态

当前集群已安装并运行 Argo Rollouts controller `v1.10.0`，CRD 包括 `Rollout`、`AnalysisTemplate`、`AnalysisRun`、`Experiment` 和 `ClusterAnalysisTemplate`。

已用独立的临时 `rollouts-smoke` namespace 做 Blue-Green smoke test：

1. 创建一个单副本 `Rollout` 和 active `Service`。
2. Controller 创建带 `rollouts-pod-template-hash` 的 ReplicaSet。
3. Controller 接管 active Service selector。
4. Rollout 进入 `Healthy`。
5. 测试 namespace 已删除。

## 本仓当前接线

- `argocd-proj.yml` 已允许 namespaced `Rollout`、`AnalysisTemplate` 和 `AnalysisRun`。
- `argocd-app.yml` 已对 Service 的 `rollouts-pod-template-hash` selector 设置精确 `ignoreDifferences`。
- frontend Helm 开关 `frontend.rollouts.enabled`：chart 默认 `false`，**pre 为 `true`（Blue-Green）**，prod 为 `false`（仍是 Deployment）。
- 后端 10 个服务未迁移为 `Rollout`，没有启用 Canary。
- pre 的 Rollout 尚未经 ArgoCD 同步到集群（等 ApplicationSet 在新集群重新 apply），也还没有做过一次 promote。
- 没有配置 Argo Rollouts Gateway API traffic plugin。
- 没有配置自动 `AnalysisTemplate` 晋级或回滚。

「Rollouts controller 已安装」不等于「业务已经由 Rollouts 发布」。业务迁移必须同时修改 Helm、裸 manifest、VPA target、Service、ArgoCD diff 与回滚手顺。

## 为什么 chart 默认关闭、按环境打开

frontend 当前由三份部署事实共同约束：

- Helm chart 渲染 `Deployment`、active Service、HTTPRoute 和 VPA。
- `frontend/apps/consumer/deploy/pre/` 与 prod overlay 提供裸清单。
- `application-vpa.yml` 的 targetRef 指向 `ecommerce-frontend-deploy` Deployment。

只把 Helm 的 Kind 改成 Rollout 会造成 Helm/裸清单 parity 失败，并让 VPA target 失效。因此当前只保留显式开关，不提供半迁移模板。真正开启前必须一次性完成：

1. Helm Deployment → Rollout。
2. 增加 preview Service，保留 active Service 名称。
3. 同步修改 pre/prod 裸清单。
4. 将 VPA target 改为经当前 VPA 版本验证可用的 Rollout；不支持时先关闭该工作负载 VPA。
5. 先执行 Helm/kustomize parity，再执行 ArgoCD diff。
6. 使用 `autoPromotionEnabled: false` 做第一次 preview 验收。

## 下一步建议

frontend 的 pre/prod 部署目录已拆分：

```text
frontend/apps/consumer/deploy/
├── base/              # ConfigMap、active Service、HTTPRoute
├── pre/               # Rollout、preview Service
└── overlays/prod/     # Deployment + prod image digest
```

当前 pre 已切换为 Blue-Green Rollout，prod 仍保持 Deployment。pre 的 VPA 暂时关闭，直到确认当前 VPA controller 对 `argoproj.io/Rollout` target 的支持；prod VPA 不变。

镜像替换方面，Kustomize 是必要且足够的环境层工具：prod overlay 的 `images` 字段负责把共享 Deployment 镜像替换为不可变 tag/digest；Helm values 同时维护 ArgoCD/Helm 路径的环境值。不要再引入第三套 patch 脚本，CI 更新镜像时必须同步 Helm prod values 与 prod Kustomize overlay，并由 parity 门禁验证。

首次 pre 发布顺序：先 `argocd app diff`，再手动 sync，检查 preview Service，完成业务冒烟后执行 `kubectl argo rollouts promote`。后端单副本服务不能通过副本数实现有意义的百分比 Canary；需要精确流量比例时，另行评估 Gateway API traffic plugin，并先在 pre 验证 Cilium Gateway 行为。

## 常用验证命令

```bash
kubectl -n argo-rollouts get deploy,pod
kubectl get crd rollouts.argoproj.io analysisruns.argoproj.io analysistemplates.argoproj.io
kubectl -n ecommerce get rollout,analysisrun,analysistemplate
kubectl argo rollouts get rollout <name> -n ecommerce --watch
kubectl argo rollouts promote <name> -n ecommerce
kubectl argo rollouts abort <name> -n ecommerce
```

当前阶段不要对不存在的 `Rollout` 执行 promote/abort，也不要把 Deployment 和 Rollout 同时配置为同一 selector 的 owner。

## 官方参考

- <https://argo-rollouts.readthedocs.io/en/stable/>
- <https://argo-rollouts.readthedocs.io/en/stable/features/bluegreen/>
- <https://argo-rollouts.readthedocs.io/en/stable/features/analysis/>
- <https://argo-rollouts.readthedocs.io/en/stable/features/traffic-management/plugins/>
- <https://argo-cd.readthedocs.io/en/stable/operator-manual/health/>
