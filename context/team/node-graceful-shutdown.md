---
name: node-graceful-shutdown
layer: team
description: Kubernetes 节点关机与重启的 GracefulNodeShutdown 设计：90/30 秒预算、systemd inhibitor、终态 Pod、验证与清理
---

# Kubernetes 节点优雅关机：设计与操作边界

## 结论

当前节点执行 `shutdown now` 或 `systemctl reboot` 后不会立即断电，这是有意设计，不是 Ubuntu
卡死。systemd-logind 先通知 kubelet，kubelet 通过 delay inhibitor 取得最多 90 秒的善后窗口，
按优先级停止 Pod 并卸载卷。所有工作提前完成时可以提前关机；到达 90 秒上限时，logind
不再等待，系统继续关机或重启。

这套机制只处理**单个节点的本地关机**，不等于整套集群的关机编排：

- 它不会保证多个节点按顺序关闭，也不会等待跨节点复制完成。
- 它不会让容器跨重启继续运行。节点恢复后，由 Deployment、StatefulSet 等控制器恢复期望副本。
- 它不会立即删除已经进入 `Succeeded` 或 `Failed` 的 Pod API 对象。终态记录由 PodGC 或人工清理。
- 断电、宿主机崩溃、Parallels 强制停止等非正常关机不会获得这 90 秒。

不要为了让终态 Pod「看不见」而把优雅关机关闭。需要分别处理关机安全与 Pod 历史清理。

## 实现真相源

集群安装器位于同级仓库 `../kubernetes`。当前设计由以下两处实现：

| 配置 | 实现位置 | 当前值 | 作用 |
|---|---|---:|---|
| `KUBELET_SHUTDOWN_GRACE` | `../kubernetes/bootstrap/config.env` | `90s` | 节点优雅关机总预算；`0s` 表示关闭 |
| `KUBELET_SHUTDOWN_GRACE_CRITICAL` | `../kubernetes/bootstrap/config.env` | `30s` | 总预算中留给关键 Pod 的最后一段时间 |
| `shutdownGracePeriod*` | `../kubernetes/bootstrap/scripts/50-kubernetes.sh` 生成的 `KubeletConfiguration` | `90s/30s` | kubelet 的实际关机策略 |
| `InhibitDelayMaxSec` | 同一脚本写入 `/etc/systemd/logind.conf.d/zzz-kubelet.conf` | `90` | 允许 kubelet 阻止 logind 继续关机的最长时间 |

`zzz-kubelet.conf` 的文件名前缀不能随意改短。Ubuntu 的 unattended-upgrades 自带 logind
drop-in，并把 `InhibitDelayMaxSec` 设为 30 秒；systemd 按文件名字典序合并配置。安装器使用
`zzz-`，是为了确保 kubelet 的 90 秒上限最后生效。

### 变更门禁：总预算自动派生并校验

`KUBELET_SHUTDOWN_GRACE` 是唯一的总预算入口。`50-kubernetes.sh` 会把 `90s`、`1m30s`
等整数 `h/m/s` 组合换算为秒，再自动生成 `InhibitDelayMaxSec`，不再单独写死 `90`。
安装前和全局验收都会检查：

```text
InhibitDelayMaxSec = shutdownGracePeriod
shutdownGracePeriod >= shutdownGracePeriodCriticalPods
```

校验同时覆盖 `config.env`、安装器托管的 `zzz-kubelet.conf`、通过 login1 D-Bus 读取的
systemd-logind 运行时值，以及已经存在的 `/var/lib/kubelet/config.yaml`。任意一处漂移都会中止安装。
已运行节点若只改 `config.env` 而 kubelet 仍是旧预算，安装器会在改写 logind 前停止；先更新
kubelet 或重建节点，再重跑 `50-kubernetes`。这可以阻止以下两类错误：

- kubelet 请求 120 秒、logind 仍只给 90 秒：Pod 或卷尚未完成清理，系统已经继续关机。
- logind 上限远大于 kubelet 预算：不会增加 kubelet 的实际清理时间，只会让配置语义难以判断。

当前 `90s/30s/90s` 三者一致，不需要修改。

## `shutdown now` 的实际时序

当前配置把 90 秒分成两组：普通 Pod 最多使用前 60 秒，关键 Pod 最多使用最后 30 秒。
关键 Pod 通常具有 `system-cluster-critical` 或 `system-node-critical` 优先级。

```text
操作员或 kured 执行 shutdown/reboot
  ↓
systemd-logind 发出 PrepareForShutdown
  ↓
kubelet 的 shutdown manager 取得 delay inhibitor
  ↓
节点拒绝新 Pod，并开始终止普通 Pod                     最多 60 秒
  ↓
终止关键 Pod                                             最多 30 秒
  ↓
等待容器退出、卷卸载；完成则提前释放 inhibitor
  ↓
全部完成，或 90 秒上限到达
  ↓
systemd 继续关机或重启
```

`shutdownGracePeriod` 是**上限**，不是固定等待时间。某个节点 60 秒内完成清理时可以提前关机；
有卷未卸载时则可能用满 90 秒。

## 当前集群的验证证据

