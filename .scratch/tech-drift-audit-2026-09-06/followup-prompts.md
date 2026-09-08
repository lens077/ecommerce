# 后续对话提示词（文档漂移审计 · 第二轮）

用法：每开一个新对话，把「公共前置」和一个「批次 N」正文**一起**粘贴。批次之间互不重叠，可并行开。

---

## 公共前置（每个批次都带）

你是文档漂移审计员，在 `/Users/sumery/lens077/ecommerce` 工作。任务：核对指定文档里每一条**可核验的事实声称**（版本、路径、命令、计数、日期、「已落地/未落地」状态、组件名、仓库名、端口、tag）与当前实际是否一致，全部列出。**只读**：不得修改任何仓库文件、主机文件或集群对象；唯一允许写入的是把你的结果存到 `.scratch/tech-drift-audit-2026-09-06/round2-<批次名>.md`。

**先读这三份，不要重复它们已做的工作：**
1. `.scratch/tech-drift-audit-2026-09-06/baseline.md` —— 2026-09-06 已核实的事实基线（仓库结构、go.mod、CI 触发、同级仓状态、集群快照）。两处订正：`../control-tower/routes/pre.yaml` 仍是 11 条 `discovery:///`（只有 dev 是 `direct://`）；集群健康态 Pod 分布已是 **8/0/8**（实测 2026-09-06 12:17，node102 零业务 Pod）。
2. `.scratch/tech-drift-audit-2026-09-06/REPORT.md` —— 第一轮已确认的约 200 条漂移（含 §8 主机 SSH 复核结果）。**凡 REPORT 已列的条目不要再报**；你只报（a）新发现，（b）与 REPORT 结论相矛盾的证据（要指出矛盾）。REPORT §0 的六条根因是高频漂移模式，优先按它们排查。
3. `.scratch/tech-drift-audit-2026-09-06/live-gateway-dev-routes.yaml` —— Config Center 线上 `gateway/dev/routes.yaml` 真值（含 guest 4 条、anonymous 10 条、全 direct://）。

**第一轮已审、本轮不要复审的文件**：`docs/TECH.md`、`.service-matrix.yaml`、`context/team/git-commit.md`、`context/team/host-watchdog.md` + `infrastructure/host-watchdog/`、`context/project/ecommerce/events/experience/{debezium-idle-slot-wal-retention,row-projection-vs-domain-event}.md`、`docs/design/platform/{anonymous-shopping,capacity-balancing,production-scale-goal}.md`、`docs/design/search/search.md`、`docs/frontend/{accessibility,semantic-html}.md`、`docs/observability/{alerting-notification,error-monitoring}.md`、`docs/todo/README.md`、`docs/todo/数据一致性与事件驱动.md`、`TODO.md` 第 1–245 行、`docs/SECURITY-HARDENING.md`、`docs/reports/` 中被 TECH 链接的 18 份（2026-08-28 全部、08-29 两份、08-31 的 github-pages/gitops/signoz、09-02 ci-two-remotes）。这些文件只在你需要「交叉矛盾」证据时引用。

**真相源与口径**：拓扑 `.service-matrix.yaml`；进度 `TODO.md`；架构 `docs/design/`；规范 `context/`。以**工作树**为当前状态（工作树有 50+ 个未提交改动和若干 untracked 文件，一并计入）；若某处漂移已在未提交 diff 里修正（`git diff HEAD -- <file>`），标「未提交改动已修」而不是漂移。注意本仓在 09-02 与 09-05 做过两次 `git filter-repo`，09-05 前的短 SHA 基本都不可解析——遇到就 `git log --all --grep`/`-S` 找现等价提交，别直接判「不存在」。

**可用的核对手段**（都只读）：`read/grep/glob`；`git`；`kubectl get/diff … --request-timeout=20s`（禁止 apply/delete/exec 写操作）；SSH 别名 `node1`（Pangolin VPS）、`node2`（Harbor/Silo/gorse）、`node3`（Pigsty：PG/Kafka/ES/Connect/观测栈）——用户已授权只读登录，只跑 `cat/grep/ls/stat/ss/docker ps|inspect|logs/curl 127.0.0.1/systemctl status`，不读凭据文件内容（`.env`、token、密码只看键名不看值）；`gh api/run list`；`curl -sI` 核外链（Google 域名本机被墙，改用云端抓取工具）。集群数字必须带「实测 YYYY-MM-DD」，且按 `context/team/live-facts.md`：集群异常时不要采数。

