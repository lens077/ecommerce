# context/ — 知识库索引

三层知识体系。AI 按 **团队 → 框架 → 项目 → 模块** 的路径逐层缩小范围，不需要遍历全仓。
每一层都有 `INDEX.md` 作为入口。

```
context/
├── team/                       团队级（最稳定）—— 所有工作必须遵循
├── harness-framework/          框架工程级（中频）—— AI 协作机制本身
└── project/ecommerce/          服务级（高频、量最大）—— 各模块的架构与踩坑
```

## 团队级 · [context/team/](team/INDEX.md)

| 文件 | 一句话 |
|---|---|
| [git-commit.md](team/git-commit.md) | Conventional Commits + 提交前必须先更新 TODO.md |
| [proto-design.md](team/proto-design.md) | 写 proto 前先读设计文档，每个字段都要有 buf.validate 约束 |
| [local-env.md](team/local-env.md) | 本地集群地址：Consul 用 `192.168.3.112:8500`，不要用 consul.app.com |
| [shell-scripting.md](team/shell-scripting.md) | macOS Bash 3.2：`set -u` 下不能无条件展开空数组 |
| [go-redis.md](team/go-redis.md) | go-redis v9：每次用都取 `Client()`（客户端会热重建）、`redis.Nil` 不是错误、Pipeline 的错误语义、默认重试对非幂等命令的影响 |
| [cron-jobs.md](team/cron-jobs.md) | 定时任务的执行边界：进程内调度器扩副本即重复执行、Ticker 首次触发盲窗、重叠/panic/超时/时区/优雅停止、重要任务不能只靠一次回调 |
| [pangolin-tunnel.md](team/pangolin-tunnel.md) | 对外公开内网服务走 Pangolin(node3)：拓扑与凭据位置、面板 API、k8s HTTPRoute 必须走 Gateway 443（80 无路由） |
| [ssh-port-migration.md](team/ssh-port-migration.md) | Ubuntu 24.04 改 SSH 端口：sshd_config 的 Port 被 ssh.socket 忽略、ListenStream 必须显式写 v4+v6、生效值只信 `sshd -T` |

## 框架工程级 · [context/harness-framework/](harness-framework/INDEX.md)

| 文件 | 一句话 |
|---|---|
| [knowledge-layering.md](harness-framework/knowledge-layering.md) | 一条知识该写进哪一层的判定规则 |
| [self-refinement.md](harness-framework/self-refinement.md) | 纠错 → 判断模式性 → 沉淀 → 下次复用的闭环 |
| [progress-and-todo.md](harness-framework/progress-and-todo.md) | PROGRESS.md 与 TODO.md 的分工与口径,每次改动两份都要更新 |
| [graph-engineering.md](harness-framework/graph-engineering.md) | 多闭环 AI 工作流方法论存档：锚点命令、冻结节点（`.freeze/` + `scripts/freeze.sh`）、Loop 0~4 分工 |
| [evolution-log.md](harness-framework/evolution-log.md) | harness 每次改动的原因与触发它的事故——**改硬规则/门禁前必读**，防止把改对的东西改回去 |

## 服务级 · [context/project/ecommerce/](project/ecommerce/INDEX.md)

按模块分目录，每个模块下的 `experience/` 放踩坑记录。**逐篇清单只维护在
[project/ecommerce/INDEX.md](project/ecommerce/INDEX.md) 一处**（避免两层索引漂移），
目前有记录的模块：`gateway`、`registry`、`config`、`behavior`、`consumer`、`frontend-api`。

## 结构真相源 · [`.service-matrix.yaml`](../.service-matrix.yaml)（仓库根）

不属于「知识」而属于「事实表」的东西放这里，供 AI 与 CI 查表：10 个后端服务的
Consul 注册名、网关路径前缀、依赖关系、外部依赖、Config Center 键、前端 4 个 app 的端口。

判据：**AI 每次都要现搜一遍的结构性事实** → 进 matrix；**需要解释「为什么」的经验** → 进 `context/`。

⚠️ `depends_on` 是代码里真的接线了，`depends_on_planned` 是设计要求但尚未接线。别混。

matrix 与 `backend/services/`、网关实际接线的一致性,以及各服务 `internal/pkg` 基础设施
副本的同构性,由 `backend/structcheck/` 的结构性测试在 CI(`go test ./...`)里强制。
存量漂移记录在 `backend/structcheck/homogeneity_baseline.txt`,只许收敛不许新增。

## 工程体系文档 · 不在 `context/` 里的真相源

这些是**目标态设计与方法论**，按就近原则留在原位（与它们描述的产物同目录），
`context/` 只在这里登记指向，避免同一约束两处漂移。

| 文档 | 一句话 | 何时读 |
|---|---|---|
| [`docs/DEVOPS.md`](../docs/DEVOPS.md) | DevOps 体系设计：Three Ways/CALMS/DORA 骨架，DevOps 边界对齐 DDD 限界上下文，四阶段落地路线与行为验收标准 | 动 CI/CD、GitOps、部署策略、镜像与 migration 流程前 |
| [`observability/OBSERVABILITY.md`](../observability/OBSERVABILITY.md) | 可观测性方法论与指标基线：三支柱分工、RED/USE、逐服务最低指标、告警清单、6 条硬规则 | 加指标/看板/告警，或排障动线走不通时 |
| [`gateway/docs/ARCHITECTURE_EVOLUTION.md`](../gateway/docs/ARCHITECTURE_EVOLUTION.md) | 网关演进规划：Cilium 做边缘网关、自建网关转 BFF | 动网关架构方向前（**纯规划未落地**） |

⚠️ 以上都是**目标态**，状态是「等待实现」。当前实况以 `TODO.md` 为准，
可观测性的已确认缺陷见 [`docs/reviews/OBSERVABILITY_REVIEW_20260806.md`](../docs/reviews/OBSERVABILITY_REVIEW_20260806.md)。
历史评审报告归档在 [`docs/reviews/`](../docs/reviews/)。

## 检索约定

- **不要全仓 grep 找规范**。先看本文件 → 进对应层的 `INDEX.md` → 再进具体文件。
- **不要全仓 grep 找服务拓扑**。查 `.service-matrix.yaml`。
- 找模块知识时路径是 `context/project/ecommerce/{module}/`，`{module}` 用**代码目录名**（`gateway` / `behavior` / `consumer`），不是服务的中文名。
- 找不到对应知识 ≠ 没有约束。先读 `docs/design/`（入口 `docs/design/README.md`）/ `TODO.md`，读完把结论沉淀回来（见 self-refinement）。

## 与 `~/.claude` memory 的关系

`context/` 是**唯一真相源**（可 diff、可 review、可 rollback、换 AI 工具不丢）。
`~/.claude/.../memory/` 只保留一句话摘要 + 指向本目录的链接，避免两处口径漂移。