**当前集群是三节点**：node101 / node102 / node103（`192.168.3.101-103`，全 arm64，
Kubernetes v1.36.4）。下面这次关机取证发生在 2026-08-20，**是重建前的两节点集群**
（当时节点还叫 node1/node2），机制结论不变，节点名不要照抄：

- 关机节点的 systemd-logind 在 23:38:52 记录 `The system will power off now!`。
- kubelet 随后停止 Pod，并等待容器和卷退出。
- 该节点在 23:40:22 记录 delay inhibitor 到达上限，间隔正好 90 秒。
- kubelet 同时记录 `Failed while waiting for all the volumes ... context deadline exceeded`；
  未及时卸载的对象包括 OpenEBS 本地卷。
- logind 到达上限后继续关机，因此「优雅」是有上限的尽力清理，不是无限等待或全部成功保证。
- 另一个节点更早完成本地清理，没有必须等待满 90 秒——**90 秒是上限，不是固定耗时**。

当前三个节点的 `/var/lib/kubelet/config.yaml` 都是：

```yaml
shutdownGracePeriod: 90s
shutdownGracePeriodCriticalPods: 30s
```

三个节点的有效 logind 配置也都先读取 unattended-upgrades 的 `InhibitDelayMaxSec=30`，再由
`zzz-kubelet.conf` 覆盖为 `InhibitDelayMaxSec=90`。因此当前运行状态与安装器设计一致。

节点每次启动时，kubelet 日志都会重新记录：

```text
Creating node shutdown manager shutdownGracePeriodRequested="1m30s"
shutdownGracePeriodCriticalPods="30s"
```

配置写在持久磁盘中，普通重启不会清除。只有重新运行安装器并生成不同配置、执行
`kubeadm reset/join`、重装节点或回滚 VM 快照时，配置才可能变化。

## 为什么关机后会出现大量相同 Pod

ReplicaSet 的 `replicas: 1` 只表示需要 1 个**活动副本**，不表示 API 中只能存在 1 个同名前缀
的历史对象。优雅关机时会发生以下过程：

1. kubelet 停止旧容器，并把旧 Pod 标记为 `Succeeded` 或 `Failed`。
2. ReplicaSet 不再把终态 Pod 计入活动副本。
3. 控制器创建新 Pod，继续满足 `replicas: 1`。
4. 旧 Pod 对象没有立即删除，因此管理界面同时显示新 Pod 和历史终态 Pod。

**结论（阈值）**：kube-controller-manager 的 PodGC 阈值现为
`--terminated-pod-gc-threshold=100`（默认值 `12500` 实际等于不清理——终态 Pod 总数低于阈值时
PodGC 不主动批量清理，所以一度累积到 327 个）。当前三节点集群稳定保持终态 Pod `100/100`。

**由此得到两条判据**：

1. **终态 Pod 数量 ≠ 运行副本数量。** 清理 326 个 ReplicaSet 终态 Pod 后，所有业务
   Deployment 仍是 `DESIRED=1/CURRENT=1`——它们是历史记录。看副本数要看 Deployment，
   不要数 Pod 行数。
2. **`Error`/`Failed` 的终态 Pod 不等于当前故障。** 曾把遗留的 VPA recommender
   `Failed/Terminated` Pod 误判成控制面故障，而同一 ReplicaSet 的活动 Pod 实际是
   `1/1 Running`。健康检查已改为**只阻断未在删除中、且仍应活动的** Pending / Unknown /
   Running-NotReady Pod。

以前「完成后不显示」不代表 Kubernetes 会隐藏 `Completed`。更可能的路径是：旧配置中
`shutdownGracePeriod: 0s`，节点直接离线后由 Node Controller 驱逐并删除 Pod 对象；或者管理
界面当时过滤了终态对象。当前安装器明确启用了 GracefulNodeShutdown，所以 kubelet 会主动写回
终态，Pod 对象在被删除前一直可见。

## 检查与判定

### 1. 检查 kubelet 的生效配置

从 Kubernetes API 查询，避免只看安装器模板：

```bash
for node in node101 node102 node103; do
  kubectl get --raw "/api/v1/nodes/$node/proxy/configz" \
    | jq '.kubeletconfig | {shutdownGracePeriod, shutdownGracePeriodCriticalPods}'
done
```

期望三个节点都返回 `1m30s` 和 `30s`。节点 API 不可用时，在节点上检查：

```bash
sed -n '/^shutdownGracePeriod:/p; /^shutdownGracePeriodCriticalPods:/p' \
  /var/lib/kubelet/config.yaml
```

### 2. 检查 logind 的有效上限

在节点上执行：

```bash
systemd-analyze cat-config systemd/logind.conf \
  | grep -n 'InhibitDelayMaxSec'
```

最后生效的值必须至少为 90 秒。若仍为 30 秒，先检查
`/etc/systemd/logind.conf.d/zzz-kubelet.conf` 是否存在，以及是否有名字排序更靠后的 drop-in
覆盖它。

### 3. 检查一次关机是否走了优雅路径

节点重新启动后，检查上一个 boot：

