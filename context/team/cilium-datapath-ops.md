---
name: cilium-datapath-ops
layer: team
description: Cilium 数据面两条只能实测的事实——ipcache 身份失配会让写好的 CNP 放行规则静默失效（控制面 CEP/标签/Valid 全绿）；bpf-map-dynamic-size-ratio 按节点内存百分比预分配 conntrack/NAT 表，缩容后旧 map 被 cilium-envoy 持有成孤儿并从 Pod 指标里消失。排查 default-deny 丢包或核 cilium 内存前必读
---

# Cilium 数据面：身份解析与 BPF map 容量

**范围**：所有跑在本集群上的服务。这两条都**读代码读不出来**——控制面对象全是健康的，
真相只在数据面（ipcache / BPF map）里。

---

## 一、ipcache 身份失配：放行规则明明写了，流量还是被 default-deny 丢掉

**症状**

服务连某个依赖**超时**（不是 connection refused），而这个依赖：

- Pod `1/1 Running`
- Service 有 endpoints
- CiliumNetworkPolicy 里**确实有**放行它的 `toEndpoints` 规则
- CNP `Valid=True`，Pod 标签与 selector 逐条对得上
- `CiliumEndpoint` 有正确的 security identity，`ENDPOINT STATE: ready`

2026-08-29 的实例：10 个业务服务连 `dragonfly.dragonfly.svc:6379` 全部
`context deadline exceeded`，崩了 9 小时、每个重启 36+ 次。

**关键陷阱**

**能想到要查的东西全是绿的。** CEP 正常、标签匹配、策略 Valid——于是排查方向很自然地跑去
「是不是 TLS 握手不对」「是不是 Dragonfly 自己有问题」「是不是 DNS」。

第二层伪装：`docs/reports/2026-08-28-zero-trust-runtime-security.md` 的应急建议是
**「业务网络异常：先删除 `ecommerce-api-default-deny`」**。这条会「修好」症状——
删掉 default-deny 流量确实通了——但身份仍然是坏的，你什么也没学到，
下次加回策略照样复发。**先删策略之前，务必先看一眼 ipcache。**

**根因**

数据面判定目的地身份走的是 **ipcache**，不是 CiliumEndpoint。两者会失配：

```
# CiliumEndpoint（控制面）——正常
dragonfly-xxx   SECURITY IDENTITY 6081   ready   10.244.1.8

# ipcache（数据面）——错的
node102:  10.244.1.8/32  →  reserved:unmanaged   (source: k8s)
node101:  （无条目）
node103:  （无条目）
```

目的地被解析成 `reserved:unmanaged`（保留身份 3），`toEndpoints` 的标签选择器
自然匹配不上；`enableDefaultDeny.egress: true` 兜底 → 丢包。

**注意另外两个节点连条目都没有**——只查一个节点会得出「只有这台有问题」的错误结论。

**诊断（按这个顺序，三条命令定位）**

```bash
# 1. 判决书：DROPPED + policy-verdict:none + 目的地显示 (unmanaged) 就是这个坑
kubectl exec -n kube-system <cilium-pod> -c cilium-agent -- \
  hubble observe --verdict DROPPED --last 50

# 2. 三个节点都要查，不要只查一个
for n in node101 node102 node103; do
  P=$(kubectl get pods -n kube-system -l k8s-app=cilium \
      --field-selector spec.nodeName=$n -o jsonpath='{.items[0].metadata.name}')
  kubectl exec -n kube-system $P -c cilium-agent -- cilium-dbg ip list | grep "^<POD_IP>/32"
done

# 3. 对照控制面，确认是「失配」而不是「本来就没身份」
kubectl get cep -n <ns>
```

判据：`cilium-dbg ip list` 的 SOURCE 列。正常是 **`custom-resource`**（来自本地 endpoint），
坏掉是 **`k8s`** 配 `reserved:unmanaged`（k8s pod watcher 插的占位条目赢了）。

**修复**

重建目标工作负载，走一次完整 CNI ADD，让 ipcache 重新插入正确身份：

```bash
kubectl rollout restart deployment/<target> -n <ns>
```

然后**必须复验三个节点的 ipcache 都变成 `custom-resource`**，再看业务是否恢复。

⚠️ 上游服务此时多半已退避到 5 分钟重启间隔，看起来「还没好」。
删 Pod 清空退避计时器，不要靠等：

```bash
kubectl get pods -n <ns> --no-headers | awk '$3=="CrashLoopBackOff"{print $1}' \
  | xargs -r -n1 kubectl delete pod -n <ns> --wait=false
```

**排查捷径**

