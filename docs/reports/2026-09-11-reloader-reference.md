# 2026-09-11 Reloader 参考：Secret 变更后自动滚动工作负载

> 用户提问语境：「装 stakater/reloader 可以带来什么？是解决 Vault 改值后 Secret 变了、进程还是旧密码的问题，让它自动重启应用？」本文回答三件事：**Reloader 是什么、它在凭据链路里管哪一段**；**放到本项目里，它解决了什么、没解决什么**；**接入方式、验证与采用条件**。
> 结论先行：**条件采纳，部署资产已就位、默认关闭。** 它只补「ESO 物化了新 Secret 但 Pod 不重启」这一环，对本项目最要紧的那一环——10 个业务服务的凭据在 Config Center 里、不是 K8s Secret——它管不到。共享凭据的轮换仍然是「改凭据后端 → 提供方滚动 → **消费方重写**」三步，Reloader 只自动化了第二步。在 harvest 脚本也能自动触发之前，显式 `rollout restart` 时机更可控。
> 关联事实：部署资产在 kubernetes 仓 `components/reloader/`（chart `stakater/reloader` 2.2.17 / app v1.4.22；2026-09-11 在机房集群安装并跑通 §五的自检——Secret 改值后 Deployment generation 1→2、新 Pod 读到新值——随后卸载，`ADDON_RELOADER` 保持 `false`）。本仓无任何文件引用 Reloader（2026-09-11 全仓 grep）；§四的注解写法是上游通用用法，未在本仓 manifest 里落地。

## 一、Reloader 是什么

