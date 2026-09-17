# 进度流水 · 2026-09

> `TODO.md` 只记 TODO 项与状态（AGENTS.md 硬规则 3）；**做了什么、实测数字、处置过程**记在这里。
> 本文件是**不可变历史，非并行真相源**——活跃待办一律看 [`TODO.md`](../../TODO.md)。
> 按月一个文件，新的一条追加在最下面，每条以 `YYYY-MM-DD` 开头写清「做了什么 + 实测结果」。
> 2026-09-16 之前的本月流水见 [2026-09-16 快照](2026-09-16-todo-status-snapshot.md)「一」。
> harness 自身的改动不进这里，进 [`context/harness-framework/evolution-log/`](../../context/harness-framework/evolution-log/) 当月卷。

## 2026-09-17 registry 推送吞吐实测 + Harbor 入 k8s（未完成，已回滚到 0 副本）

**TCR 限流假设证伪。** 起因是 cart 的 image job 26 分钟里 1405s 花在 `pushing layers` → TCR，
而同一份 digest 推 GHCR 只要 4.4s。先核实体积：向 GHCR 查 manifest，实际是 **18.72 MiB(amd64) +
18.04 MiB(arm64)**，不是日志里那个 71MB（那是拉 golang 构建基础镜像）。

一次性 workflow `registry-bench.yml` 跑三轮，同 runner、同随机字节、两种体积（实测 2026-09-17）：

| 目标 | 32 MiB 六次采样 (MiB/s) | 4 MiB 六次采样 (MiB/s) |
|---|---|---|
| TCR | 0.10 / 0.12 / 2.52 / 3.53 / 0.68 / 1.51 | 0.50 / 0.17 / 0.67 / 0.61 / 0.37 / 0.44 |
| GHCR | 9.93 / 10.94 / 11.42 / 11.56 | 1.98 / 2.14 / 2.14 / 2.16 |

握手基线 TCR `connect 0.19–0.35s`、GHCR `0.005–0.018s`——RTT 差 10 倍，解释不了吞吐差。
**结论：不是限流**（限流表现为稳定地板），是跨境链路的高方差 best-effort：TCR 35 倍抖动，
GHCR 方差 <5%。生产那次 1405s 折算约 0.027 MiB/s，比实测最差样本还差，属极端长尾。
第一轮 GHCR 对照臂四次全 FAIL 是 workflow 漏了 `packages: write`，已修后重跑。

遗留：TCR 与 GHCR 上留有 `bench-*` 临时 tag 待清理；`registry-bench.yml` 是一次性采集，可删。

**Harbor 装进 k8s：装起来了但没稳住，已缩到 0 副本。** 同级仓 `kubernetes` 里
`components/harbor` 早就写好（官方 chart + Gateway API），`ADDON_HARBOR=false` 的原因是
「ARM64 集群等官方 v2.16」——现集群三节点全 amd64，该阻断已不成立。按实测调优后安装：

- 放置：node3 内存 requests 只占 12% 但带 `workload=pigsty-host:NoSchedule` 污点且无 `openebs-vg`
  （那份余量是给 Pigsty 预留的）；node4 是 control-plane；只有 node5 同时满足非控制面、无污点、
  有内存有 LVM。七个组件全钉 node5（RWO + WaitForFirstConsumer 的必然要求）。
- 关 Trivy（CI 已扫，它是最大单项 512Mi requests）；registry PVC 20Gi → 10Gi（node5 VG 只剩 24GiB）。
- 修 `install.sh` 一处从未触发过的缺陷：`$HOSTNAME；` 全角分号让 `set -u` 把它当变量名，
  安装最后一步必报 unbound variable（该脚本两年没真正跑过）。
- 修根因级联：chart 给内置 PG 的探针超时是 **1s**，本集群存储延迟过不去 → kubelet 反复杀 PG →
  core 60s 连不上库 FATAL → jobservice 拿不到 `/internalconfig` panic。放宽到 10s 后 PG restarts=0。

**未完成且需要人判断**：node5 在 02:16 / 02:45 / 02:49 三次 `NodeNotReady`（Harbor 01:58 钉上去，
首次异常 18 分钟后）。四项压力条件全 False——不是资源耗尽，是 kubelet 心跳中断，而 API server
是公网地址。时间相关性强但因果机制不明，已把 Harbor 缩到 0 止血；缩容后三节点 Ready、
`ecommerce` 15 个 Pod 全健康。**恢复前必须先查清 node5 心跳为何中断**，否则再拉起来还会抖。
