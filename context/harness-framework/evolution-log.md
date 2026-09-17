---
name: evolution-log
layer: harness-framework
description: harness 本身（硬规则/门禁/Agent 约束）每次改动的原因与触发它的具体事故，防止后人把改对的东西改回去
---

# Harness 演进日志

## 这份日志解决什么

`context/` 记录**规则是什么**，`TODO.md` 记录**做了什么与完成度**（`PROGRESS.md`
已于 2026-08-13 废止归档）。两者都不记录**「这条规则为什么是现在这个样子」**。

> 2026-09-03 起分工：本日志是**编年史**——按日期追加、永不改写，记「触发事故 + 怎么验证的」；
> 一个决策**现在是什么、打败了谁**写在 [context/decisions/](../decisions/INDEX.md)，随交付事实同步改写。
> 改硬规则/门禁时两处都写并互链；旧条目按需迁入决策层（再被质疑或改动时先建决策文件）。

缺了这一层的后果很具体：一条规则被改对之后，半年后另一个人（或另一个 AI 会话）
看到它觉得"太松了"或"太啰嗦"，凭直觉改回去，于是当初那次事故会原样重演一遍。
规则的**理由**比规则本身更难重建——规则可以从代码里读出来，理由只存在于当时的对话里。

所以：**凡是改动 harness 本身的东西，都要在当月卷追加一条。** 判据是"改的是不是约束 AI/团队
行为的机制"：

| 改了什么 | 要不要记 |
|---|---|
| `AGENTS.md` 硬规则、`context/` 里的团队约束 | ✅ 必须 |
| 门禁脚本、structcheck 检查项、基线机制、CI 门禁 | ✅ 必须 |
| 业务代码、部署清单、文档搬家 | ❌ 不记（那是 `TODO.md` 的事） |
| 一次性的调试细节 | ❌ 不记（见 [self-refinement.md](self-refinement.md)） |

## 写法

每条四要素，缺一不可——**尤其不能省「触发事故」**，那是这份日志唯一不可替代的信息：

```
### YYYY-MM-DD 一句话标题
- **改了什么**：改动前 → 改动后
- **为什么**：当时的推理
- **触发事故**：具体是什么事让我们发现旧写法不对（没有事故就别改规则）
- **怎么验证的**：用什么手段确认新写法真的生效
```

## 分卷与索引

条目按月分卷存在 [`evolution-log/`](evolution-log/)（`YYYY-MM.md`，卷内倒序）。**新条目写进当月卷的最上方**，
月份没有卷就新建（frontmatter `name:` = `YYYY-MM`，并登记进 [INDEX.md](INDEX.md)），然后跑
`scripts/evolution-log-index.py --write` 重生成下面的索引。索引**只许生成不许手写**——
`verify-context.sh` 的 `[EVOLOG]` 比对索引与卷标题，不一致即红。

改硬规则 / 门禁前先扫这份索引找相关条目，命中再读那一卷的那一条；不要整卷通读。

<!-- evolog-index:start -->