**输出格式**（每份文档一张表，写入结果文件并在对话末尾完整贴出）：

| 文件:行号 | 文档声称（摘引）| 实际情况（证据：文件:行 / 命令输出摘要）| 漂移类型 | 严重度 |

漂移类型限用：过期事实 / 目标写成现状 / 自相矛盾 / 数字漂移 / 路径失效（含 SHA、链接、锚点）/ 命名不一致 / 日期标注错误 / 转述失真。严重度：**高**=会误导架构/安全/运维决策或与真相源直接相反；**中**=状态/数字/位置错述，照做会踩空；**低**=计数/命名/锚点/体例。只列已核实的；不能核实的单列「疑似/未能核实」并写缺什么证据。最后附「与 REPORT.md 结论的矛盾」和「跨文档矛盾」两节。不写修复建议，不复述无漂移的行。

**执行建议**：文件多时按目录派子代理并行（子代理同样只读、不得执行任何不可逆动作），自己抽查每个子代理的高严重度项后再汇总。

---

## 批次 1：`context/` 全量（规范真相源）

范围（除公共前置里已审的 4 份外全部）：
- `context/INDEX.md`、`context/team/INDEX.md`、`context/harness-framework/INDEX.md`、`context/project/ecommerce/INDEX.md` 及各模块 `INDEX.md`（核：索引项是否都指向存在的文件、frontmatter description 与正文是否一致、INDEX 有没有漏收目录里的文件）。
- `context/team/`：alerting-signal-hygiene、capability-seams、cfs-quota-throttling、cilium-datapath-ops、cron-jobs、db-migrations、go-redis、go-testing、infra-duplication、live-facts、local-env、node-graceful-shutdown、okteto-inner-loop、pangolin-tunnel、proto-design、runbook、shell-scripting、tech-selection、tls-enablement（其中 cron-jobs/db-migrations/go-redis/local-env/pangolin-tunnel/tls-enablement 有未提交改动，先看 diff）。
- `context/project/ecommerce/*/experience/*.md`、`registry/consul-dual-check-runbook.md`、`frontend-api/sop/*.md`（除已审两份）。
- `context/harness-framework/*.md`（evolution-log.md 有 76 行未提交改动；重点核它记录的「触发事故」「门禁脚本」与 `scripts/verify-context*.sh`、`.github/workflows/context-gate.yml`、`.gitlab-ci.yml`、`frontend/.vite-hooks/` 是否一致）。
- `context/decisions/`（untracked 新目录）：每条 decision 的「现状」与代码/CI 是否一致；`INDEX.md` 是否收全 `implemented/` 8 份。

重点：
- `runbook.md` §0.1「按改动类型的必读路由」指向的文件是否都存在；命令锚点是否仍可执行（`scripts/verify-quick.sh` 等）。
- `live-facts.md` 里的集群数字与「实测」日期（对照 baseline/REPORT §8.1 的 8/0/8、14 Deployment）。
- `local-env.md`、`okteto-inner-loop.md`、`pangolin-tunnel.md`、`tls-enablement.md` 的主机/端口/域名/证书日期 vs `.service-matrix.yaml` 与 REPORT §8.3/§8.4（node1 `apikv-cert-renew.timer` 存在且每日运行；Redis 证书自动分发；PG 手工）。
- `cron-jobs.md`、`db-migrations.md`：是否仍把 relay/indexer/NATS/Meilisearch/CNPG 当现行；outbox 表列描述是否与 `backend/services/product/internal/data/migrations/00004_outbox.sql` 工作树一致。
- `registry/*`、`gateway/experience/*`：Consul 已于 09-03 关闭（`CONSUL_ENABLED=false`、`direct://`）后，这些 runbook/经验文的「当前做法」是否已标注过期。
- `tech-selection.md`、`capability-seams.md` 与 TECH 表 A/B 的选型是否一致（REPORT §1 列出的 TECH 漂移不要再报，只报 context 侧自己的）。
- 每份文件的内部链接、相对路径是否可达；`verify-context.sh` 是否对当前工作树报红（跑一次 `scripts/verify-context.sh`，只读）。

