# context/ — 知识库索引

三层知识体系。AI 按 **团队 → 框架 → 项目 → 模块** 的路径逐层缩小范围，不需要遍历全仓。
每一层都有 `INDEX.md` 作为入口。

```
context/
├── team/                       团队级（最稳定）—— 所有工作必须遵循
├── harness-framework/          框架工程级（中频）—— AI 协作机制本身
├── decisions/                  决策记录 —— 每个决策一个文件：现在是什么、打败了谁、付出了什么
└── project/ecommerce/          服务级（高频、量最大）—— 各模块的架构与踩坑
```

## 四层分别是什么、何时进哪层

> **逐篇清单只维护在各层自己的 `INDEX.md` 里**（2026-09-16 起，与 project 层原有做法一致）。
> 本文件是路由，不是目录：它回答「该进哪一层」，进层之后由那层的 INDEX 回答「读哪一篇」。
> 之前根与层各维护一份清单，两份措辞已经分叉，且 `host-watchdog.md`、`live-facts.md`、
> `sgh-implementation-plan.md` 三份只在层 INDEX 里有、在这里是隐形的。

| 层 | 入口 | 什么时候进来 | 这一层的 INDEX 额外回答什么 |
|---|---|---|---|
| 团队级 | [team/INDEX.md](team/INDEX.md) | 动代码前查约束：Redis / 定时任务 / proto / 迁移 / 测试 / 部署 / TLS / 告警 / 本地环境 | 每条约束**违反后会怎样**（三列表） |
| 框架工程级 | [harness-framework/INDEX.md](harness-framework/INDEX.md) | 改 AI 协作机制本身：知识分层、E3、子代理、交接格式、演进日志 | 每份文档**约束什么** |
| 决策记录 | [decisions/INDEX.md](decisions/INDEX.md) | 改硬规则 / 门禁 / CI 职责 / 真相源归属之前 | 现行决策、**打败了谁**、付出了什么 |
| 服务级 | [project/ecommerce/INDEX.md](project/ecommerce/INDEX.md) | 查某个模块的架构与踩坑 | 按模块分目录，`experience/` 一坑一文件 |

**最常用的两个入口**（其余一律走上表，不在这里列第二份清单）：

- [team/runbook.md](team/runbook.md) —— 可执行入口，§0.1 是按改动类型的必读路由，§1–§6 是提交前必跑的锚点。
- [harness-framework/evolution-log.md](harness-framework/evolution-log.md) —— 演进日志索引，改硬规则 / 门禁前先扫它。

## 决策记录 · [context/decisions/](decisions/INDEX.md)

一个决策一个文件，**路径即状态**（`proposed/` `implemented/` `rejected/`），`implemented/` 随交付事实同步改写，
每条必须写「考虑过的替代方案」。与 [evolution-log.md](harness-framework/evolution-log.md) 分工：日志按日期追加记
**事故与验证**，这里记**决策与替代方案**。逐条清单只维护在 [decisions/INDEX.md](decisions/INDEX.md) 一处。
改硬规则 / 门禁 / CI 职责 / 真相源归属之前，先读对应决策；没有就先建一条。

## 服务级 · [context/project/ecommerce/](project/ecommerce/INDEX.md)

按模块分目录，每个模块下的 `experience/` 放踩坑记录。**逐篇清单只维护在
[project/ecommerce/INDEX.md](project/ecommerce/INDEX.md) 一处**（避免两层索引漂移），
目前有记录的模块：`gateway`、`registry`、`config`、`behavior`、`consumer`、`merchant`、`frontend-api`。

## 结构真相源 · [`.service-matrix.yaml`](../.service-matrix.yaml)（仓库根）

不属于「知识」而属于「事实表」的东西放这里，供 AI 与 CI 查表：10 个后端服务的
存量 Consul 注册名、网关路径前缀、依赖关系、外部依赖、Config Center 键、前端 4 个 app 的端口。服务注册发现目标按 `docs/TECH.md` 为生产 K8s Service + CoreDNS；pre 半生产测试走 Docker Compose 服务名（开发内环评估中）。

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
| [`docs/DEVOPS.md`](../docs/DEVOPS.md) | DevOps 体系设计：Three Ways/CALMS/DORA 骨架，边界对齐 DDD 限界上下文，四阶段落地与验收标准 | 动 CI/CD、GitOps、部署策略、镜像与 migration 流程前 |
| [`observability/OBSERVABILITY.md`](../docs/observability/OBSERVABILITY.md) | 可观测性方法论与指标基线：三支柱分工、RED/USE、逐服务最低指标、告警清单、6 条硬规则 | 加指标/看板/告警，或排障动线走不通时 |
| [`docs/TESTING.md`](../docs/TESTING.md) | 测试操作手册：装什么库、`pkg/testutil` 怎么写、cart 必测清单、落地计划、Makefile/CI 接线 | 写测试时（判定规则先看 [go-testing.md](team/go-testing.md)） |
| [`docs/OKTETO.md`](../docs/OKTETO.md) | 内环开发手册：ArgoCD 开发窗口、`okteto up` 工作流、manifest 逐条决定、四个已实测的坑 | 要在集群身份下改代码时（判定先看 [okteto-inner-loop.md](team/okteto-inner-loop.md)） |
| control-tower `docs/design/` | 网关与配置中心的架构、鉴权、砍掉清单、切流手顺 —— 在**同级仓** `../control-tower/`，不在本仓 | 动网关或配置面之前 |

⚠️ 以上都是**目标态**，状态是「等待实现」。当前实况以 `TODO.md` 为准，
待办明细按 `docs/TECH.md` 体系分类在 [`docs/todo/`](../docs/todo/README.md)；
可观测性的已确认缺陷见 [`统一可观测性体系.md`](../docs/todo/统一可观测性体系.md)，
原始评审报告归档在 [`docs/progress-archive/`](../docs/progress-archive/)
（2026-08-29 起 `docs/reviews/` 已并入该目录，消除两个归档位置）。

## 检索约定

- **不要全仓 grep 找规范**。先看本文件 → 进对应层的 `INDEX.md` → 再进具体文件。
- **不要全仓 grep 找服务拓扑**。查 `.service-matrix.yaml`。
- 找模块知识时路径是 `context/project/ecommerce/{module}/`，`{module}` 用**代码目录名**（`gateway` / `behavior` / `consumer`），不是服务的中文名。
- 找不到对应知识 ≠ 没有约束。先读 `docs/design/`（入口 `docs/design/README.md`）/ `TODO.md`，读完把结论沉淀回来（见 self-refinement）。
- **INDEX 行只写「管什么、何时读」，不写结论**：根 INDEX 单元格 ≤ 120 字、各层 INDEX ≤ 200 字
  （`[INDEX-LINE]`）。结论压不进去就搬进文件的 `description` 或正文——第一跳贵了，渐进式披露就失效。
- 本目录自身的结构由门禁守着：链接可达性、INDEX 覆盖（不许有孤儿文件）、INDEX 单元格长度、frontmatter、
  experience 格式、evolution-log 四要素、决策记录格式、AGENTS.md 预算、`affects:` 路径存在性、
  实现单 `done` 必带完成自检，改完跑 `scripts/verify-context.sh`
  （CI 两侧都接了：`context-gate`）。存量豁免见 `scripts/context-format-baseline.txt`（反向棘轮）。

## 与 `~/.claude` memory 的关系

`context/` 是**唯一真相源**（可 diff、可 review、可 rollback、换 AI 工具不丢）。
`~/.claude/.../memory/` 只保留一句话摘要 + 指向本目录的链接，避免两处口径漂移。