- 2026-09-16 [停用 `/adversarial-review` 名字：异构双审改为本仓 subagent 实现，新增 `[SKILL-REF]`](evolution-log/2026-09.md#2026-09-16-停用-adversarial-review-名字异构双审改为本仓-subagent-实现新增-skill-ref)
- 2026-09-16 [新增 handoff-format.md：压缩 / 交接 / 子代理回报共用一份内容契约](evolution-log/2026-09.md#2026-09-16-新增-handoff-formatmd压缩-交接-子代理回报共用一份内容契约)
- 2026-09-16 [evolution-log 按月分卷，索引由脚本生成并受门禁比对](evolution-log/2026-09.md#2026-09-16-evolution-log-按月分卷索引由脚本生成并受门禁比对)
- 2026-09-16 [INDEX 单元格限长：根 ≤120 字、各层 ≤200 字，新增 `[INDEX-LINE]`](evolution-log/2026-09.md#2026-09-16-index-单元格限长根-120-字各层-200-字新增-index-line)
- 2026-09-16 [AGENTS.md 摘掉运行态陈述、按首因/近因重排章节，预算 14000 → 13000](evolution-log/2026-09.md#2026-09-16-agentsmd-摘掉运行态陈述按首因近因重排章节预算-14000-13000)
- 2026-09-16 [TODO.md 重定义为「只记 TODO 项」：流水账与证据归档，新增 `[TODO-CLEAN]` 门禁](evolution-log/2026-09.md#2026-09-16-todomd-重定义为只记-todo-项流水账与证据归档新增-todo-clean-门禁)
- 2026-09-15 [consumer-next 反亲和由 required 降为 preferred（structcheck 门禁同步）](evolution-log/2026-09.md#2026-09-15-consumer-next-反亲和由-required-降为-preferredstructcheck-门禁同步)
- 2026-09-15 [部署环境收敛为 pre / prod（dev 层删除，门禁同步）](evolution-log/2026-09.md#2026-09-15-部署环境收敛为-pre-proddev-层删除门禁同步)
- 2026-09-15 [打 tag 前的本地拦截：verify-quick 并入晋级回归，新增 verify-release-local.sh](evolution-log/2026-09.md#2026-09-15-打-tag-前的本地拦截verify-quick-并入晋级回归新增-verify-release-localsh)
- 2026-09-12 [生产清单与原生多架构发布门禁](evolution-log/2026-09.md#2026-09-12-生产清单与原生多架构发布门禁)
- 2026-09-11 [structcheck 新增 `TestNoSideEffectsRPCsAreAllowlisted`：proto 标 `NO_SIDE_EFFECTS` 须过白名单](evolution-log/2026-09.md#2026-09-11-structcheck-新增-testnosideeffectsrpcsareallowlistedproto-标-no_side_effects-须过白名单)
- 2026-09-11 [规范↔实现反向索引 `affects:`、实现单「完成自检」、验收标准五形态](evolution-log/2026-09.md#2026-09-11-规范实现反向索引-affects实现单完成自检验收标准五形态)
- 2026-09-09 [AGENTS.md 新增「消费边界」节：消费授权与执行授权并列](evolution-log/2026-09.md#2026-09-09-agentsmd-新增消费边界节消费授权与执行授权并列)
- 2026-09-08 [重建 E3 护栏并恢复当前 DSH 历史抽取](evolution-log/2026-09.md#2026-09-08-重建-e3-护栏并恢复当前-dsh-历史抽取)
- 2026-09-08 [重装后修正本机路径并重新核验 harness 依赖](evolution-log/2026-09.md#2026-09-08-重装后修正本机路径并重新核验-harness-依赖)
- 2026-09-08 [pre-commit 钩子：vp 改用绝对路径，修 `cd frontend` 后 PATH 失效](evolution-log/2026-09.md#2026-09-08-pre-commit-钩子vp-改用绝对路径修-cd-frontend-后-path-失效)
- 2026-09-08 [doc-embed.py 拒绝未知参数](evolution-log/2026-09.md#2026-09-08-doc-embedpy-拒绝未知参数)
- 2026-09-06 [部署清单双真相源:helm/ 与裸 manifest 强制逐字段等价](evolution-log/2026-09.md#2026-09-06-部署清单双真相源helm-与裸-manifest-强制逐字段等价)
- 2026-09-06 [parity 门禁改为按环境比对;裸侧改 kustomize base+overlays](evolution-log/2026-09.md#2026-09-06-parity-门禁改为按环境比对裸侧改-kustomize-baseoverlays)
- 2026-09-05 [Vite+ 0.3 lint 单行输出重新接入基线棘轮](evolution-log/2026-09.md#2026-09-05-vite-03-lint-单行输出重新接入基线棘轮)
- 2026-09-05 [公网 IP 字面量退出仓库，运行地址改为部署时注入](evolution-log/2026-09.md#2026-09-05-公网-ip-字面量退出仓库运行地址改为部署时注入)
- 2026-09-04 [退役外部依赖不再允许回接现役服务](evolution-log/2026-09.md#2026-09-04-退役外部依赖不再允许回接现役服务)
- 2026-09-03 [基础设施门禁从「副本同构」切到「kit adapter 边界」](evolution-log/2026-09.md#2026-09-03-基础设施门禁从副本同构切到kit-adapter-边界)
- 2026-09-03 [lint 棘轮加两个采集器：Go 导出符号注释（revive-exported）与前端 hygiene（knip）](evolution-log/2026-09.md#2026-09-03-lint-棘轮加两个采集器go-导出符号注释revive-exported与前端-hygieneknip)
- 2026-09-03 [THIRD_PARTY_NOTICES.md 自动生成：依赖清单进暂存区时 pre-commit 重生成并 git add](evolution-log/2026-09.md#2026-09-03-third_party_noticesmd-自动生成依赖清单进暂存区时-pre-commit-重生成并-git-add)
- 2026-09-03 [决策理由从编年史分离为 `context/decisions/` 当前状态文档，`[DECISION]` 门禁上线](evolution-log/2026-09.md#2026-09-03-决策理由从编年史分离为-contextdecisions-当前状态文档decision-门禁上线)
- 2026-09-02 [GitLab 侧补代码门禁：backend-gate / frontend-gate，两远端 CI 职责定稿](evolution-log/2026-09.md#2026-09-02-gitlab-侧补代码门禁backend-gate-frontend-gate两远端-ci-职责定稿)
- 2026-09-02 [凭据门禁：gitleaks 接进 pre-commit / verify-quick / 两远端 CI，历史重写强推](evolution-log/2026-09.md#2026-09-02-凭据门禁gitleaks-接进-pre-commit-verify-quick-两远端-ci历史重写强推)
- 2026-09-01 [适配层「只做适配」纳入 structcheck（同构门禁的盲区）](evolution-log/2026-09.md#2026-09-01-适配层只做适配纳入-structcheck同构门禁的盲区)
- 2026-09-01 [构建版本注入纳入 structcheck（一次全量静默失效）](evolution-log/2026-09.md#2026-09-01-构建版本注入纳入-structcheck一次全量静默失效)
- 2026-09-01 [硬规则 8：解决问题优先，禁止为堆工作量写测试](evolution-log/2026-09.md#2026-09-01-硬规则-8解决问题优先禁止为堆工作量写测试)
- 2026-08-31 [死链门禁扩围至不可变档案（progress-archive/reports）](evolution-log/2026-08.md#2026-08-31-死链门禁扩围至不可变档案progress-archivereports)
- 2026-08-31 [死链门禁二次扩围：docs 全树与 TODO.md 纳入，盲区清零](evolution-log/2026-08.md#2026-08-31-死链门禁二次扩围docs-全树与-todomd-纳入盲区清零)
- 2026-08-30 [Trivy SARIF 从发布 tag 归档到 main ref](evolution-log/2026-08.md#2026-08-30-trivy-sarif-从发布-tag-归档到-main-ref)
- 2026-08-30 [看板(kaneo)整体下线，TODO.md 恢复为唯一进度载体](evolution-log/2026-08.md#2026-08-30-看板kaneo整体下线todomd-恢复为唯一进度载体)
- 2026-08-30 [`make api` 限定公开契约并固定 TS 插件入口](evolution-log/2026-08.md#2026-08-30-make-api-限定公开契约并固定-ts-插件入口)
- 2026-08-29 [提交纪律由劝诫改为可执行动作（一条已存在的规则被违反）](evolution-log/2026-08.md#2026-08-29-提交纪律由劝诫改为可执行动作一条已存在的规则被违反)
- 2026-08-29 [structcheck 加两条断言 + 签名前 Trivy 扫描](evolution-log/2026-08.md#2026-08-29-structcheck-加两条断言-签名前-trivy-扫描)
- 2026-08-29 [新增 [LIVE-FACT] 门禁：运行时观测值必须带实测日期](evolution-log/2026-08.md#2026-08-29-新增-live-fact-门禁运行时观测值必须带实测日期)
- 2026-08-29 [新增 [RETIRED] 门禁：提到退役组件必须同时说明它已退役](evolution-log/2026-08.md#2026-08-29-新增-retired-门禁提到退役组件必须同时说明它已退役)
- 2026-08-29 [新增 [PROGRESS-SRC] 门禁：复选框只许长在 TODO 体系里](evolution-log/2026-08.md#2026-08-29-新增-progress-src-门禁复选框只许长在-todo-体系里)
- 2026-08-29 [重 workflow 收敛到 tag 触发；context-gate 保持 per-push（附一次前提证伪）](evolution-log/2026-08.md#2026-08-29-重-workflow-收敛到-tag-触发context-gate-保持-per-push附一次前提证伪)
- 2026-08-29 [Bootstrap 服务边界与明文凭据纳入双门禁](evolution-log/2026-08.md#2026-08-29-bootstrap-服务边界与明文凭据纳入双门禁)
- 2026-08-29 [VPA recommendation-only 容量基线纳入 structcheck](evolution-log/2026-08.md#2026-08-29-vpa-recommendation-only-容量基线纳入-structcheck)
- 2026-08-28 [跨服务节点均衡与 Helm 缓存纳入 structcheck](evolution-log/2026-08.md#2026-08-28-跨服务节点均衡与-helm-缓存纳入-structcheck)
- 2026-08-28 [TCR Cosign 兼容性只做单服务硬失败探测](evolution-log/2026-08.md#2026-08-28-tcr-cosign-兼容性只做单服务硬失败探测)
- 2026-08-28 [GHCR keyless 签名绑定 workflow identity](evolution-log/2026-08.md#2026-08-28-ghcr-keyless-签名绑定-workflow-identity)
- 2026-08-28 [工作负载身份与 token 关闭纳入 structcheck](evolution-log/2026-08.md#2026-08-28-工作负载身份与-token-关闭纳入-structcheck)
- 2026-08-28 [tag SBOM 按多架构 index digest 分平台生成](evolution-log/2026-08.md#2026-08-28-tag-sbom-按多架构-index-digest-分平台生成)
- 2026-08-28 [PR 供应链扫描改为提交范围与存量棘轮](evolution-log/2026-08.md#2026-08-28-pr-供应链扫描改为提交范围与存量棘轮)
- 2026-08-28 [TODO 预算 canary 改为动态越界](evolution-log/2026-08.md#2026-08-28-todo-预算-canary-改为动态越界)
- 2026-08-26 [链接门禁扩围至设计文档与根双档,canary 补第 11 探针](evolution-log/2026-08.md#2026-08-26-链接门禁扩围至设计文档与根双档canary-补第-11-探针)
- 2026-08-26 [共用能力抽取:portable-harness 索引 + 蒸馏器固化 + lens077 根 symlink](evolution-log/2026-08.md#2026-08-26-共用能力抽取portable-harness-索引-蒸馏器固化-lens077-根-symlink)
- 2026-08-26 [canary 修 locale 依赖:变量紧邻全角字符必须加花括号](evolution-log/2026-08.md#2026-08-26-canary-修-locale-依赖变量紧邻全角字符必须加花括号)
- 2026-08-26 [lint-baseline 的 vp-lint 采集器适配新格式并加失聪自检](evolution-log/2026-08.md#2026-08-26-lint-baseline-的-vp-lint-采集器适配新格式并加失聪自检)
- 2026-08-26 [commitlint 整链迁入 frontend workspace,钩子改直调二进制](evolution-log/2026-08.md#2026-08-26-commitlint-整链迁入-frontend-workspace钩子改直调二进制)
- 2026-08-26 [审计新增「Session 反传」输入（对照 Kun Chen《Your AGENTS.md is a Neural Net》）](evolution-log/2026-08.md#2026-08-26-审计新增session-反传输入对照-kun-chenyour-agentsmd-is-a-neural-net)
- 2026-08-26 [门禁接上元评测 canary,方向性审计成文（对照《Agent 自进化飞轮》）](evolution-log/2026-08.md#2026-08-26-门禁接上元评测-canary方向性审计成文对照agent-自进化飞轮)
- 2026-08-24 [删除整套 Frozen Nodes 冻结验收集机制](evolution-log/2026-08.md#2026-08-24-删除整套-frozen-nodes-冻结验收集机制)
- 2026-08-24 [规则与真实环境重新对齐（control-tower 接管、GitOps 断线）](evolution-log/2026-08.md#2026-08-24-规则与真实环境重新对齐control-tower-接管gitops-断线)
- 2026-08-23 [structcheck 网关核对改 import control-tower routes 包](evolution-log/2026-08.md#2026-08-23-structcheck-网关核对改-import-control-tower-routes-包)
- 2026-08-23 [（补记）control-tower 转 public，CI 私仓凭据步骤撤除](evolution-log/2026-08.md#2026-08-23-补记control-tower-转-publicci-私仓凭据步骤撤除)
- 2026-08-21 [token 成本治理:对照腾讯《Multi-Agent 降本》复盘的六处改动](evolution-log/2026-08.md#2026-08-21-token-成本治理对照腾讯multi-agent-降本复盘的六处改动)
- 2026-08-20 [CI 触发从 push-path 改回仅 tag（并升级为版本化发布链）](evolution-log/2026-08.md#2026-08-20-ci-触发从-push-path-改回仅-tag并升级为版本化发布链)
- 2026-08-18 [lint-baseline 采集管道滤掉 go 模块下载噪音](evolution-log/2026-08.md#2026-08-18-lint-baseline-采集管道滤掉-go-模块下载噪音)
- 2026-08-18 [根外 AGENTS.md 从手工同步副本改为相对 symlink](evolution-log/2026-08.md#2026-08-18-根外-agentsmd-从手工同步副本改为相对-symlink)
- 2026-08-18 [context/ 知识库自身接上结构门禁（参照 deepseek-harness）](evolution-log/2026-08.md#2026-08-18-context-知识库自身接上结构门禁参照-deepseek-harness)
- 2026-08-13 [废止 PROGRESS.md 与双文档进度纪律](evolution-log/2026-08.md#2026-08-13-废止-progressmd-与双文档进度纪律)
- 2026-08-13 [把团队规范投影为 Cursor project rules](evolution-log/2026-08.md#2026-08-13-把团队规范投影为-cursor-project-rules)
- 2026-08-12 [将全自动权限处理与实质性选择分流到项目级 Codex 规则](evolution-log/2026-08.md#2026-08-12-将全自动权限处理与实质性选择分流到项目级-codex-规则)
- 2026-08-12 [将 E3 提升为 Codex 全局执行偏好并启用本地记忆](evolution-log/2026-08.md#2026-08-12-将-e3-提升为-codex-全局执行偏好并启用本地记忆)
- 2026-08-12 [引入 E3 执行策略（估计→最小执行→失败才扩张）与过度阅读护栏](evolution-log/2026-08.md#2026-08-12-引入-e3-执行策略估计最小执行失败才扩张与过度阅读护栏)
- 2026-08-08 [静态检查引入基线棘轮，软门禁伤疤集中显形](evolution-log/2026-08.md#2026-08-08-静态检查引入基线棘轮软门禁伤疤集中显形)
- 2026-08-08 [硬规则 #6 从「只拦」改成「拦 + 放」的对称写法](evolution-log/2026-08.md#2026-08-08-硬规则-6-从只拦改成拦-放的对称写法)
- 2026-08-08 [服务清单收敛到真相源，扇出改为收集失败](evolution-log/2026-08.md#2026-08-08-服务清单收敛到真相源扇出改为收集失败)
- 2026-08-07 [新增硬规则 #6：不可逆动作需用户明示触发](evolution-log/2026-08.md#2026-08-07-新增硬规则-6不可逆动作需用户明示触发)
- 2026-08-07 [结构性约束从文档沉降为 CI 门禁](evolution-log/2026-08.md#2026-08-07-结构性约束从文档沉降为-ci-门禁)

<!-- evolog-index:end -->