结果文件：`.scratch/tech-drift-audit-2026-09-06/round2-context.md`。

---

## 批次 2：`docs/design/` 其余 + `docs/GLOSSARY.md` + 根 `DESIGN.md`

范围：`docs/design/README.md`、`cart/api-decisions.md`、`inventory/inventory.md`、`merchant/{onboarding,personal-store-compliance,roadmap,store-settings}.md`、`order/{checkout,consistency,schema}.md`、`payment/payment.md`、`platform/{admin-roadmap,architecture,error-handling,gin-b2c-mall-comparison,i18n-lessons,i18n-routing,pre-environment,rbac}.md`、`product/{listing,sales,schema}.md`、`docs/GLOSSARY.md`、根目录 `DESIGN.md`（2026-08-11 起未改，重点核它是否仍被当入口以及与 docs/design 的冲突）。其中 README/inventory/merchant-roadmap/order 三份/platform-architecture/gin-b2c/product-sales/GLOSSARY 有未提交改动，先看 diff。

不要重复的工作：`.scratch/doc-code-block-inventory-2026-09-03.md`（untracked）已用机械方法清点 523 个文档代码块并标出 product/order/payment/inventory/cart 五域 DDL/proto 摘录名对不上源码——**不要重做逐块比对**；只在该清单标 ❌ 的块里抽查它今天是否仍 ❌（`docs/design/README.md` 未提交 diff 说要改用 `<!-- embed: -->` 指令 + `scripts/doc-embed.py` 重写，核这套机制是否已落地：脚本存在？哪些文档已含 embed 指令？`verify-context.sh` 的 [EMBED] 门禁是否存在并通过？）。

重点：
- 每份设计文档的「状态/现状」行（如「已落地」「迁移中」「存量 Meilisearch/NATS/relay/CNPG/Casbin」）vs 基线事实（relay/indexer/NATS 09-03 退役、Meilisearch 09-04 退役、CNPG 已删、Consul 关闭、访客轨已落地、Kafka 只承载搜索 CDC、领域事件零接线）。
- RPC 名、表名、枚举值 vs `backend/api/*/v1/*.proto` 与 `backend/services/*/internal/data/migrations/*.sql`（只核散文里的名字，代码块交给上面的清单）。
- `platform/rbac.md` vs control-tower 现役 Casbin（`../control-tower/services/gateway/internal/authz/`）与 `live-gateway-dev-routes.yaml` 的 anonymous/guest 清单；如用户提供 `gateway/policies/policies.csv` 线上值则一并核 RPC 粒度（REPORT §8.7 记录该项仍未核）。
- `platform/pre-environment.md` vs `../control-tower/deploy/pre/`（K8s 清单、`routes/pre.yaml` 仍 `discovery:///`）与 `backend/compose.yaml` 自述——TECH §10.2 说 pre = Docker Compose，REPORT 已标疑似，这里给出定论。
- `platform/i18n-routing.md` vs `frontend/apps/consumer-next/deploy/dev.yaml` 的 `/zh` `/en` HTTPRoute 与 `app/[lang]` 结构。
- `order/consistency.md`、`order/checkout.md` 中 Outbox/Inbox/DLQ/Saga 描述 vs `backend/pkg/outbox`（只剩 Insert）、order 进程内 GoEventBus、无 Inbox 表——REPORT §1 已列 TECH 侧，这里只报设计文档自身把目标写成现状的地方。
- `docs/design/README.md` 的目录表：每行状态摘要与对应文档正文是否一致；是否漏列文件。
- `GLOSSARY.md`：术语与 TECH §6、proto、sqlc models 的用词一致性（Customer/consumer 已统一，核有没有漏网）。

结果文件：`.scratch/tech-drift-audit-2026-09-06/round2-design.md`。

---

## 批次 3：`docs/todo/` 其余 7 份 + `TODO.md` 246–381 行 + `docs/progress-archive/`

