# AGENTS.md — AI 协作入口

> 本文件是所有 AI 编码工具（Claude Code / Codex CLI / Cursor / Gemini CLI …）的**共同行为基线**。
> 规范本体在 `context/`，本文件只做索引和硬规则。改规范请改 `context/`，不要改这里的副本。

## 硬规则（不可跳过）

1. **规范与拓扑以真相源为准**：规范的真相源是 `context/`（入口 `context/INDEX.md`），服务拓扑的真相源是 `.service-matrix.yaml`。现搜、推测或记忆与它们冲突时，以真相源为准；找不到对应知识 ≠ 没有约束，先读 `docs/design/`（入口 docs/design/README.md）/ `TODO.md`，读完把结论沉淀回 `context/`（见 self-refinement）。
2. **写/改 proto 前必须先读设计文档**，并为每个字段推断出校验约束。见 `context/team/proto-design.md`。
3. **提交前先更新 `TODO.md`**，再 `git commit`。提交信息走 Conventional Commits
   `<type>(<scope>): [:emoji:] <subject>`，由 `frontend/.vite-hooks/commit-msg` +
   `frontend/commitlint.config.mjs` 强制校验：type 限十一类，emoji 可选但必须与 type 相符，
   subject 末尾不加标点。钩子由 vite-plus 安装（`core.hooksPath` 指向
   `frontend/.vite-hooks/_`），是仓库级设置，后端 Go 的提交同样受管。
   见 `context/team/git-commit.md`。
4. **不要把凭据写进仓库**。密码/密钥只存在 Config Center 和本地环境（K8s 里经 Secret 挂载），仓库里只写主机名和端口。Config Center 现由同级仓 **control-tower** 的 config 服务承载。Consul KV 已退役不再存配置，Consul 只做注册发现（见 `context/project/ecommerce/config/experience/consul-kv-retired.md`）。
5. **踩到坑要沉淀**：判断是「模式性教训」还是「一次性 diff」，前者写进 `context/`。见 `context/harness-framework/self-refinement.md`。
   改动 harness 本身（本文件的硬规则、门禁脚本、structcheck 检查项、CI 门禁）时，
   还要在 `context/harness-framework/evolution-log.md` 追加一条，**必须写清触发它的具体事故**——
   规则可以从代码读出来，理由不能，没有理由的规则半年后会被人凭直觉改回去。
6. **不可逆动作需要用户授权——但授权一旦给出就直接执行，不要二次确认**。这条规则有两半，缺任何一半都是错的：只拦不放会让工具变得没法用，只放不拦会误伤线上。
   - **哪些算不可逆动作**：`git commit`、`git push`、分支/MR 合入、deploy（`kubectl apply/delete`、`helm` 装卸）、发布制品（`docker push`）、workspace 之外的写入与删除。
   - **什么算授权 → 算了就动手**：用户这轮明确要求做这件事（「提交」「推上去」「部署到 dev」「跑 make deploy」「执行它」），或明确放宽了后续同类动作（「以后不用问」「直接提交」）。**此时直接做**，不要复述一遍风险再问「确认吗」——重复确认既拖慢工作，也让用户下次懒得看提示，反而削弱真正该拦的那次。做完如实报结果。
   - **什么不算授权**：「帮我实现 X」「修好这个 bug」「看看能不能跑通」不构成上述任何一项的授权；授权也**不跨范围升级**——授权 apply 到 dev ≠ 授权 apply 到 prod，授权 commit ≠ 授权 push。
   - **仍需先说明再做的例外**：用户没要求、且会丢数据或影响线上的动作（删 PV/namespace、`git push --force`、改 prod 的鉴权与网络策略、轮换/撤销凭据）。说清影响，拿到确认再做——**这类才值得打断用户**。
   - subagent 永久不得执行其中任何一项：它拿不到用户的授权上下文，无法判断授权是否已给出。
7. **全自动模式不询问权限，但仍询问实质性选择**：当环境或会话明确标记为 `Full Auto` /「全自动」时，不用权限确认打断用户，直接使用当前已提供的能力和审批机制继续执行。
   - 若动作仍被硬性安全边界或不可用能力阻止，不得绕过，也不得把权限请求伪装成业务选择；直接报告阻塞。
   - 当存在多个会实质改变结果、且都合理的互斥选项，需要用户判断时，仍使用可用的交互式选择对话框；这条只适用于决策，不适用于权限确认。

