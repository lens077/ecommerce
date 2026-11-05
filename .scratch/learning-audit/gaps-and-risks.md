# 问题与风险(gaps-and-risks)

> 对应课程第 02 章「问题和风险」交付物。分类标准按课程第 01.4 节:Confirmed Bug / Design Risk / Missing Evidence / Documentation Drift / Improvement。
> 证据层级说明:标注【本轮实证】= 本审计直接观测;标注【TODO 记载】= 来源 `TODO.md`/`SECURITY-AUDIT-*.md`,属文档证据,后续章节逐服务复核后才升级为本审计的确认结论;标注【matrix 记载】= 来源 `.service-matrix.yaml`。

## 1. Confirmed(有本轮运行证据)

| # | 问题 | 证据 | 处理方向 |
|---|---|---|---|
| C-1 | behavior 服务 readiness 持续失败 ≥4h,且新旧两个 ReplicaSet 各 1 pod 双双 0/1(滚动卡住) | runtime-evidence.md §2,2026-10-31 08:5x 快照 | 读容器日志/事件归因;结合 matrix「behavior 副本曾有 conf.proto 未定义的 log.elasticsearch 块,配置中心那份未核实」的告警线索(重启后新校验会拒绝未知键) |
| C-2 | `cdc-reconcile-es` CronJob 连续 3 批 Error 后最近一批才 Completed,失败原因未归因 | runtime-evidence.md §3 | 查 pod 日志与 CronJob 事件;核对 reconcile/ 脚本退出码 |
| C-3 | ArgoCD `ecommerce-prod` Synced 但 Degraded(2026-10-25 曾达成 Synced+Healthy) | runtime-evidence.md §2 | 与 C-1/滚动中工作负载交叉归因;确认是进行中的发布还是真退化 |

## 2. Design Risk(设计存在风险,尚未证明故障)

| # | 问题 | 依据 |
|---|---|---|
| D-1 | 服务间调用全部未接线:10 个服务 `depends_on` 均为空,order→[inventory,product,address]、payment→[order] 仅存在于 planned | 【matrix 记载】known_gaps |
| D-2 | 领域事件链零业务生产者/消费者:无 outbox producer 导入、无 consumer Inbox 表、无 DLQ topic;Kafka 仅跑 CDC topic;目标形态是 Debezium Outbox Event Router(pkg/outbox 已删、relay/NATS 已退役) | 【matrix 记载】+【TODO 记载】 |
| D-3 | 10 个业务服务无完整默认拒绝 NetworkPolicy/CiliumNetworkPolicy;「信任网关注入身份头」的边界未被网络策略全面强制 | 【matrix 记载】known_gaps |
| D-4 | 库存预占、订单持久化、地址归属、商家审批存在「已核实缺陷」(P0) | 【TODO 记载】二、领域状态表;溯源 SECURITY-AUDIT-2026-10-14/10-18 的 F-*/C-* 编号。**本轮未复核,第 06 章逐服务验证** |
| D-5 | 交易前端接线不完整,merchant/admin 未成业务闭环 | 【TODO 记载】 |

## 3. Missing Evidence(无法证明已生效)

| # | 问题 | 需要的证据 |
|---|---|---|
| M-1 | CDC 链端到端数据正确性:connector CRD READY=True ≠ task RUNNING、无 lag、无 slot 位点差 | connector task 状态、Kafka topic 巡检、sink lag、slot 位点差(matrix 记录过三类事故:slot 被删、offset 落后、connector 级 RUNNING 掩盖 task 级 FAILED) |
| M-2 | ES alias 数据与 PG 的对账、增量延迟(约 6s 是 2026-09-03 实测,未复测) | 行数对账 + 抽样比对 |
| M-3 | 镜像 digest ↔ main commit 的可追溯链 | 从 `7fe3294c` 追到 consumer-next 新 pod digest(课程第 10 章验收项) |
| M-4 | 配置中心各副本与 conf.proto 的对齐(behavior 线索尤其优先,可能与 C-1 相关) | Config Center 实读 |
| M-5 | `docker-postgres-kafka-es-streaming-pipeline` 与集群 connector 逐字段对齐 | diff 两份 connector 配置 |

## 4. Documentation Drift(文档与现状不一致)

| # | 问题 | 现状 |
|---|---|---|
| doc-1 | README 把 `cloud-native-deploy` 列为「Cloud-native infrastructure deployment」仓,但 CDC connector 清单实际在 `kubernetes` 仓 `components/kafka/cdc/`;两仓分工在 README 层未区分(README 同时也列了 4 个关联仓,可能是有意并列——需读 README 全文裁决) | 待核对 README 关联仓章节的完整表述 |
| doc-2 | 课程 HTML(test2/html.html)第 06 章服务清单与仓库现实有差:无 recommendation 服务(gorse 是外部引擎);缺 merchant、behavior 两张卡;06 章自己已要求按仓库实况修正——本文档即修正依据 | 已在 service-catalog.md §1 记录 |
| doc-3 | TODO 自述「本轮……未连接集群」,而本轮已连集群并发现 behavior 0/1、ArgoCD Degraded 等新状态;TODO 的 GitOps 行需按今日观测补记 | 建议随课程推进回写(遵守 TODO 只记缺口与状态的纪律) |

## 5. Improvement(可用但有优化空间)

| # | 提案 |
|---|---|
| I-1 | 审计交付物落位:`.scratch/learning-audit/`(本目录)。课程建议路径 `audit/` 未采用,理由:`.scratch/<slug>/` 是本仓工作文档惯例(issue-tracker 约定),且基线产物属学习过程文件,不应进入长期文档树。后续章节结论按 AGENTS.md 硬规则 5 沉淀回 `context/` |
| I-2 | `backend/api/check`、`backend/api/casdoor` 包用途不明,建议第 04 章契约审计时补文档或清理判定 |

## 6. 待验证问题清单(供第 03 章起逐条消解)

1. order/payment 的 planned 依赖设计(Reserve/核价/地址快照)与现状差距 → 第 07 章联调。
2. 库存并发与超卖不变量、订单状态机、支付回调安全 → 第 06 章 inventory/order/payment。
3. 零信任鉴权闭环:BFF 已实现,legacy bearer 仍在源码,OpenFGA/访客购物/服务端资源授权未闭环 → 【TODO 记载】第 12/13 章。
4. GitOps 拓扑:ApplicationSet 已开 automated(prune/selfHeal),「合并 main 即自动发布」与今日滚动中状态互证;okteto 接管前仍需查 ArgoCD 归属 → 第 10 章。
5. 观测存储位置「待复验」→ 第 14 章。

## Decisions

- DEC-1 本文件只做基线级登记;每项在后续章节拿到一手证据后,或升级为带回归测试的修复任务,或关闭。
- DEC-2 D-4 的「已核实缺陷」引用不改写、不外推;修复方案必须经用户确认后动代码(硬规则 6/课程 1.3)。
