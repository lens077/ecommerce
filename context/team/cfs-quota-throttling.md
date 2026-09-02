---
name: cfs-quota-throttling
layer: team
description: CPU 利用率低但接口延迟飙升的头号嫌疑：容器被 CFS 配额在 100ms 周期内强制挂起；判据是 cpu.stat 的 nr_throttled/throttled_usec，不是 CPU 使用率；含实测复现、GOMAXPROCS 下限为 2 的意外结论，以及本仓当前测不到该指标的缺口
---

# CPU 才 15%，接口延迟却飙升

**症状**

线上微服务偶发延迟升高，但所有「常规嫌疑」都是干净的：

- 节点和容器的 CPU 利用率很低（15% 这一量级），远没跑满
- 磁盘 I/O 正常
- 没有死锁，火焰图上也看不出哪段代码变慢了
- **平均延迟正常，只有 p99/p999 和 max 异常**，且尖峰与流量曲线对不上

关键特征：延迟尖峰的量级是**几十毫秒到 100 毫秒**，呈突发、不规则形状，
而不是随负载缓慢劣化。直方图上是「一个正常的快峰 + 一个 50~100ms 附近的小慢峰」。

**关键陷阱**

CPU 使用率和「CPU 够不够用」是两个问题。容器被 CFS 挂起时，
它**不消耗 CPU**——所以越是被限流限得狠，CPU 曲线越好看。
用 CPU 利用率去否定「CPU 不足」，方向从一开始就是反的。

## 机制：配额不是速率，是每 100ms 的预算

Linux CFS 带宽控制按**周期**发放配额，K8s 默认周期 100ms
（本集群 kubelet 实测 `cpuCFSQuotaPeriod: 100ms`、`cpuCFSQuota: true`）。
`limits.cpu` 被换算成「每 100ms 能用多少 CPU 时间」：

| limits.cpu | cgroup v2 `cpu.max` | 含义 |
|---|---|---|
| `200m` | `20000 100000` | 每 100ms 只能用 20ms CPU 时间 |
| `300m` | `30000 100000` | 每 100ms 只能用 30ms |
| `1` | `100000 100000` | 每 100ms 只能用 100ms |

配额是**预算不是限速**：进程不会被匀速拖慢，而是全速跑到预算耗尽，
然后被内核**冻结到下一个周期开始**。这就是那个「几十毫秒」尖峰的来源。

多线程会让预算加速烧完：8 个线程并行跑，20ms 预算 2.5ms 就用光，
**剩下 97.5ms 整个容器一个线程都不调度**。请求恰好落在这段冻结窗口里，
就凭空多出近 100ms 延迟——代码没有任何问题。

## 判据：只看 cpu.stat，不看 CPU 使用率

cgroup v2（本集群 Ubuntu 26.04 / 内核 7.0.0 为 v2）：

```bash
kubectl exec -n <ns> <pod> -- cat /sys/fs/cgroup/cpu.stat
# cgroup v1 路径为 /sys/fs/cgroup/cpu/cpu.stat，字段名是 throttled_time(纳秒)
```

三个字段定判决：

| 字段 | 含义 | 怎么用 |
|---|---|---|
| `nr_periods` | 经历了多少个 100ms 周期 | 分母 |
| `nr_throttled` | 其中多少个周期被限流 | `nr_throttled/nr_periods` 就是限流率 |
| `throttled_usec` | 累计被冻结的时间 | `÷ nr_throttled` 得每次平均冻结多久 |

判断阈值（业界通行口径，非本仓实测）：限流率 < 5% 影响轻微，
**> 25% 表示每四个周期就有一个被冻结，尾延迟一定难看**。

比率之外一定要看 `throttled_usec / nr_throttled`。**次数少不等于没事**：
本集群实测 `consumer-next` 只有 23 次限流，却累计冻结 1591ms——
平均每次 69ms，已经接近一整个周期。**23 次就是 23 个被冻住近 70ms 的请求。**

全量扫描一遍（排障第一条命令）：

```bash
for p in $(kubectl get pods -n ecommerce -o jsonpath='{.items[*].metadata.name}'); do
  s=$(kubectl exec -n ecommerce $p -- cat /sys/fs/cgroup/cpu.stat 2>/dev/null) || continue
  echo "$p $(echo "$s" | awk '/nr_periods|nr_throttled|throttled_usec/{printf "%s=%s ", $1, $2}')"
done
```