## 执行策略：E3（先估计 → 最小执行 → 失败才扩张）

动手前先花一步估计任务规模并明确说出来，最多一次廉价探测（查一次 `.service-matrix.yaml` 或一条 grep）：

- **L1** 单文件局部修改 · **L2** 少数文件跨文件修改 · **L3** 仓库级重构（警惕 re-export/别名/网关接线/Config Center 键这类 grep 看不到的间接引用点）
- 按估计走最小路径：只读预计要改的文件，不为局部修改通读代码库；改完立即跑下面锚点里**最便宜的适用验证**
- 只有验证变红才扩大范围，一次扩一级（再 grep → 追依赖 → 读下一个最相关文件），复用已有发现，不推倒重来
- 措辞听起来局部但探测命中多处时，主动降置信、按高一级处理
- 规模驱动开销：L1/L2 不开 plan mode、不派子代理、低 reasoning effort；L3 才值得 plan mode / Explore 子代理 / 高 effort
- 正确性和可靠性是硬约束：便宜失败不算效率；没有可信验证器或风险较高时，初始估计保守一级
- E3 **不豁免**硬规则：runbook §0.1 的必读路由、proto 前读设计文档属于最小路径的一部分；也**不要**反向加码写「先通读代码库 / be thorough」——实测这类指令又慢又更容易失败

出处（arXiv:2607.13034）、路由表与护栏 hook 的验证方法见 [context/harness-framework/e3-execution.md](context/harness-framework/e3-execution.md)。

## 命令与验收锚点（可执行）

> **[context/team/runbook.md](context/team/runbook.md)** 是可执行入口:§0.1 是**按改动类型的
> 必读路由**（动 Redis / 定时任务 / proto / 指标告警 / CI-CD 前各该先读哪份），
> 其余是前端、双审、提交流程。以下是提交前必跑的锚点：

```bash
scripts/verify-quick.sh                              # 默认入口:后端链+前端并行,绿只打一行、红只打失败段
cd backend && go build ./... && go vet ./...        # ↑ 的分解动作:后端编译 + 静态检查(rc=0)
cd backend && go test -count=1 ./structcheck/...     # 改 .service-matrix.yaml/加删服务后必跑
cd backend && go test -short ./...                   # 后端测试(CI 用 -short)
cd frontend && pnpm ready                            # 前端 lint+fmt+类型+test
scripts/verify-context.sh                            # 改 context//docs/design/README/STACK 或本文件后必跑:链接/INDEX/格式/预算门禁
scripts/verify-context-canary.sh                     # 改 ↑ 门禁脚本本身后必跑:注错断言门禁还会红(CI 每 push 也跑)
```

`verify-context.sh` 是 **main 上唯一必需的 CI 检查**（GitHub `context-gate` + GitLab 同名 job）。
原本还有一道 `verify-freeze.sh`,已于 2026-08-24 连同整套 `.freeze/` 机制删除——
它建起来后从未放进过一组真实冻结集,恒返回 rc=0,是一道假门禁。理由见 evolution-log。

放行以「命令真绿」为准,不以模型自报为准。核心改动 push 前跑 `/adversarial-review` 做异构双审。

## 知识索引

| 层 | 路径 | 范围 |
|---|---|---|
| 团队级 | `context/team/` | 所有工作都要遵循（最稳定） |
| 框架工程级 | `context/harness-framework/` | AI 协作机制本身（中频更新） |
| 服务级 | `context/project/ecommerce/{module}/` | 特定模块（高频演进、量最大） |

完整导航见 **[context/INDEX.md](context/INDEX.md)**；可执行命令汇总见 **[context/team/runbook.md](context/team/runbook.md)**。

**查服务拓扑不要现搜**：服务注册名、网关前缀、依赖关系、外部依赖、Config Center 键，
一律查 **[.service-matrix.yaml](.service-matrix.yaml)**。里面区分了 `depends_on`（已接线）
和 `depends_on_planned`（设计要求但未接线），不要把后者当成已实现。

## 反直觉约定（读代码不易发现的）

> 技术栈、目录结构、服务拓扑不在这里复述——读代码与 `.service-matrix.yaml` 自明。

