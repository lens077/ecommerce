# AGENTS.md — AI 协作入口

> 本文件是所有 AI 编码工具（Claude Code / Codex CLI / Cursor / Gemini CLI …）的**共同行为基线**。
> 规范本体在 `context/`，本文件只做索引和硬规则。改规范请改 `context/`，不要改这里的副本。

## 硬规则（不可跳过）

1. **规范与拓扑以真相源为准**：规范的真相源是 `context/`（入口 `context/INDEX.md`），服务拓扑的真相源是 `.service-matrix.yaml`。现搜、推测或记忆与它们冲突时，以真相源为准；找不到对应知识 ≠ 没有约束，先读 `Design.md` / `TODO.md`，读完把结论沉淀回 `context/`（见 self-refinement）。
2. **写/改 proto 前必须先读设计文档**，并为每个字段推断出校验约束。见 `context/team/proto-design.md`。
3. **提交前先更新 `TODO.md`**，再 `git commit`。提交信息走 Conventional Commits
   `<type>(<scope>): [:emoji:] <subject>`，由 `frontend/.vite-hooks/commit-msg` +
   `commitlint.config.mjs` 强制校验：type 限十一类，emoji 可选但必须与 type 相符，
   subject 末尾不加标点。钩子由 vite-plus 安装（`core.hooksPath` 指向
   `frontend/.vite-hooks/_`），是仓库级设置，后端 Go 的提交同样受管。
   见 `context/team/git-commit.md`。
4. **不要把凭据写进仓库**。密码/密钥只存在 Consul KV 和本地环境，仓库里只写主机名和端口。
5. **踩到坑要沉淀**：判断是「模式性教训」还是「一次性 diff」，前者写进 `context/`。见 `context/harness-framework/self-refinement.md`。
6. **不可逆动作只能由用户明示触发**：`git commit`、`git push`、分支/MR 合入、deploy、发布制品、workspace 之外的写入与删除。「帮我实现 X」不构成对以上任何一项的授权；subagent 永久不得执行其中任何一项。

## 命令与验收锚点（可执行）

> **[context/team/runbook.md](context/team/runbook.md)** 是可执行入口:§0.1 是**按改动类型的
> 必读路由**（动 Redis / 定时任务 / proto / 指标告警 / CI-CD 前各该先读哪份），
> 其余是冻结验收集、前端、双审、提交流程。以下是提交前必跑的锚点：

```bash
cd backend && go build ./... && go vet ./...        # 后端编译 + 静态检查(rc=0)
cd backend && go test -count=1 ./structcheck/...     # 改 .service-matrix.yaml/加删服务后必跑
cd backend && go test -short ./...                   # 后端测试(CI 用 -short)
cd frontend && pnpm ready                            # 前端 lint+fmt+类型+test
scripts/verify-freeze.sh --all                       # 冻结验收集未被动过(main 上唯一必需的 CI 检查)
```

放行以「命令真绿」为准,不以模型自报为准。核心改动 push 前跑 `/adversarial-review` 做异构双审。

## 知识索引

| 层 | 路径 | 范围 |
|---|---|---|
| 团队级 | `context/team/` | 所有工作都要遵循（最稳定） |
| 框架工程级 | `context/harness-framework/` | AI 协作机制本身（中频更新） |
| 服务级 | `context/project/ecommerce/{module}/` | 特定模块（高频演进、量最大） |

完整导航见 **[context/INDEX.md](context/INDEX.md)**；可执行命令汇总见 **[context/team/runbook.md](context/team/runbook.md)**。

**查服务拓扑不要现搜**：服务注册名、网关前缀、依赖关系、外部依赖、Consul KV 键，
一律查 **[.service-matrix.yaml](.service-matrix.yaml)**。里面区分了 `depends_on`（已接线）
和 `depends_on_planned`（设计要求但未接线），不要把后者当成已实现。

## 反直觉约定（读代码不易发现的）

> 技术栈、目录结构、服务拓扑不在这里复述——读代码与 `.service-matrix.yaml` 自明。

- 工程化：前端用 vite-plus（`vp`）一个包覆盖 dev/build/test/lint/fmt/任务运行/git 钩子，没有 husky/biome/eslint/prettier；仓库根另有一个只装 commitlint 的 `package.json`，与 `frontend/` 的 workspace 相互独立
- 进度真相源：`TODO.md`；架构真相源：`Design.md`、`CONFIG_CENTER_DESIGN.md`。两者分工见 `context/harness-framework/progress-and-todo.md`

## Agent skills

> 以下三份配置供 mattpocock 系列工程 skill（`/to-tickets` `/triage` `/to-spec` `/wayfinder`
> `/domain-modeling` 等）读取。改配置改 `docs/agents/`，不要改这里的索引。

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