## 实测复现：同一台机器，唯一变量是 limits

〔实测 2026-09-01，node103，4 核，内核 7.0.0，containerd 2.3.4，cgroup v2〕

对照实验：同一节点、同一镜像、同一段代码，只改 `limits.cpu`。
测的是「一个请求实际被卡住多久」（工作单元之间的 wall-clock 间隔）。

| 组 | limits.cpu | `cpu.max` | 限流率 | 停顿 > 50ms 次数 | max 停顿 |
|---|---|---|---|---|---|
| A | `200m` | `20000 100000` | **121/121 = 100%** | 121 | 81ms |
| B | `200m` + 5 线程 | `20000 100000` | **121/121 = 100%** | 84 | **393ms** |
| C | 不设 limit | `max 100000` | **0/0 = 0%** | 12（GIL 噪声） | 73ms |

三条结论：

1. **p50 完全正常也照样在挨冻。** A 组 p50=0.002ms、p999=0.018ms，
   分位数一路到 99.9% 都很漂亮，只有 max 是 81ms。**只看均值和 p99 会漏掉它。**
2. **节点 CPU 同时只有 9%。** 实测 A 组被限流期间 `kubectl top node node103` = `371m / 9%`，
   而该 Pod 用满 `201m`。节点上另外 3.6 个核是空闲的，内核就是不给——
   **墙是配额，不是容量。这正是「CPU 才 15% 却延迟飙升」的完整解释。**
3. **去掉 limit，`nr_periods` 直接归零。** C 组连周期都不再统计，
   50ms+ 停顿从 121 次掉到 12 次。同样的代码、同样的节点、同样的线程数。

并发度的影响是**尾部**而不是次数：A→B 只把线程从 1 加到 5，
限流率同为 100%，但 max 停顿从 81ms 涨到 393ms。
**过度并行不会让你更早被限流，只会让每次被冻得更久。**

## Go 服务的额外陷阱：GOMAXPROCS 下限是 2

容器里 `nproc` 返回的是**宿主机核数**，不是配额。本仓网关实测
`cpu.max=30000 100000`（0.3 核）而 `nproc=4`——运行时若照 `nproc` 开线程，
会按 4 核的并行度去烧 0.3 核的预算，正好落进上面 B 组那种「冻得更久」的形态。

本仓 Go 1.27（≥1.25），运行时**已经自带容器感知**，无需引入 `automaxprocs`
（实测服务 Pod 里 `GOMAXPROCS` 环境变量未设置，靠运行时自读 `cpu.max`）。
但实测出一个容易想当然的地方——**它有下限 2，不会降到 1 以下**：

| limits.cpu | 实测 `GOMAXPROCS` |
|---|---|
| `200m` / `300m` / `1` / `1500m` / `2` | **2** |
| `3` | 3 |
| `3500m` | 4 |

规则是 `max(2, ceil(quota))`。也就是说**本仓所有 ≤2 核的服务，
Go 运行时仍允许 2 个线程并行去烧配额**——0.3 核的网关拿 2 线程跑，
预算 30ms 最快 15ms 就能烧完，剩下 85ms 冻结。容器感知**减轻但没有消除**这个风险。

复验（`gmp.go` 读 `cpu.max` 并打印 `runtime.GOMAXPROCS(0)`）：

```bash
GOOS=linux GOARCH=arm64 go build -o /tmp/gmp /tmp/gmp.go
kubectl cp /tmp/gmp <ns>/<pod>:/tmp/gmp && kubectl exec -n <ns> <pod> -- /tmp/gmp
```

## 怎么修

按优先级，不要一上来就调 limit：

1. **先确认限流率和平均冻结时长**。`nr_throttled=0` 就换方向查，别在这条路上耗着。
2. **降并发度**，让并行线程数与配额匹配。这不减少限流次数，但显著压低尾部
   （实测 max 393ms → 81ms）。Go 服务已由运行时处理到「下限 2」，
   再往下要显式设 `GOMAXPROCS=1`，并权衡吞吐。