- 工程化：前端用 vite-plus（`vp`）一个包覆盖 dev/build/test/lint/fmt/任务运行/git 钩子，没有 husky/biome/eslint/prettier；commitlint 也由 frontend workspace 承载（2026-08-26 自仓库根迁入，根目录不再有 Node workspace）
- 进度真相源：`TODO.md`（**唯一**——`docs/PROGRESS.md` 及双文档纪律已于 2026-08-13 废止，见 `context/harness-framework/evolution-log.md`）；架构真相源：`docs/design/`（按微服务分目录，入口 `docs/design/README.md`）。**网关与配置面的设计不在本仓**——在同级仓 `../control-tower/docs/design/`
- **往文档写集群数字前先读 [context/team/live-facts.md](context/team/live-facts.md)**：运行时观测值（Pod 分布/就绪计数/镜像 tag）必须带「实测 YYYY-MM-DD」，否则 `[LIVE-FACT]` 门禁红；且**集群异常时不要采数**，故障态会被固化成「现状」
- **网关和配置中心都不在本仓**：2026-08-23 起由同级仓 **control-tower**（`services/gateway` + `services/config`）承载，两个服务均已切流上线。集群里 `config-center` 这个 ns/Deployment 名只是没改的遗留标签，跑的镜像是 `control-tower-config`。本仓的旧 `gateway/` 目录已于 2026-08-24 删除（历史在 tag `backup/pre-control-tower-20260823`）；`backend/structcheck` 直接 import `github.com/lens077/control-tower/routes` 核对路由，**改路由模板必须同 PR 升级本仓对 control-tower 的依赖版本**
- **CI 仅由发布 tag 触发**（裸 semver `X.Y.Z`，`X`=破坏性/大版本；push main 不构建，2026-08-20 起）。需要 CI 验证或部署时**打 tag 并推到 `github` 远端**（origin 是 GitLab 无 Actions），版本随迭代递增；语义、手顺与四条纪律见 [context/team/git-commit.md](context/team/git-commit.md)「发布 tag 与 CI 触发」
- **GitOps 当前是断的**（2026-08-24 实测）：ArgoCD 零 Application、零 ApplicationSet，AppProject 只有 `default`，且其自身多数组件曾 0/1——集群实际由 `backend/services/*/deploy/` 的手工路径驱动，`helm/values.yaml` **不是**集群真相源（集群 tag 有 5 种风格并存，**无一个 `:dev`**）。由此，内环开发（`okteto up`）那条「必须先 `scripts/argocd-devwindow.sh off`、完事 `on`」**当前不适用**（该脚本已改为诚实空转）。接回 GitOps 前先读 `argocd-app.yml` 顶部告警：chart 与实况在资源名/标签/tag 三处不符，直接开 selfHeal 会起一整套影子服务并经 Consul 抢走网关流量。判定与 manifest 检查清单见 [context/team/okteto-inner-loop.md](context/team/okteto-inner-loop.md)，操作手册见 [docs/OKTETO.md](docs/OKTETO.md)

## 中文文案约定

写中文文档、界面文案和注释时走 `tech-doc-style-chinese` skill。该 skill **保持上游默认，不做本地改动**；本节只声明本项目要固化的两条：

- **中文引号用直角引号 `「」`**——与 skill 默认一致。
- **允许第二人称「你」**——skill 默认不直接称呼读者，本项目覆盖这条。文档读者是你自己和协作的 agent，直接说「你」比「开发者」「实施人员」更省事。skill 原文已写明第二人称「属于风格选择；项目约定可以覆盖默认规则」，这是它设计好的用法。

## Agent skills

> 配置全部在 `docs/agents/`，改配置改那里，不要改这里的索引。
> **本项目用到哪些 skill、装没装**见 [docs/agents/skills.md](docs/agents/skills.md)
> （2026-08-24 取代原 `skills/README.md`，消除两个 skills 位置）。
> 以下三份供 mattpocock 系列工程 skill（`/to-tickets` `/triage` `/to-spec` `/wayfinder`
> `/domain-modeling` 等）读取。

### Issue tracker

本地 markdown：issue 与 spec 存放在 `.scratch/<feature-slug>/`，入库，不走 GitHub/GitLab。
见 [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)。

### Triage labels

沿用五个标准角色（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` /
`wontfix`），由 issue 文件里的 `Status:` 行承载。
见 [docs/agents/triage-labels.md](docs/agents/triage-labels.md)。

### Domain docs

multi-context，但**不新建 `CONTEXT-MAP.md` / `CONTEXT.md` / `docs/adr/`**——直接复用既有的
`context/` 三层知识库与 `.service-matrix.yaml`。
见 [docs/agents/domain.md](docs/agents/domain.md)。