```bash
journalctl -b -1 -u systemd-logind -u kubelet --no-pager \
  | grep -Ei 'power off|shutdown manager|NodeShutdown|inhibitor|volumes'
```

判断条件：

- 出现 `The system will power off now!` 与 `Creating node shutdown manager`：正常进入优雅关机路径。
- 出现 `Delay lock ... inhibitor timeout is reached`：清理使用了全部上限。
- 出现 `Failed while waiting for all the volumes`：卷未在上限内卸载，应继续排查 CSI 关闭顺序。
- 完全没有 shutdown manager 记录：检查 kubelet 配置是否为 `0s`，或是否发生了强制断电。

### 4. 区分活动副本与终态历史

```bash
kubectl get pods -A \
  --field-selector=status.phase!=Succeeded,status.phase!=Failed
```

统计终态 Pod 及其 owner：

```bash
kubectl get pods -A -o json | jq -r '
  .items[]
  | select(.status.phase == "Succeeded" or .status.phase == "Failed")
  | [.metadata.namespace, .metadata.name,
     (.metadata.ownerReferences[0].kind // "<none>"),
     (.metadata.ownerReferences[0].name // "<none>"),
     .status.phase]
  | @tsv'
```

不要仅凭同名前缀的 Pod 数量判断副本数。副本数应检查 Deployment、StatefulSet 或 ReplicaSet
的 `spec.replicas` 与 `status.readyReplicas`。

### 5. 检查终态 Pod GC

检查运行中 kube-controller-manager 的参数：

```bash
kubectl -n kube-system get pods -l component=kube-controller-manager -o json \
  | jq -r '.items[].spec.containers[].command[]' \
  | grep -- '--terminated-pod-gc-threshold='
```

期望返回：

```text
--terminated-pod-gc-threshold=100
```

统计当前终态 Pod：

```bash
kubectl get pods -A -o json \
  | jq '[.items[] | select(.status.phase == "Succeeded" or .status.phase == "Failed")] | length'
```

安装器 50 阶段最多观察 180 秒终态 Pod 数量，未收敛只告警（活跃集群会持续产生新终态 Pod，
硬失败会误判）；90 阶段硬校验配置一致性，对数量只做观察。统计不含已带 `deletionTimestamp` 的 Pod。

## 清理终态 Pod

终态 Pod 不再占用运行时 CPU 或内存，但会占用 API/etcd 记录，并干扰管理界面和排障。
清理前要确认不再需要对应容器日志。

以下命令只删除 `Succeeded/Failed` 且 owner 为 ReplicaSet 的 Pod，保留运行中 Pod、StatefulSet
Pod 和已完成 Job：

```bash
kubectl get pods -A -o json \
  | jq -r '
      .items[]
      | select(
          (.status.phase == "Succeeded" or .status.phase == "Failed")
          and .metadata.ownerReferences[0].kind == "ReplicaSet"
        )
      | [.metadata.namespace, .metadata.name]
      | @tsv' \
  | while IFS=$'\t' read -r namespace pod; do
      kubectl delete pod -n "$namespace" "$pod" --wait=false --ignore-not-found
    done
```

安装器以 `KCM_TERMINATED_POD_GC_THRESHOLD="100"` 治理该参数，每次执行重新调和（不依赖
`.done` 标记）：先把 live ClusterConfiguration 与静态 Pod 清单备份到
`/var/lib/k8s-installer/backups/podgc/<UTC时间>-<PID>/`，再原子替换
`/etc/kubernetes/manifests/kube-controller-manager.yaml`，确认 node101 具名控制器生效且
Ready 后才定向更新 `kubeadm-config` 的对应 extraArg（不覆盖其他字段）。中途失败双向回滚。

**改这个参数前必须知道的四件事**：

- 它是**全局数量阈值，不是 TTL**——不是「完成后立即删除」。
- 超阈值后 PodGC **可能删掉已完成 Job 的 Pod 和容器日志**（不删 Job 对象本身）。
- **删掉的日志和现场无法恢复**，恢复配置快照也救不回来。设太低会缩短排障窗口。
- 设为 `0` 或负数会关闭终态 Pod GC，**安装器直接拒绝**。

⚠️ 优雅关机预算必须保持 `90s/30s`。**不要把 `shutdownGracePeriod` 改成 `0s` 来「让终态 Pod 不出现」**
——那是关掉优雅关机，不是清理。

## 操作边界

- 正常关机或重启：使用 `shutdown now` 或 `systemctl reboot`，并允许最多 90 秒完成。
- 关机等待期间：不要因为节点仍可 ping 就再次强制停止 VM。此时 kubelet 可能仍在停止 Pod 或卸载卷。
- 整集群关机：GracefulNodeShutdown 只做节点本地善后，不提供多节点顺序、quorum 或业务停写保证。
- 强制关机：只用于节点已经失去响应且已接受数据损坏和卷清理不完整的风险。
- 终态 Pod 累积：调 PodGC 或定向清理，不要把 `shutdownGracePeriod` 改回 `0s`。
- 应用自身 CrashLoop：它也会产生失败状态，但根因不一定是节点关机；必须结合容器退出原因和日志判断。
