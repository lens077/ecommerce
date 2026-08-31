---
name: live-facts
layer: team
description: 集群/运行时数字写进文档的规矩——按波动率分三层，运行时观测值必须写成「不变量 + 查法 + 带日期的快照」，由 verify-context.sh 的 [LIVE-FACT] 强制
---

# 集群事实的写法

## 为什么需要这条规矩

集群数字写进文档的那一刻**都是对的**，然后安静地变错。读者（和下一个 AI 会话）
无法从字面区分「这是结构事实」和「这是某一刻的快照」，于是照着过期数字做判断。

2026-08-29 一次会话里三种坏法同时出现：

| 坏法 | 实例 |
|---|---|
| **写错** | `AGENTS.md` 说「集群实跑 `:dev`」——实际 5 种 tag 并存，**没有任何一个 `:dev`** |
| **过期** | 文档记 Pod 分布 `8/4/5`，健康态其实是 `5/6/6` |
| **故障态被当稳态** | `8/4/5` 根本不是「文档过期」，是 **scheduler 崩溃期间**的快照 |

第三种最危险：审计当时抓到的 `8/4/5`、`Vector DESIRED 1`、`OpenFGA 0/2` 全是雪崩症状。
**按那个现场写文档，会把一整批故障态固化成「事实」。**

## 三层分类

按波动率决定怎么写，不是一刀切删掉。

| 层 | 特征 | 例子 | 写法 |
|---|---|---|---|
| **结构事实** | 变更是一次决策 | 三节点、arm64、K8s 1.36.4、组件装没装、控制面在 node101 | 正常写 |
| **容量约束** | 缓慢漂移，但解释了很多决策 | node101 6.4 GB、每节点 4 vCPU | 正常写，建议带日期 |
| **运行时观测** | 无人决策也在持续变 | Pod 分布、ready 计数、restart 数、镜像 tag、load average | **必须带实测日期** |

删掉第三层不是好办法：它们解释了决策（本次雪崩的根因正是「node101 只有 3.3 GB
还扛着控制面 + 47 个 Pod」），而且删了挡不住下一个 agent 重新写回。

## 写法：不变量 + 查法 + 带日期的快照

耐久的是**不变量**和**怎么验**，数字只是注解。

❌ 会烂：

```markdown
ecommerce Pod 分布 node101:5 / node102:6 / node103:6
```

✅ 不会烂：

```markdown
Pod 分布须满足 suite-wide hostname spread，`maxSkew=1`（docs/TECH.md §7.2）。
复验：kubectl get pods -n ecommerce -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' | sort | uniq -c
〔实测 2026-08-29：5/6/6〕
```

不变量永不过期；查法让任何人 5 秒复验；数字明确标成快照，读者自己会对它打折。

## 门禁怎么判

`scripts/verify-context.sh` 的 `[LIVE-FACT]`。**只认三类低歧义的观测值**，
宁可漏报不可误报——误报会让人直接关掉门禁：

| 类型 | 模式 | 排除 |
|---|---|---|
| 分布 | `5/6/6` 且同行有 `分布/skew/node10/Pod/副本` | `node101/102/103` 这类节点名列表 |
| 就绪计数 | `4/4 Running` | `1/1` —— 几乎总是「单副本健康」的通用示例 |
| 镜像 tag | `sha-xxxxxxx` | — |

**放行条件**：同行、±2 行、或最近的上级标题里出现「实测/实况/快照/观测」+ `YYYY-MM-DD`。
标题级标记能覆盖整张表，不必逐行写。

**已知假阳性（2026-08-29 实测撞到一次）**：分布模式认的是「小数字三元组 + 同行有
`分布|skew|node10|Pod|副本`」，而**「分布」二字有非集群含义**。当时写的是
「对应条目分布：…（阶段 1/2/4）」——`1/2/4` 是阶段编号、「分布」指条目去向，
却被判为 Pod 分布。**遇到这类误报改措辞，不要给数字硬加假日期**：
上例改成「迁入去向：…（阶段一、二、四）」后即放行，而且原文本来就更该这么写。

**不扫的位置**（按定义就是带日期的历史）：`docs/reports/`、`docs/progress-archive/`、
`evolution-log.md`（每条自带 `### 日期`）、
`docs/TECH-RADAR.md`（自述历史存档）、`context/**/experience/`（踩坑记录里的数字是
症状举例，不是集群观测）。

## 常用复验命令

```bash
# Pod 分布（应满足 maxSkew=1）
kubectl get pods -n ecommerce -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.spec.nodeName}{"\n"}{end}' | sort | uniq -c

# Deployment 就绪度
kubectl get deploy -n ecommerce

# 集群实跑的镜像 tag（口径是否分裂）
kubectl get deploy -n ecommerce -o jsonpath='{range .items[*]}{.spec.template.spec.containers[0].image}{"\n"}{end}' | sed 's|.*:||' | sort | uniq -c

# 节点容量与实际用量
kubectl top nodes; kubectl describe node node101 | sed -n '/Allocated resources/,/Events/p'

# 控制面健康（本次雪崩的震中）
kubectl get pods -n kube-system | grep -E 'scheduler|controller-manager|apiserver|etcd'
```

## 关键陷阱

**不要在集群异常时更新集群事实。** 先确认控制面健康
（`kube-scheduler` / `kube-controller-manager` 均 Running 且 restart 数稳定），
再采数。否则记下的是故障态。

**这条门禁只保证数字带日期，不保证数字对。** 写错（`:dev`）和故障态快照都需要真连集群
才能发现。但带上日期和查法后，发现成本从「通读全文 + 人工判断」降到「看日期 + 跑一条命令」。
