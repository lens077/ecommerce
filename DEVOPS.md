# DevOps 体系设计(待实现)

> 创建:2026-08-07。状态:**设计定稿,等待实现**。
> 思想骨架:Patrick Debois 等《The DevOps Handbook》的 Three Ways(流动/反馈/持续学习)
> + CALMS + DORA 四指标;并吸收 Debois 2026 "AI Native Dev" 主张——
> **发现问题时优先修「产出系统」(流水线模板/守护规则/Harness),而不是逐个服务打补丁**。
> 本仓 10 个同构服务(见 `backend/structcheck`)天然适合吃到这种一处修改、全员受益的乘数效应。
>
> 与真相源的关系:实现进度以 `TODO.md` 为准;本文只描述目标态与验收标准,
> 不声称任何一项「已完成」。现状列的依据见 `TODO.md`「基础设施与工程化」表。

---

## 0. 总原则:DevOps 边界对齐 DDD 边界

- **一个限界上下文 = 一个服务 = 一条流水线实例 = 一个独立部署单元**。
  CI/CD、告警、SLO、值班归属都按限界上下文切,不按「前端组/后端组」切。
- 上下文之间的契约(ConnectRPC API / Kafka 事件)是一等公民:
  契约变更必须走流水线验证(buf breaking / schema 兼容检查),不靠口头同步。
- 流水线、埋点中间件、部署清单都**只写一份模板,参数化服务名**——
  同构性由 structcheck 强制,DevOps 资产也必须同构,否则漂移会从这里重新长出来。

## 1. 现状盘点(2026-08-07,详情以 TODO.md 为准)

| 领域 | 已有 | 主要缺口 |
|------|------|----------|
| CI | `.github/workflows/{backend,frontend}.yml`、`freeze-check.yml`(冻结验收集)、structcheck 随 `go test` 进 CI、commitlint(vite-plus 钩子)、异构双审走本地 `/adversarial-review`(非 CI) | 制品推送/清单更新链路不完整;oxlint/oxfmt 未进 CI 门禁;无契约测试、无镜像扫描/签名/SBOM |
| CD | `argocd-app.yml`/`argocd-proj.yml`、`helm/`、`deploy/{dev,prod}` 过 dry-run | GitOps 未真正接管(改镜像 tag 仍是手动);无环境晋级流程;无 migration 流水线 |
| 基础设施 | k8s 集群(注意:实际仅 node2/node3 可调度,存储钉在 node3)、Consul(发现+KV 配置中心)、`application-vpa.yml` | 集群全单副本,滚更/金丝雀语义退化;VPA `--min-replicas` 默认 2 导致静默失效;无 IaC 管集群外资源 |
| 可观测性 | OTel(部分服务)、Loki、`observability/grafana/`(看板生成脚本)、`observability/`(含 2026-08-06 评审) | 未全链路;`rpc.code` 失真已修但看板未回归;config 撞名进程指标混合;无 SLO/错误预算 |
| 安全 | 网关集中鉴权(Casdoor+Casbin)、部分 RPC 粒度策略 | 镜像/依赖/密钥扫描全缺;NetworkPolicy 缺;address 等服务越权问题在修 |
| 度量 | — | DORA 四指标无采集 |

## 2. 代码与分支(Flow 的起点)

- **Monorepo + trunk-based**:短生命周期分支,合入主干即触发流水线。
  跨服务契约变更(proto + 双端代码)必须在同一提交/同一 PR 内原子化。
- **路径触发**:CI 按 diff 路径只构建受影响的服务;`backend/services/<svc>/**`
  → 只跑该服务;`backend/pkg/**`、`api/**`、流水线模板本身 → 全量。
- **架构守护即门禁**(已有 structcheck,继续扩展):
  - 服务目录 ↔ `.service-matrix.yaml` ↔ 网关接线三方对齐(已有);
  - `internal/pkg` 同构性棘轮(已有,基线 14 文件待清零);
  - 待加:依赖方向检查(domain 不得 import data/infra;可自写 lint 或 go-arch-lint)。

## 3. CI 流水线(统一模板,参数化服务名)

每个服务的标准阶段,**流水线定义只维护一份**:

1. **静态检查**:golangci-lint(后端)、`vp lint`/oxfmt(前端,待进 CI)、structcheck、依赖方向。
2. **单元测试**:领域层测试不碰数据库/网络;`go test -race`。
3. **契约测试**(微服务体系的命门,当前全缺):
   - 同步契约:`buf breaking`(对 `api/` 的 proto 做破坏性变更拦截,基线取 main);
   - 网关接线:structcheck 已覆盖 path↔target 对齐,保留;
   - 异步事件:Kafka 事件 schema 进 `api/` 统一管理,同样吃 buf breaking;
     真正接入 schema registry 放二期。
4. **构建镜像**:多阶段构建(已有 `make docker-deployx` 多架构);
   待加:cosign 签名、syft 生成 SBOM、trivy 漏洞扫描(高危阻断)。
5. **集成测试**:testcontainers 起真实依赖(Postgres/Kafka/Consul),
   只测本服务边界,不起全链路。

**镜像仓库策略(本仓已付过学费,硬规则)**:

- 禁止 `latest` 参与部署(网关旧 `latest` 镜像启动即 FATAL 的教训);
- 保留策略不得清理生产在跑的 tag——**老 Pod 可能靠本地缓存活着,驱逐后拉不动就再也起不来**;
- 部署前对目标 digest 做 pull 预检(job 或 ArgoCD PreSync hook)。

## 4. CD:GitOps + 渐进式交付

- **ArgoCD 真正接管**:集群期望状态全进 Git,CI 构建后由流水线更新清单仓的镜像
  digest(补齐现缺的「制品推送/清单更新链路」),部署 = 合入,回滚 = revert。
  禁止 kubectl 直改生产。副产品是审计:谁改的?人还是 Agent?——与 freeze/CODEOWNERS
  防线同源,对齐 Debois「dim factory 按风险分级自治」的主张。
- **环境晋级**:`dev → prod`(现有 overlay 结构),**同一镜像 digest 一路晋级**,不重新构建。
- **渐进式交付贴合集群现实**(单副本、仅 node2/node3 可调度、存储钉 node3):
  - 无状态服务(gateway、frontend、无 PVC 后端):≥2 副本 + RollingUpdate + PDB,
    这是任何金丝雀/滚更语义成立的前提;
  - 带 PV 的负载:Recreate + 维护窗口,验证靠 dev 环境而非生产金丝雀;
  - **每项机制上线后验证真的生效**——VPA `PROVIDED=True` 不代表生效、
    `deregister_critical_service_after` 写 6s 被静默钳到 1m,这类「配置在骗人」
    已出现两次,验收标准一律是观测到的行为,不是配置表面状态。
- **数据库变更进流水线**:golang-migrate/atlas + expand-contract(只允许向后兼容:
  先加列、双写、再删),因为滚更期间新旧版本共存。sqlc 生成物与 migration 同 PR 提交。
- **远程 Docker 部署(无 k8s 的备用路径)**:`backend/compose.yaml` 已引用 TCR 镜像,
  对无 k8s 的目标机用 `docker context create <name> --docker "host=ssh://user@host"`
  + `docker --context <name> compose up -d <svc>` 直接拉起。**边界要认清:GitHub
  托管 runner 在公网,推不进 192.168.x 的 LAN 主机**——push 式部署只能从本机/
  自建 runner 做;集群内的 ArgoCD 是 pull 式不受此限,这是 CD 主路径选 GitOps
  的原因之一。

## 5. 可观测性(Feedback)

- **OTel 全链路**:前端 → 网关 → 10 服务 → Postgres/Kafka,trace context 全程透传;
  埋点中间件写在同构 `internal/pkg` 里,一份改动全员受益(`rpc.code:"unknown"` 修复
  即是先例,已同步 10 份)。
- 指标:Prometheus + Grafana,**按限界上下文组织看板**,每服务四个黄金信号。
  硬规则:标签必须能区分同名进程——config-service 撞名教训,
  **强制 `service.namespace`/`service.instance` 唯一标签,禁止按进程名过滤**。
- 日志:结构化 JSON + Loki,带 trace_id 三支柱互跳。
  硬规则:凭据/token 不得入日志(user 服务 SignIn 打 token 的教训,修复后应加 lint/审查项)。
- **SLO + 错误预算**:每上下文定义 SLO;错误预算烧完冻结该服务非修复类发布——
  把「反馈」做成硬机制。一期先给 gateway、user、order、cart 四个上柜。

## 6. 安全(左移)

