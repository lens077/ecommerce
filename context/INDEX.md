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
| [runbook.md](team/runbook.md) | **可执行入口**：§0.1 按改动类型的必读路由，以及提交前必跑的验收锚点 |
| [db-migrations.md](team/db-migrations.md) | schema 变更与种子数据的唯一路径：goose + Pigsty 存量库基线接管 + sqlc 同步生成 |
| [git-commit.md](team/git-commit.md) | Conventional Commits + 提交前必须先更新 TODO.md |
| [proto-design.md](team/proto-design.md) | 写 proto 前先读设计文档，每个字段都要有 buf.validate 约束 |
| [local-env.md](team/local-env.md) | 现在往哪连：活地址表（PG/Consul/Dragonfly/Config Center/node3 观测）、配置只有 `dev` 一个环境、`*.dev.test` 解析与 TLS 信任，以及镜像代理单点等几个白排查半天的坑 |
| [node-graceful-shutdown.md](team/node-graceful-shutdown.md) | Kubernetes 节点关机/重启的 90/30 秒优雅退出、systemd inhibitor、终态 Pod 与清理边界 |
| [shell-scripting.md](team/shell-scripting.md) | macOS Bash 3.2：`set -u` 下不能无条件展开空数组 |
| [go-redis.md](team/go-redis.md) | go-redis v9：热重建客户端、cache-aside、连接池与 context、Key/TTL、Pipeline、重试、锁及 Pub/Sub 边界 |
| [cron-jobs.md](team/cron-jobs.md) | 定时任务的执行边界：进程内调度器扩副本即重复执行、Ticker 首次触发盲窗、重叠/panic/超时/时区/优雅停止、重要任务不能只靠一次回调 |
| [pangolin-tunnel.md](team/pangolin-tunnel.md) | 对外公开内网服务走 Pangolin(node1 VPS)：拓扑与凭据位置、面板 API、k8s HTTPRoute 必须走 Gateway 443(80 无路由) |
| [tls-enablement.md](team/tls-enablement.md) | 给在跑的服务补 TLS：**先判云厂商 ICP 拦截**（未备案机器上配域名证书是白做，纯 IP 通、带域名 403/reset）、健康检查硬编码 http 会静默失效、证书整卷挂载遮蔽目录、公共 CA 不签 IP 故必须走域名、换镜像后 HOME 漂移致证书静默不加载、**自签证书遇隧道换域名要补 SAN（`verify-ca` 会掩盖问题）**、验收必须有「故意错的输入」+ 不带 `-k` 的严格校验 |
| [go-testing.md](team/go-testing.md) | 测试分层判定：biz 层 mock、data 层真库（testcontainers）、Redis 用 miniredis；`-short` 是唯一开关；禁用 go-sqlmock/pgxmock |
| [okteto-inner-loop.md](team/okteto-inner-loop.md) | 内环开发 `okteto up`：什么时候用、**必须先关 ArgoCD 自动同步**、不是测试环境 |
| [tech-selection.md](team/tech-selection.md) | 「上游已死」类选型结论定稿前必查镜像谱系与社区延续分叉；查到分叉 ≠ 采用 |
| [alerting-signal-hygiene.md](team/alerting-signal-hygiene.md) | 告警的价值 = 它承载的新信息量，慢性红等于没有告警；降噪优先级「修根因 > 调 `repeat_interval` > 改阈值」；探针要探「功能有没有推进」；含给告警本身加告警的元规则 |
| [cilium-datapath-ops.md](team/cilium-datapath-ops.md) | Cilium 数据面只能实测的三条：ipcache 身份失配让写好的放行规则静默失效（控制面全绿）；CES 在 Pod 换 IP 后不跟新，批量重启会把潜伏故障引爆；`bpf-map-dynamic-size-ratio` 按节点内存百分比预分配，缩容后旧 map 被 cilium-envoy 持有成孤儿并从 Pod 指标里消失 |

## 框架工程级 · [context/harness-framework/](harness-framework/INDEX.md)

| 文件 | 一句话 |
|---|---|
| [knowledge-layering.md](harness-framework/knowledge-layering.md) | 一条知识该写进哪一层的判定规则 |
| [self-refinement.md](harness-framework/self-refinement.md) | 纠错 → 判断模式性 → 沉淀 → 下次复用的闭环 |
| [graph-engineering.md](harness-framework/graph-engineering.md) | 多闭环 AI 工作流方法论存档：锚点命令、Loop 0~4 分工；其中的冻结节点机制已于 2026-08-24 整套删除，文内留有「不要重建」的说明 |
| [delivery-efficiency.md](harness-framework/delivery-efficiency.md) | AI Coding 交付效率治理：可信状态、P50/P85 与长尾、日报证据和人机责任边界 |
| [e3-execution.md](harness-framework/e3-execution.md) | E3 执行策略：动手前估计任务规模，走最小路径，验证失败才扩张；含护栏 hook 的验证方法 |
| [subagent-dispatch.md](harness-framework/subagent-dispatch.md) | 子代理派发三条硬约定：只回结构化摘要、按角色裁剪能力、按角色分层模型 |
| [multi-agent-concurrency.md](harness-framework/multi-agent-concurrency.md) | 多 Agent 并发改同一批文件时的四条纪律：状态用文件同步、引用要点名、置信度会凭空升高、宣布完成不终止复核 |
| [cordis-evaluation.md](harness-framework/cordis-evaluation.md) | 已评估「底层改 Cordis 插件框架」：暂不采用的理由与重新评估条件 |
| [flywheel-audit.md](harness-framework/flywheel-audit.md) | 对照《Agent 自进化飞轮》的评测结论 + 方向性审计约定；门禁元评测 canary 的由来 |
| [portable-harness.md](harness-framework/portable-harness.md) | 跨项目共用能力清单与采纳步骤；lens077 根 symlink 登记处 |
| [evolution-log.md](harness-framework/evolution-log.md) | harness 每次改动的原因与触发它的事故——**改硬规则/门禁前必读**，防止把改对的东西改回去 |

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
| [`docs/DEVOPS.md`](../docs/DEVOPS.md) | DevOps 体系设计：Three Ways/CALMS/DORA 骨架，DevOps 边界对齐 DDD 限界上下文，四阶段落地路线与行为验收标准 | 动 CI/CD、GitOps、部署策略、镜像与 migration 流程前 |
| [`observability/OBSERVABILITY.md`](../docs/observability/OBSERVABILITY.md) | 可观测性方法论与指标基线：三支柱分工、RED/USE、逐服务最低指标、告警清单、6 条硬规则 | 加指标/看板/告警，或排障动线走不通时 |
| [`docs/TESTING.md`](../docs/TESTING.md) | 测试操作手册：装什么库、`pkg/testutil` 怎么写、cart 六条必测清单、六步落地计划、Makefile/CI 接线 | 写测试时（判定规则先看 [go-testing.md](team/go-testing.md)） |
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
- 本目录自身的结构由门禁守着：链接可达性、INDEX 覆盖（不许有孤儿文件）、frontmatter、
  experience 格式、evolution-log 四要素、AGENTS.md 预算，改完跑 `scripts/verify-context.sh`
  （CI 两侧都接了：`context-gate`）。存量豁免见 `scripts/context-format-baseline.txt`（反向棘轮）。

## 与 `~/.claude` memory 的关系

`context/` 是**唯一真相源**（可 diff、可 review、可 rollback、换 AI 工具不丢）。
`~/.claude/.../memory/` 只保留一句话摘要 + 指向本目录的链接，避免两处口径漂移。