Reloader 是 [stakater](https://github.com/stakater/Reloader) 维护的 Kubernetes 控制器。它监听 Secret 与 ConfigMap 的变化；某个工作负载（Deployment / StatefulSet / DaemonSet / Argo Rollout）带了它的注解并引用了变化的对象，它就修改该工作负载的 Pod 模板，触发一次标准滚动更新。

它做的事只有一件：**把「Secret 变了」翻译成「滚动一次」**。不读 Secret 内容，不连凭据后端，不改应用配置。

| 能力 | 说明 |
|---|---|
| 触发条件 | 被引用的 Secret / ConfigMap 的 data 发生变化（创建、删除默认不触发） |
| 接入方式 | 工作负载 metadata 上的注解，两种粒度：`reloader.stakater.com/auto: "true"`（该工作负载引用到的全部对象）或 `secret.reloader.stakater.com/reload: "a,b"`（点名） |
| 滚动方式 | `reloadStrategy`：`env-vars`（往容器塞 `STAKATER_*_LAST_RELOADED` 环境变量）或 `annotations`（改 Pod 模板注解，与 `kubectl rollout restart` 同构） |
| 作用范围 | 默认全集群；`ignoreNamespaces`、`namespaceSelector`、`resourceLabelSelector` 收窄 |
| 可观测 | `:9090/metrics`，`reloader_reload_executed_total{success}` |
| 资源 | 单副本控制器，常驻 <30 MiB；`enableHA` 只是 leader election |

## 二、它在凭据链路里管哪一段

本项目的凭据链路按 [TECH-RADAR §4.9](../TECH-RADAR.md) 定稿为 ESO + OpenBao（VPS Vault 为早期接线，见 kubernetes 仓 TODO「2026-08-17 GitOps L3」）。完整链路是四段，Reloader 只在第三段：

```text
① 凭据后端改值(OpenBao/Vault)
② ESO 按 refreshInterval 物化为 K8s Secret          ← external-secrets 组件
③ 引用该 Secret 的 Pod 滚动, 进程用上新值             ← Reloader(或手工 rollout restart)
④ 把新值同步给不通过 K8s Secret 读凭据的消费方        ← Config Center harvest 脚本
```

第 ④ 段是本项目特有的：10 个业务服务的 `bootstrap.yaml`（PostgreSQL、Dragonfly、Consul、MinIO 等连接参数）由 Config Center 下发，服务只持有一枚 machine token，**从不读 K8s Secret**。Dragonfly 密码变了，Reloader 能把 Dragonfly 自己滚一遍，却不知道 cart/order/user 在 Config Center 里还记着旧密码。这段由 kubernetes 仓 `tools/config-center-harvest.sh` 负责（读组件契约 → 按 JSON Schema 路径改 Config Center 键 → 签 machine token → 滚动服务）。

由此得到本项目的判断：

| 问题 | Reloader 的答案 |
|---|---|
| Vault 改值后 Secret 变了、进程还是旧密码 | **是它解决的**，前提是该进程从 K8s Secret 读凭据 |
| 让它自动重启应用 | 是，但只重启**引用了那个 Secret 的工作负载**——业务服务不引用凭据 Secret，不会被重启 |
| 装了它凭据轮换就闭环了 | **否**。它把断连窗口提前而不是消失：Vault 一改值 Dragonfly 立刻重启，harvest 没跟上时消费方就一直连不上，直到有人跑脚本 |

## 三、对照本项目：什么时候值得开

当前唯一的改值路径是「人跑脚本」（`config-center-pre-seed.sh` 及其后继 harvest）。这条路径里，脚本自己在 ESO 就绪后显式 `rollout restart`，时机可控，可以先 harvest 再重启把窗口压到最短。此时 Reloader 没有增量价值，反而可能在 harvest 之前抢先重启提供方。

值得开的信号（任一）：

1. OpenBao/Vault 配了定期自动轮换，值会在脚本之外变化。
2. 多人操作凭据后端，无法保证每次改值都跟着跑脚本。
3. harvest 已能被 Secret 变更事件触发（CronJob 或 ESO 事件），第 ③④ 段可以同时自动化。

开了之后的纪律：

- 只用**点名注解**，不开 `autoReloadAll`。全局模式会把 cert-manager 证书续期、CNPG 每 90 天的 CA 续期都算进去，证书一续业务 Pod 就滚。
- `ignoreJobs` / `ignoreCronJobs` 打开：Secret 变了不该重跑一次性任务，将来 harvest 若做成 Job 更不能被它触发。
- 控制面命名空间（`kube-system`、`cert-manager`、`external-secrets`、`openbao`、`trust-system`）加进 `ignoreNamespaces`。
- 用 `annotations` 策略，不往业务容器注入额外环境变量。

## 四、接入方式

在 kubernetes 仓打开开关并安装（`DEPENDS_ON=external-secrets`，编排器保证顺序）：

```sh
# bootstrap/config.env 或 config.hosting.env
ADDON_RELOADER="true"
# 单独装
bash components/reloader/install.sh
```

给工作负载加注解（推荐点名）：

```sh
kubectl -n dragonfly annotate deploy/dragonfly \
  secret.reloader.stakater.com/reload=dragonfly-password-secret
```

chart 支持 Deployment 级 annotations 时优先写进 values，让注解随 chart 管理；Dragonfly 的 chart 只有 `podAnnotations`，kubernetes 仓的 `components/dragonflydb/install.sh` 在安装末尾用 `kubectl annotate` 打在 Deployment 上——这是 metadata 合并，与 helm 的三方 merge 不冲突（dragonflydb README §6 记的冲突坑是 `kubectl patch` 改 args，不是一回事）。

**不要**给以下对象加注解：

- 密码只在首次初始化时读取、之后存进自己数据库的应用（Grafana admin、Harbor、Bugsink / healthchecks 的超级用户）。Secret 变了它们重启也不会换密码，重启只带来一次无意义的中断。
- 引用了 CA / 证书 Secret 且自己会热加载的应用。

## 五、验证

「Pod Running」不是验证。kubernetes 仓自带端到端自检：建临时 Secret 与带注解的 Deployment，改 Secret 值，断言 60 秒内 `observedGeneration` 递增且新 Pod 读到新值：

```sh
bash components/reloader/examples/selftest.sh
# ✔ Reloader 自检通过: generation 1 → 2, 新 Pod PASSWORD=v2
```

真实链路验证要走完四段：在 OpenBao 改 `k8s/<集群>/dragonfly` 的 `password` → ESO 同步（`kubectl annotate externalsecret <name> force-sync=$(date +%s)` 可立即触发）→ `kubectl -n dragonfly rollout history deploy/dragonfly` 多出一版 → 跑 harvest → 业务服务 `readyz` 恢复 200。缺任何一段，都不能说轮换闭环。

## 六、与相邻工具的边界

| 工具 | 负责什么 | 不负责什么 |
|---|---|---|
| OpenBao / Vault | 凭据真相源 | 不知道谁在用 |
| ESO | 把真相源的值物化成 K8s Secret | 不重启任何 Pod |
| **Reloader** | Secret 变了滚动引用方 | 不读值、不连后端、不管非 Secret 消费方 |
| harvest 脚本 | 把地址与凭据按 Schema 写进 Config Center，签 token，滚动业务服务 | 不管理凭据后端 |
| Argo CD | 让集群状态收敛到 Git | Secret 值不在 Git 里，它看不见变化 |

## 参考

- [stakater/Reloader](https://github.com/stakater/Reloader) —— README 含注解与 flag 全表
- [Reloader Helm chart values](https://github.com/stakater/Reloader/blob/master/deployments/kubernetes/chart/reloader/values.yaml)
- kubernetes 仓 `components/reloader/README.md` —— 本集群取舍与踩坑
- kubernetes 仓 `components/external-secrets/README.md` —— ESO 接线，「物化后 Pod 不会自动重启」的出处
