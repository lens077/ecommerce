# GitOps 演变全景

> 日期：2026-08-31。本文复盘 GitOps 体系从六层堆栈选型（2026-08-17）到断链确认（2026-08-24 实测、08-30 复验）的完整演变：最初的问题、四次形态变化、已做、刻意未做、遗漏与重接前置。运行时数字均为带日期快照。目标态设计见 [DEVOPS.md](../DEVOPS.md)；断链的操作影响见 `AGENTS.md`「GitOps 当前是断的」条目与 [okteto-inner-loop](../../context/team/okteto-inner-loop.md)。

## 六层堆栈 × 本地落位

模型出自《Top 10 GitOps Tools for Continuous Delivery in 2026》（Medium「DevOps AI Decoded」）：成熟交付体系是分层堆栈，每层解决一个独立问题。

| 层 | 职责 | 文章推荐 | 本地落位 | 2026-08-17 | 2026-08-30 |
|---|---|---|---|---|---|
| L1 打包与源 | Git + 制品打包 | Helm + OCI registry | GitHub monorepo + in-repo umbrella chart + TCR/GHCR 双推 | ✅ | ✅ |
| L2 CI 与证明 | 构建、测试、供应链签名 | Tekton + Chains（原文认可 GitHub Actions） | GitHub Actions 矩阵模板 | 🟡 缺扫描 | 🟡 已改 tag 触发；供应链三件套后续另线落地，见 [供应链演变](2026-08-28-supply-chain-evolution-overview.md) |
| L3 密钥 | 外部 vault → k8s Secret | External Secrets Operator | 线上 Vault（VPS）+ ESO | ❌ → 当日建成 | ✅ 机制活；业务凭据主路径仍是 Config Center |
| L4 持续交付 | 集群状态调和 + 渐进式发布 | Argo CD / Flux + Rollouts | ArgoCD | 应用侧 ✅ / 平台侧 ❌ | **❌ 断链** |
| L5 晋级编排 | dev → staging → prod | Kargo | 单环境，无承载物 | ⬜ | ⬜ |
| L6 基础设施 GitOps | 云资源、集群本身 | Crossplane、Fleet | bootstrap 安装器（位于 GitOps 之下） | ⬜ 平台纳管未做 | ⬜ |

## 最初的问题与四次形态变化

最初的问题（2026-08-17）：「结合单人开发、本地虚拟机集群、内网强依赖代理的现实，需要什么样的 GitOps？」此后问题形态变了四次：

1. **选型题**：六层裁剪——两层已建成（L1/L2 变体）、两层永久跳过（Tekton、Crossplane/Fleet）、两层等触发条件（L5、渐进式发布），真缺口是 L3（公开仓明文）与 L4 平台侧（文件 vs 集群无对账）。
2. **架构题**：Sealed Secrets、SOPS+age、Vault+ESO 三方案对比，本质是「密钥真相源住哪」。拍板线上 Vault：集群反复重装期，真相源必须活在集群外。
3. **工程题**：当日完成 VPS Vault 部署（AppRole 纯出站、traefik 终结 TLS）、集群 ESO 接线、轮换传播 18 秒实证（实测 2026-08-17）；四成员审查后完成专网隔离、审计、XFF、禁 swap 四项硬化与约 730 处明文置换。
4. **流程题**（断链暴露）：工具与仓库都修好了，闭环断在「集群重装后没人把 Application 接回去」这条流程缝——不属于六层中的任何一层。

## 断链事实与重接前置

事实（查法：`kubectl -n argocd get applications.argoproj.io,appprojects.argoproj.io -A`）：

- 零 Application、零 ApplicationSet，AppProject 只剩 `default`（实测 2026-08-24，2026-08-30 复验不变）
- 集群实际由 `backend/services/*/deploy/` 手工路径驱动；`helm/values.yaml` 不是集群真相源（集群镜像 tag 6 种风格并存、无一个 `:dev`，实测 2026-08-30）

断因链：集群按计划重装 → ArgoCD 由 bootstrap 装出（纯净）→ `argocd-{proj,app,repo}.yml` 属于集群外手工 apply 的状态，不在任何自动化路径 → 无人重新 apply → 手工 deploy 运行数周，集群与 chart 漂移出资源名、标签、tag 三处不符。2026-08-17 当天的 pod 全景已显示集群无 ecommerce 命名空间——断链当时已发生，注意力在 L3，无人点破。

重接前置（与 `argocd-app.yml` 顶部告警一致）：先对账三处不符再接；直接开 selfHeal 会拉起影子服务并经 Consul 抢走网关流量。纳管姿势：先建 Application 不开 automated，拿 OutOfSync 当对账清单，核平后逐个开启。结构性修复是把「重装 → 重接线」变成 bootstrap 的一个阶段——同一次重装里，把恢复路径写进 install.sh 的 external-secrets 组件活了下来，没有对应物的 Application 断了。

## 已做（均行为验证，2026-08-17）

- L3 全链：VPS Vault（raft 单节点、专网隔离、审计、XFF、容器级禁 swap）+ ESO 组件 + ClusterSecretStore；集群重装恢复 = 重跑组件 + 注入凭据两条命令
- 密钥迁移：VPS 与集群两侧 minio root 轮换入 Vault；kubernetes/cloud-native-deploy/pipeline 三公开仓约 730 处、124 文件明文置换为占位符；kubernetes 仓历史经 filter-repo 重写（HEAD 树逐字节一致）
- 明文迁移前后各留一份 raft snapshot 异地备份

## 刻意未做（有理由）

- Tekton、Crossplane、Fleet、Weave GitOps：与单人单集群规模不匹配，永久跳过
- Kargo、Argo Rollouts：触发条件未达（环境 ≥3；无状态服务 ≥2 副本 + PDB）
- ESO chart 不钉版本：用户拍板，接受重装随上游漂移
- 本仓 20 份 `configs/{dev,pre}.yml` 的口令轮换：归 Config Center（control-tower）轨道，不混改

## 遗漏（诚实清单）

1. 最大遗漏：「重装 → 重接线」不在自动化路径，且 2026-08-17 已可见零 Application 证据而未点破——数周后成为断链
2. L2 供应链扫描当时停留在建议（后续已另线落地，见供应链演变报告）
3. Vault 侧 audit.log 无轮转、raft snapshot 未进 cron；ESO 物化 ≠ Pod 生效（reloader 未决策）
4. VPS 存活服务（casdoor、postgres、redis 等）的同族旧口令未轮换；cloud-native-deploy 与 pipeline 仓 git 历史仍含明文（HEAD 已清，重写待决策）

## 一句话结论

六层里没有一层因工具选错而失败；唯一的断裂发生在层与层之外的流程缝里。「The best GitOps implementation is the one that's actually in use」——重接 L4 时，请把恢复路径当作交付物的一部分，而不是记忆里的手工步骤。