3. **按峰值而不是均值设 limit**。经验口径是峰值的 2~3 倍。
   延迟敏感服务把 `requests` 设到真实需要的水平，保证被调度到有余量的节点。
4. **延迟敏感且可信的服务，考虑去掉 `limits.cpu`**（只留 `requests`）。
   代价是失去硬隔离，噪声邻居风险由 `requests` 和节点余量兜底。**这是取舍不是最佳实践**，
   本仓当前多数服务设了 limit（网关 `300m`、relay 类 `250m`、业务服务 `1`），
   改之前先确认节点余量。
5. 调 kubelet `--cpu-cfs-quota-period`（如 10ms）是集群级手段，
   能把每次冻结时长压缩一个量级。**影响全集群，本仓未采用**，别为单个服务动它。

## 本仓当前的观测缺口

〔实测 2026-09-01〕集群有可观测栈，但**没有任何组件采集容器级 cgroup 指标**：
`VMAgent` 集群内未部署，`opentelemetry` ns 的 otel-node DaemonSet 只配了
`hostmetrics` receiver（**无 `kubeletstats`、无 cAdvisor**）。这意味着：

- `container_cpu_cfs_throttled_periods_total` / `container_cpu_cfs_periods_total`
  这两个标准指标**当前取不到**，本页的排查只能靠 `kubectl exec` 手工读 `cpu.stat`。
- 更糟的是，现有采集**恰好只覆盖了会骗人的那个信号**：hostmetrics 采的
  `system.cpu.utilization` 是**节点级** CPU——正是上面实测中显示 9%、
  让人误判「CPU 够用」的那个数。
- 结论：这类故障**在本仓当前测不出来**。它不改变 CPU 曲线，只推高尾延迟，
  没有对应指标就只能等人肉复现。补采方式是给 otel-node 加 `kubeletstats` receiver
  或部署 VMAgent 抓 kubelet/cAdvisor 端点（待办已登记在
  [`docs/todo/统一可观测性体系.md`](../../docs/todo/统一可观测性体系.md) P2）。

补观测时的取值口径见 [`alerting-signal-hygiene.md`](alerting-signal-hygiene.md)：
**告警要探「限流率 + 平均冻结时长」两个量，不要只探 CPU 使用率**——
本页整篇讲的就是后者在这个故障上是反向指标。

**排查捷径**

- 「CPU 不高但延迟高」时，**先读 `cpu.stat` 再想别的**。它是一条命令、只读、零风险，
  且能一票否决或一票坐实，证据价值远高于继续看火焰图。
- **看 `throttled_usec/nr_throttled`，不要只看次数。** 少量限流配上接近整周期的冻结时长，
  照样能把 p99 打穿。
- **判断限流用绝对值，不要和「CPU 使用率百分比」互相印证**——
  被限流时 CPU 使用率必然是低的，两者互相印证只会把你带偏。
- 容器里 `nproc`、`/proc/cpuinfo`、`runtime.NumCPU()` 返回的都是**宿主机核数**。
  要判断「我到底有多少 CPU」，只有 `cpu.max` 一个真相源。

**相关**

- 告警取值口径：[`alerting-signal-hygiene.md`](alerting-signal-hygiene.md)
- 节点容量与运行时观测值的写法：[`live-facts.md`](live-facts.md)
- 可观测性指标基线：[`../../docs/observability/OBSERVABILITY.md`](../../docs/observability/OBSERVABILITY.md)

**外部出处**

- [Unthrottled: Fixing CPU Limits in the Cloud](https://engineering.indeedblog.com/blog/2019/12/unthrottled-fixing-cpu-limits-in-the-cloud) — Indeed 定位到内核 commit `512ac999d275` 引入的过度限流，以及 5ms per-cpu slice 机制
- [sched/fair: 移除 cpu-local slice 过期（LWN）](https://lwn.net/Articles/792268/) — Dave Chiluk 的修复补丁
- [Control Group v2 — cpu.stat 字段定义](https://docs.kernel.org/admin-guide/cgroup-v2.html) — 内核官方文档
- [uber-go/automaxprocs](https://github.com/uber-go/automaxprocs) — GOMAXPROCS 与配额不匹配时的 P99 实测数据（Go < 1.25 才需要）