范围：`docs/todo/{供应链与交付流水线,前端技术栈与工程化,基础设施与部署模型,微服务与交易闭环,文档与协作机制,服务发现与配置中心,统一可观测性体系,零信任鉴权与Session}.md`（文档与协作机制.md 有未提交改动）；`TODO.md` 第 246–381 行（阶段 0–4 推进、阶段外并行线、技术风险、归档）；`docs/progress-archive/*.md`（只核「归档」是否真的不再被当现状引用、链接是否可达，不逐条核内容）。

重点：
- **每条 `- [ ]` / `- [x]` 的状态是否与代码/集群/主机一致**——这是进度真相源，勾错比文字错更严重。第一轮已发现三条僵尸 P0（TODO.md:61/63/64）和一条已完成未销的待办（:115 pnpm），说明分类文件里很可能还有同类；对每份文件至少抽 10 条「未完成」验证是否其实已完成，抽 5 条「已完成」验证是否真完成。
- `TODO.md` 分类索引计数（154 / P0 18）与各分类文件 `grep -c '^- \[ \]'` 是否一致（工作树）。
- 阶段 0–4 里引用的报告/experience/脚本路径是否存在；引用的短 SHA 是否可解析（filter-repo 影响）。
- `基础设施与部署模型.md`、`统一可观测性体系.md`、`零信任鉴权与Session.md`、`服务发现与配置中心.md` 与 REPORT §8 的主机/集群复核结果对照：VPA 2 个 InPlace、8/0/8、`PostgresReplicationLag` 慢性 firing、Gatus 内置 ntfy provider、pgbouncer 被绕过、Silo 无 Versioning、`lsn.flush.mode` 丢失、Consul 关闭、访客轨已落地——分类文件里对应待办的状态是否随之过期。
- `供应链与交付流水线.md` vs `.github/workflows/*.yml`（supply-chain-pr 仅 tag 触发；service-ci 含 Trivy image 门禁；Kyverno 2 条 Audit 策略无 verifyImages）。
- `前端技术栈与工程化.md` vs `frontend/`（pnpm 12.3.4、Vite+ 0.3.0、Oxlint 1.79、React Compiler 默认关、zustand 2 个 store、无 @sentry、a11y 三 app、consumer-next 1 页）。

结果文件：`.scratch/tech-drift-audit-2026-09-06/round2-todo.md`。

---

## 批次 4：根目录与 docs 顶层 + 未链接报告

范围：`README.md`、`STACK.md`（46KB，版本表最多，重点）、`PRODUCT.md`、`AGENTS.md`（只核其中的事实声称：命令锚点是否可执行、路径是否存在、「反直觉约定」段的日期/状态；不评规则本身）、`docs/TECH-RADAR.md`（有未提交改动）、`docs/INFRASTRUCTURE-OPERATIONS.md`、`docs/OKTETO.md`、`docs/TESTING.md`、`docs/SCAFFOLD.md`、`docs/DEVOPS.md`、`docs/PRIVACY.md`、`docs/MERCHANT_AGREEMENT.md`（只核链接与版本号）、`docs/observability/{OBSERVABILITY,面板设计}.md`、`docs/agents/{domain,issue-tracker,skills,triage-labels}.md`、`THIRD_PARTY_NOTICES.md`（只核生成脚本与 go.mod/pnpm-lock 是否同步：`scripts/gen-third-party-notices.sh`）；未被 TECH 链接的报告：`docs/reports/2026-08-27-infrastructure-audit.md`、`2026-08-28-zero-trust-runtime-security.md`、`2026-08-31-n-plus-1-drill.md`、`2026-09-01-qq-bot-evaluation.md`、`2026-09-03-consul-register-once-recurrence.md`、`2026-09-06-node3-reboot-drill.md`（后三份只核「现状/下一步」是否已变）。README/STACK/PRODUCT/AGENTS/TECH-RADAR/OBSERVABILITY.md 有未提交改动，先看 diff。