- **超时 vs 拒绝是第一个分叉**。timeout = 包被丢（策略 / 路由 / 身份）；
  connection refused = 有路由但没监听（后端挂了 / Service 无 endpoint）。别混着查。
- 依赖某组件的服务全崩、不依赖它的**全正常**——这个对照本身就锁定了依赖，
  比读日志快。本例中 payment / search / frontend / consumer-next 不用 Redis，全程 Running。

---

## 二、BPF map 容量：`kubectl top` 看到的 cilium 内存，大部分不是进程

**事实**

cilium agent 的 Pod 内存里**进程只占一小部分**，大头是内核 BPF map（记在 Pod cgroup 上，
`memory.stat` 的 `kernel` 行）。2026-08-29 实测单节点：

| 组成 | 大小 |
|---|---|
| `anon`（agent 进程堆） | 163 MiB |
| `file`（page cache） | 217 MiB |
| **`kernel`（BPF map）** | **860 MiB** |
| 合计 `memory.current` | 1240 MiB |

这 860 MiB 由 `bpf-map-dynamic-size-ratio` 决定——**按节点总内存的百分比**预分配
conntrack / NAT / nodeport 表，与实际负载无关。本集群曾配 `0.08`，
而 **Cilium 上游默认是 `0.0025`，即 32 倍**。三节点 17 个 Pod、近乎零流量，
配了一张按百万级并发连接尺寸的连接跟踪表。

改成 `0.02` 后（仍是上游默认的 8 倍，保守）：

```
cilium_ct4_global  1881248 条目 / 247.3 MiB  →  470312 条目 / 61.8 MiB
每节点 cilium BPF map 合计  889 MiB → 237.8 MiB
三个 agent Pod 合计        3439 MiB → 1287 MiB
```

改法（`--reuse-values` 保留其余配置，DaemonSet `maxUnavailable: 1` 自动逐节点滚动）：

```bash
helm upgrade cilium cilium/cilium --version <ver> -n kube-system \
  --reuse-values --set bpf.mapDynamicSizeRatio=0.02
```

⚠️ **改之前先 `--dry-run` 比对 `cilium-config` ConfigMap 的差异**，确认只动了这一个键。
`--reuse-values` 遇到 chart 版本变化时会引入意外漂移。

**关键陷阱：改完内存没降，因为旧 map 变成孤儿**

滚动重启后 `bpftool map show` 会看到**两个同名 map 并存**——新的（已缩小）和旧的（原尺寸）。
旧 map 没有任何 program 引用、也没有 pin，但**被 `cilium-envoy` 进程的 fd 持有**，不会释放。

更阴的是：旧 map 的内存原本记在**已删除的** cilium Pod cgroup 上，
cgroup 销毁后内存被 reparent 到父节点。于是它**从 `kubectl top pods` 里消失了，
却仍在占用节点内存**——你会以为省下来了，其实没有。

解法是重启该节点的 cilium-envoy：

```bash
kubectl delete pod -n kube-system <cilium-envoy-pod-on-that-node>
```

复验（三个节点都要，数字应当一致）：

```bash
kubectl exec -n kube-system <cilium-pod> -c cilium-agent -- bpftool map show -j \
  | python3 -c "import json,sys;m=json.load(sys.stdin);\
print(sum(x.get('bytes_memlock',0) for x in m if x.get('name','').startswith('cilium'))/1048576)"
```

**别被这两个指标骗了**

- `bpftool map show` 是**全节点视图**，包含别的组件的 map（例如 Tetragon 的 `execve_map` 30 MiB），
  不等于 cilium 的占用。按 `name` 前缀过滤。
- map 名在 `bpftool` 输出里**被截断到 15 字符**，`cilium_nodeport_neigh4` 和一堆
  per-endpoint 的 `cilium_nodeport*` 会挤成同名。按 `id` + `max_entries` 区分，
  不要按名字去重，否则会把活跃 map 误判成孤儿。
- 改完 `kubectl top nodes` 可能**不降反升**：省下的是 locked 内核内存，
  内核转手拿去做 page cache 了。看 `MemAvailable`（`/proc/meminfo`），不要看 working_set。

**为什么这条值得记**

`docs/TECH.md` §7.3 把容量治理分三层，其中「调度容量均衡」要求 requests 可信。
cilium 的 requests 是 `512Mi`，实占 1.24 GiB——**scheduler 每节点少算约 740 MiB**，
三节点合计 2.2 GiB。这不是 OpenCost 那类成本归因能发现的问题
（崩溃与超配在成本视图里都是隐形的），只能靠 VPA recommender + 本文的实测口径。