- CI 内:govulncheck、npm audit/pnpm audit、trivy(镜像)、gitleaks(密钥泄漏)。
- 集群内:NetworkPolicy 按限界上下文收紧东西向;Pod Security Standards;
  镜像签名准入(cosign + policy controller,二期)。
- 网关层:认证鉴权继续集中在网关(共享组件即「铺装路」,不让 10 个服务各接一套);
  策略从整段前缀放行收敛到 RPC 粒度(order/payment/merchant/inventory 已做,其余待办)。
- 密钥:External Secrets Operator + 后端(Vault 或云 KMS),密钥不进 Git 与 Consul KV 明文。

## 7. 度量与持续学习

- **DORA 四指标自动采集**(从 Git + CI + ArgoCD 事件算,不手填):
  部署频率、变更前置时间、变更失败率、MTTR。这是向上汇报 ROI 的语言。
- 无责复盘,产出必须落成系统改进(新告警/新门禁/新 runbook),不是「下次小心」。
  本仓已有范例:commitlint 九个月失效 → 用故意写错的消息验证拦截;
  盲窗 25s → 先写红测试再修。**每次生产事故的结论转成可执行守护**(测试/告警/lint),
  让知识进流水线,不只进文档——这也正是 Debois 说的护城河:沉淀进 skill/Context/门禁里的
  业务知识。
- Agent 协作侧(本仓特色,保留并深化):AGENTS.md 硬规则、freeze 冻结验收集、
  AI 异构双审、PROGRESS/TODO 双文档纪律,统一视为 DevOps 的「持续学习」层。

## 8. 落地阶段与验收标准(待实现)

> 完成勾选前,按仓库规则先回扫代码/实测行为;每阶段完成同步 TODO.md 与 PROGRESS.md。

### 阶段 1:可重复构建(CI 收口)

- [ ] CI 模板化:一份可复用 workflow,10 服务 + 网关 + 前端参数化接入,按路径触发
      (2026-08-07 后端已落地:`service-ci.yml` 模板 + `backend.yml` 入口矩阵,
      服务清单读 `.service-matrix.yaml`;网关、前端未接入模板)
- [ ] oxlint/oxfmt、golangci-lint、`go test -race`、structcheck 全部成为必过门禁
- [ ] `buf breaking` 接入(基线 main),proto 破坏性变更拦截实测一例红
- [ ] 镜像:禁 latest、digest 引用、trivy 扫描阻断高危;保留策略成文
- [ ] 验收:任意服务单文件改动,只触发该服务流水线且 < 10 分钟出镜像

### 阶段 2:可重复交付(GitOps 收口)

- [ ] CI → 清单仓 digest 更新 → ArgoCD 同步的全链路打通(补齐现缺环节)
- [ ] dev → prod 同 digest 晋级;回滚 = revert 实测一次
- [ ] migration 工具选型落地(golang-migrate 或 atlas),expand-contract 写进 AGENTS.md
- [ ] 无状态服务 ≥2 副本 + PDB;带 PV 服务显式 Recreate;逐项实测行为而非配置状态
- [ ] 部署前镜像 pull 预检 hook
- [ ] 验收:一次完整发布与一次回滚全程零 kubectl 手操作

### 阶段 3:看得见(可观测性收口)

- [ ] OTel 前端→网关→服务→DB/Kafka 全链路,一条 trace 实测贯通
- [ ] `service.namespace`/`service.instance` 标签全量落地,config 撞名指标可区分
- [ ] 四黄金信号看板按上下文重组;`rpc.code` 修复后的看板/告警回归
- [ ] gateway/user/order/cart 四个 SLO + 错误预算规则上线
- [ ] 验收:注入一次故障(杀 Pod),从告警响起到定位到 trace ≤ 5 分钟

### 阶段 4:快而不破(反馈闭环)

- [ ] 契约测试常态化(buf breaking + 事件 schema),破坏性变更在 PR 内被拦截
- [ ] DORA 四指标自动采集与月度看板
- [ ] gitleaks/govulncheck/NetworkPolicy 落地
- [ ] 无责复盘模板 + 「事故结论 → 守护规则」转化流程成文
- [ ] 验收:连续两周 DORA 数据自动产出,无手填

---

*参考:The DevOps Handbook(Kim/Humble/Debois/Willis, 2016);DORA State of DevOps;
Debois 演讲(InfoQ 编译,2026-08):不要修 Agent 产出的代码,修产出代码的系统。*