重点：
- `STACK.md` 每个版本号 vs `backend/go.mod`、`frontend/pnpm-workspace.yaml`/`pnpm-lock.yaml`、集群镜像 tag、node3 容器版本（REPORT §8 已有：ES 9.4.5、Kafka 4.3.1、Connect 4.3.0、Debezium 3.6.1、Bugsink 2.5.0、VM v1.149.0、Traefik 3.7.12、Silo 2026-08-06、Harbor 2.15.2、gatus 5.36.0、KEDA 2.20.2、Cilium 1.20.1、OpenFGA 1.18.3、Tetragon 1.7.1、ArgoCD 3.5.1、Kyverno 1.18.2、Rollouts 1.9.1、VPA 1.7.1）。
- `STACK.md`「已知差距」「路线」段与 REPORT §1 六条根因的同类问题（例：:212 Consul「仍在热路径」已在 REPORT 列出，不再报；找其余）。
- `README.md` 的快速开始命令是否仍可执行（`backend/compose.yaml`、`make` 目标、Config Center 键名）；「ESO + Vault」vs 集群同时存在 `vault` 与 `openbao` 两条 ClusterSecretStore。
- `docs/INFRASTRUCTURE-OPERATIONS.md` 的主机操作段 vs REPORT §8.3/8.4 实测（证书分发脚本 `/usr/local/sbin/apikv-cert-distribute`、Redis 自动 restart、PG 手工、Bugsink 8010、`docker-port-guard` 计数、fail2ban jail 清单、Harbor 零拉取）。
- `docs/OKTETO.md` vs `backend/okteto.yaml`、`scripts/argocd-devwindow.sh`（已改空转）、Consul 关闭后的 DNS/发现假设。
- `docs/TESTING.md`、`docs/SCAFFOLD.md` 声称的测试/脚手架要求 vs 实际（无 k6/gopter；`go-connect-template-cli` 生成路径；`internal/pkg` 已迁 go-connect-kit 后 SCAFFOLD 的目录描述是否过期）。
- `docs/TECH-RADAR.md` 与 TECH 表 B 的状态是否一致（它是「触发条款」所在地；REPORT 只报了 CloudEvents「采纳」vs TECH「可选」一处）。
- `docs/agents/skills.md` 列的 skill 装没装（对照当前会话可用 skill 列表与 `.claude/`、`.codex/`、`.cursor/` 目录）。

结果文件：`.scratch/tech-drift-audit-2026-09-06/round2-toplevel.md`。

---

## 批次 5：同级仓的文档层

范围与核对对象（每个仓都是「它自己的文档 vs 它自己的代码/配置 vs 集群或 node3 实况 vs ecommerce 的 TECH/矩阵」）：
- `../control-tower`：`README.md`、`AGENTS.md`、`deploy/README.md`、`docs/design/{architecture,auth,bff-migration,config-schema,cutover,decisions,machine-token,adr-0001-token-model,adr-0002-bff-session}.md`、`docs/operations/{service-interconnect,2026-08-30-recovery-record}.md`、`e2e/README.md`。工作树有 14 个未提交改动（deploy 0.2.5→0.2.10、machine-token.md 等）。重点：文档说的鉴权模型（Casbin/legacy JWT 轨/BFF session/访客轨/OpenFGA 目标）vs `services/gateway` 代码；`deploy/{dev,pre}` vs 集群实跑（gateway 0.2.10、config 0.2.10、config-web 0.2.6）；`routes/pre.yaml` 仍 `discovery:///` 是否有文档解释；VPA 定义与 ecommerce `application-vpa.yml` 的双真相源（REPORT §1.1 L600 已列，只补它们文档怎么说）；`docs/design/decisions.md` 每条决策是否仍成立。
- `../kubernetes`：`README.md`（组件表 47 行）、`TODO.md`、`CONTRIBUTING.md`、`SECURITY.md`、`OBSERVABILITY-INTEGRATION.md`、`DEPLOY-RECORD-2026-08-20.md`、`HOSTING-READINESS-2026-09-03.md`、`RESTORE-RUNBOOK-2026-09-04.md`、`PIGSTY-HARVEST-2026-09-03.md`、`微服务架构/*.md`（3 份）、`components/*/README.md`（47 份，按「组件是否仍在集群里」分组抽核：在跑的核版本/域名/端口，不在的核有没有退役标注）。REPORT §5 已列：README:53-90 组件表过期、openfga store 指向、TODO:21 过期决策、HOSTING-READINESS/PIGSTY-HARVEST 的「PG 回 CNPG」方向冲突——不要再报这些，找其余。特别核：`OBSERVABILITY-INTEGRATION.md` vs 集群 `opentelemetry` ns 的 collector/agent ConfigMap 与 node3 三个 Victoria 端点；`微服务架构/*.md` 与 ecommerce TECH 的两条数据线定稿是否一致（`4968ba3d` 提交说已对齐）。
- `../postgres-kafka-es-streaming-pipeline`：`README.md`、`TODO.md`、`deploy/docker-node3/{README,RUNBOOK,VALIDATION}.md`（28 个未提交改动，先看 diff）。重点：文档描述的 connector 配置 vs node3 线上（`ssh node3 curl -s 127.0.0.1:8083/connectors/<name>/config`，两 connector 都拉；REPORT §8.2 已发现线上无 `lsn.flush.mode`，这里做**全量 diff**：HEAD JSON、工作树 JSON、线上三方对比）；ES 索引模板/mapping 文档 vs 线上（`curl -s 127.0.0.1:9200/_index_template/...` 需凭据则记「需凭据」）；RUNBOOK 的重建/回滚手顺引用的脚本是否存在（`rebuild-search-catalog.sh`、`verify-search-contract.sh`、`wait-sink-lag.sh` 为 untracked）；告警 12 条与 `monitoring/rules-ecommerce-cdc.yml` 及 node3 `/infra/rules/ecommerce-cdc.yml` 是否同一版本（`diff`）。
- `../go-connect-kit/README.md`：包清单/版本约束/消费方描述 vs 代码与两个消费仓的 go.mod（v0.3.0）；「删除本模块后会散回所有调用方」等声称 vs ecommerce 10 服务 `internal/pkg/*` 现状（已是薄适配层）。
- `../pigsty-deploy/{README,cert-san-resign,pigsty-node3-deployment}.md`：vs node3 实况（REPORT §8.2：单实例、pgbouncer 6432 在监听但零业务连接、`ecommerce_cdc` 永久槽、Kafka 单 broker、证书 SAN/到期 11-25、`.172` 地址持久化）。

