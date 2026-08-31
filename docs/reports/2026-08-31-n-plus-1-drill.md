# N+1 单节点故障演练报告（node103 drain，2026-08-31）

> TODO 阶段 0 第 5 项的验收证据。演练方式：`kubectl drain node103 --ignore-daemonsets
> --delete-emptydir-data --timeout=240s`，观察两节点稳态 12 分钟后 `uncordon` 并受控回平。
> 全程由 node3 侧黑盒探活（`ecommerce-gatus`）独立见证。

## 结论

**「任意 1 台非控制面 Node 失联，交易面不引发级联 Pending」在当前负载下成立**；
但**搜索域不成立**（meilisearch 本地 PV 单点），且 **consul PDB 锁死导致无法完成合规排空**。
控制面节点（node101）未做拔机演练，只做纸面核算（单控制面，拔它不是演练是事故）。

## 时间线与观测（实测 2026-08-31）

| 阶段 | 观测 |
|---|---|
| 预检 | 分布 6/6/5、15/15 Ready、`ces_stale_entries=0`（按 cilium-datapath-ops.md 第二节纪律，批量驱逐前必查）、黑盒 6/6 绿 |
| drain 开始 05:38:07Z | node103 上 11 个非 DS Pod：ecommerce×5（gateway 副本 + address/cart/merchant/payment）、consul-server-0、config-center-web、coredns、nats-1、meilisearch-0 |
| +45s | **5 个 ecommerce Pod 已全部在 101/102 重建 Ready**（9/8/0）——taint 被 `nodeTaintsPolicy: Honor` 排除出 spread 计数，两节点打包合法，无业务 Pending |
| 两节点稳态 | **14/15 Ready**；内存 node101 67% / node102 38%，CPU ~10%——容量余量充足 |
| 稳态受损点 | `nats-1`、`meilisearch-0` **Pending**（openebs 本地 PV 节点亲和锁死）→ `ecommerce-search` 就绪探针 503 级联掉出（0/1）。nats 3 副本损 1 无碍；**搜索域整体不可用** |
| drain 结束 05:42:07Z | **consul-server-0 驱逐被 PDB（`maxUnavailable: 0`）连续拦截 4 分钟直至超时**——「无法完全排空任何节点」由文档假设变为实测 |
| 黑盒见证 | **全程 6/6 绿、Alertmanager 零 blackbox 告警**：shop 根 / SSR 商品页 / gateway healthz / 真实 RPC 用户可见路径零影响（gateway 双副本 + PDB 起效；商品链路不依赖 search） |
| 恢复 | uncordon 后 meilisearch-0/nats-1 约 5 分钟内回到 node103，search 回 1/1；CES 复查 0 后按序 rollout restart 回平，**零 CrashLoop**（对照 2026-08-30 未做 CES 预检时 14 Pod 崩溃） |
| 终态 | 17 Pod 分布 **6/5/6（skew=1）**，15/15 Ready，黑盒 6/6 绿 |

## 发现与去向

1. **meilisearch 本地 PV 单点**：节点故障期间搜索域整体不可用，且级联拖垮 search 服务就绪。
   → 新待办（基础设施分类 P1）。就绪探针把 search 摘出轮转本身是**正确行为**，不改。
2. **consul PDB `maxUnavailable: 0` 阻断合规排空** → 既有 PDB P1 条目的实证，不新增。
3. 单副本服务的中断窗口≈重调度耗时（秒级~40s），黑盒探针（30s 间隔 × 2 次失败阈值）
   未触发——符合预期，也说明该级别抖动不会造成告警噪音。
4. 复现命令：本报告时间线里的三条（drain/uncordon/分布查询）即全部所需。

## 与容量治理的衔接

两节点承载 17 Pod 时内存最高 67%（node101，含控制面），距离 2026-08-29 雪崩阈值尚有余量；
但该数字在**近零流量**下取得，真实容量结论仍以 k6 基线（阶段 4）为准。
requests 校准（VPA 观测窗口）完成前，本报告不外推「生产可用」。