结果文件：`.scratch/tech-drift-audit-2026-09-06/round2-sibling-repos.md`。

---

## 批次 6（可选，非文档审计）：第一轮遗留的 live 验证六项

全部只读，逐项给出「声称 → 实测 → 结论」：
1. `kubectl diff -f backend/services/<svc>/deploy/dev/`（10 个服务）与 `frontend/apps/{consumer,consumer-next}/deploy/*.yaml`：清单 vs 集群逐字差异（已知 `consumer/deploy/deployment.yaml:42` 仍写 `harbor.apikv.com/ecommerce/frontend:dev`）。
2. pipeline 仓 connector/模板三方 diff（同批次 5 第三点，若批次 5 已做则跳过）。
3. `cd backend && go test -count=1 ./structcheck/...` 与 `scripts/verify-context.sh`：当前工作树（含未提交改动）门禁是否绿；红的话列出每条失败与它对应的文档/矩阵行。
4. 观测数据面：`ssh node3 curl -s '127.0.0.1:8428/api/v1/label/__name__/values'` 确认 `k8s_container_restarts` 等下划线指标存在且无点号指标；`127.0.0.1:9428` VictoriaLogs 查 24h 内是否有 ecommerce 服务日志与 Tetragon `PROCESS_EXEC` 事件；VictoriaTraces 是否有网关 trace。对照 TECH §9.3/:37 与 `docs/observability/alerting-notification.md`。
5. 公网行为：匿名 `POST https://gateway.apikv.com/search.v1.SearchService/Search` 是否命中；匿名 `GetCart` 是否返回 `Set-Cookie: __Secure-ct_guest`（生产 cookie 名）；带该 cookie 的 `CreateOrder` 是否 401。不要做加购/下单等写操作。
6. `gh run list -R lens077/ecommerce --limit 20` 与 `gh run view` 最近一次 tag（1.6.3）的 job 结论：Trivy image、Cosign、SARIF upload、deploy-consistency 是否全绿；GitLab 侧若有 `glab` 或可访问 API，核最近 5 条 pipeline 四个 job 状态。

结果文件：`.scratch/tech-drift-audit-2026-09-06/round2-live-verify.md`。
