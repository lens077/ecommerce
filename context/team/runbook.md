---
name: runbook
layer: team
description: 给所有 AI 编码工具(尤其 Codex)的可执行命令与验收锚点汇总——改动前必读什么、提交前必跑什么、规则与限制的命令化版本
---

# Runbook — 可执行命令与验收锚点

> 本文件是**规则与限制的命令化汇总**,供 Codex / Claude Code / 任何 CLI 直接读取与执行。
> **它不是新的真相源**:规范本体在 `context/`,拓扑真相源是 `.service-matrix.yaml`,
> 进度真相源是 `TODO.md`。三者与本文件冲突时,**以真相源为准**(AGENTS.md 硬规则 #1)。
> 硬规则全文见 [AGENTS.md](../../AGENTS.md);本文件只把「该跑哪些命令」讲清楚。

---

## 0. 动手前必读(限制,不跑命令)

- **查服务拓扑不要现搜**:注册名、网关前缀、依赖、Config Center 键 → 一律查
  [`.service-matrix.yaml`](../../.service-matrix.yaml)。区分 `depends_on`(已接线)与
  `depends_on_planned`(设计要求但未接线),别把后者当已实现。
- **后端 10 个业务服务是同构副本**:`backend/services/*/internal/pkg/` 下的基础设施代码
  (otel/log/registry/config 等)一份逻辑铺 10 份,**改一处 = 改全部对应文件**,由
  structcheck 的同构检查兜底(见 §2)。整个后端只有一个 `go.mod`。
- **写/改 proto 前先读 `docs/design/` 对应服务目录**(入口 `docs/design/README.md`),为每个字段推断校验约束(见 `proto-design.md`)。
- **凭据不入库**:密码/密钥只存在 **Config Center 和本地环境**(K8s 里经 Secret 挂载),
  仓库里只写主机名和端口。**Consul KV 已退役,不再存任何配置**(AGENTS.md 硬规则 #4)。
- **不可逆动作(commit/push/合入/deploy/仓外写删)**:授权判定的全文**只写在
  [AGENTS.md](../../AGENTS.md) 硬规则 #6 一处**,本文件不再保留副本(2026-08-21 消重,
  两处并存时已出现措辞漂移风险)。一句话版:用户明确要求 = 授权,直接执行不二次确认;
  「帮我实现 X」不算授权;授权不跨范围升级;subagent 永不执行。

### 0.1 按改动类型的必读路由

> 本文件是入口,**不是内容的容器**。下面只给指针——同一条约束只写一处,复制会漂移
> (`harness-framework/knowledge-layering.md`)。**动手前先按下表跳一次**,
> 表里没有的再回 [`context/INDEX.md`](../INDEX.md) 逐层找。

| 你要动的是 | 先读 | 不读会怎样 |
|---|---|---|
| 服务拓扑/注册名/网关前缀/配置键 | [`.service-matrix.yaml`](../../.service-matrix.yaml) | 现搜猜错,把 `depends_on_planned` 当已接线 |
| proto / API 契约 | [proto-design.md](proto-design.md) | 字段裸奔、破坏兼容性、炸前后端生成代码 |
| Redis(缓存/锁/去重/计数) | [go-redis.md](go-redis.md) | 抓到已 Close 的旧客户端;`redis.Nil` 被当故障;非幂等命令被默认重试执行多次 |
| Kafka / NATS / outbox / Inbox / 领域事件 | [events/INDEX.md](../project/ecommerce/events/INDEX.md) + [生产目标与 Kafka 路线](../../docs/design/platform/production-scale-goal.md) | 事务内双写 broker、把 EOS 当端到端 exactly-once、双栈消费者重复产生副作用 |
| 定时/周期任务、Ticker、后台 goroutine | [cron-jobs.md](cron-jobs.md) | 扩副本后同一任务跑 N 次;首次触发盲窗;挂错 ctx 导致心跳静默退出 |
| 指标 / 看板 / 告警 | [`observability/OBSERVABILITY.md`](../../docs/observability/OBSERVABILITY.md) | 标签基数失控;错误率画成速率;加了指标却没有可行动的告警 |
| CI/CD、部署策略、镜像 | [`docs/DEVOPS.md`](../../docs/DEVOPS.md) | 镜像用 latest;单副本下滚更/金丝雀静默失效 |
| 数据库表结构 / 迁移 / 种子数据 | [db-migrations.md](db-migrations.md) + [`docs/DEVOPS.md`](../../docs/DEVOPS.md) | 迁移里写 SET search_path 版本表解析失败;sqlc 生成物落后 schema;种子不幂等重跑翻倍;不按 expand-contract 滚更炸旧副本 |
| Shell / Make recipe | [shell-scripting.md](shell-scripting.md) | macOS Bash 3.2 + `set -u` 下空数组展开直接退出 |
| 本地起服务连不上基础设施 | [local-env.md](local-env.md) | `dev.yml` 里的集群内 svc 域名在 Mac 上解析不了；`pg-main-rw`/`192.168.3.132` 指向已 hibernate 的 CNPG（TCP 通但握不了手）；Consul 不带 token 时读返 200 但结果被 ACL 过滤成空；配置缺子块导致功能被静默关掉 |
| Kubernetes 节点关机/重启、终态 Pod 累积 | [node-graceful-shutdown.md](node-graceful-shutdown.md) | 把正常的 90 秒等待当卡死后强断电;把 `Succeeded/Failed` 历史误判成运行副本;只改 kubelet 不改 logind 导致提前关机 |
| 对外公开服务 / 内网穿透 / `*.apikv.com` | [pangolin-tunnel.md](pangolin-tunnel.md) | k8s target 走 80 得 envoy 404;改完配置不等 Traefik 5s 轮询就当故障排查 |
| 改 SSH 端口 / SSH 突然连不上 | 已归档至 [`docs/progress-archive/ssh-port-migration-20260811.md`](../../docs/progress-archive/ssh-port-migration-20260811.md)(一次性主机运维实录,前提为 Ubuntu 24.04,与当前 26.04 不同,仅供参考) | 改 sshd_config 的 Port 在 socket activation 下无效;ListenStream 纯端口号 IPv4 全断把自己锁外面 |
| 写测试 / 补测试 / 防回归 | [go-testing.md](go-testing.md) + [`docs/TESTING.md`](../../docs/TESTING.md) | 用 mock 测 sqlc 的 SQL 等于没测;引入 go-sqlmock 才发现接不上 pgx |
| **往文档里写集群/运行时数字**(Pod 分布、就绪计数、镜像 tag、节点内存) | [live-facts.md](live-facts.md) | 把某一刻的快照写成永久事实;**在集群故障期采数,把故障态固化成「现状」**;`[LIVE-FACT]` 门禁会红 |
| 在集群身份下改代码(okteto) | [okteto-inner-loop.md](okteto-inner-loop.md) + [`docs/OKTETO.md`](../../docs/OKTETO.md) | 没关 ArgoCD 自动同步 → 开发容器被无声干掉;开发完忘了恢复 → GitOps 静默失效 |
| 提交信息 / 分支 / 分组 | [git-commit.md](git-commit.md) + 本文 §6 | type 自造、`perf` 滥用、`git add -A` 混提 |
| 踩到坑之后 | [`harness-framework/self-refinement.md`](../harness-framework/self-refinement.md) | 同一个坑下个会话再踩一次 |

⚠️ **目标态**文档（`DEVOPS.md` / `OBSERVABILITY.md` / `design/platform/production-scale-goal.md`）描述的是尚未实现的体系,
读它们是为了不把新代码写歪,**不要据此认为对应能力已经存在**——现状一律以 `TODO.md` 为准。

---

## 0.5 一键并行锚点(默认入口)

```bash
scripts/verify-quick.sh             # 后端(§1+§3)与前端(§4)并行跑;每侧绿了只打一行,红了只打日志尾部
scripts/verify-quick.sh backend     # 只跑后端;frontend 同理
```

后端链与 `pnpm ready` **无数据依赖,不要串行等待**;全量输出在修复循环里反复进上下文,
绿的部分是纯噪音,所以默认入口只回报失败段(完整日志路径在摘要里)。
§1–§4 是它的分解动作,**定位单个失败时再单跑**;§2(structcheck `-count=1`)与
`scripts/verify-context.sh` 不在其中,按各自触发条件跑。改 `verify-context.sh` **本身**后
再跑 `scripts/verify-context-canary.sh`(门禁的元评测:注错断言它还会红,CI 每次 push 也跑,
由来见 [`harness-framework/flywheel-audit.md`](../harness-framework/flywheel-audit.md))。

## 1. 编译与静态检查(后端最基本的锚点)

```bash
cd backend
go build ./...        # 必须 rc=0
go vet ./...          # 必须 rc=0(会连带编译测试文件)
```

用 macOS 自带 shell 时注意:没有 `timeout`;取退出码用 `echo $?`(zsh 的 `PIPESTATUS`
是 bash 语法)。

## 2. 结构性门禁 structcheck(改 `.service-matrix.yaml` 或加删服务后必跑)

```bash
cd backend
go test -count=1 ./structcheck/...   # -count=1 强制重跑:它读数据文件,go test 不按数据文件失效缓存
```

检查五项:matrix ↔ `backend/services/` 目录双向对齐、matrix 内部一致性、matrix ↔ 网关
接线、10 服务 `internal/pkg` 同构性、10 服务配置加载生产文件集与 cart 基线一致。最后一项专门
拦截「cart 新增了一份样板文件但其他服务没复制」——通用同构检查会忽略只有一个持有者的文件。
存量漂移记在 `backend/structcheck/homogeneity_baseline.txt`(棘轮:新漂移即红)。

## 3. 后端测试

```bash
cd backend
go test -short ./...   # CI(.github/workflows/backend.yml)用的就是 -short
```

## 4. 前端

```bash
cd frontend
pnpm ready            # vite-plus 聚合:lint(oxlint)+ fmt(oxfmt)+ 类型 + test,端到端
# 单跑:vp lint / vp fmt / vp test
```

前端工具链是 **vite-plus(`vp`)一个包**覆盖 dev/build/test/lint/fmt/任务/git 钩子,
**没有 husky/biome/eslint/prettier**。别把 git 钩子挪回 `.husky/`(会被 vp 静默接管,
见 `git-commit.md`)。

## 5. 本地异构双审(push 前,替代 CI 里的 AI 审查)

核心改动 push 前对着 diff 跑 **`/adversarial-review`**(隔离 fresh Claude + Codex 独立审、
逐条核实合并);小改动可跳。这是「异构监督」防线,放行仍以 §1–§3 的执行事实(build/test 真绿)
为锚点,不以任何模型自报为准。

---

## 6. 提交流程(可执行)

顺序不能乱:

1. **先更新文档**:`TODO.md`(唯一进度真相源,RPC 粒度 + `file:line`;`PROGRESS.md`
   已于 2026-08-13 废止归档,不再双写)。
   声称「已完成」前**先回扫代码**——返回假成功或 panic 的方法按**未实现**计。
2. **分组提交**:前端 / 后端 / 文档**分开**,不要 `git add -A` 混提。若拆分会产出编译不过的
   中间提交,才合并成一个并在 body 写明为什么不拆。
3. **提交信息** Conventional Commits:`<type>(<scope>): <subject>`,
   - type 限 11 类(`feat fix perf refactor style test docs build ci chore revert`),不可自造;
     `perf` 只用于**真的**更快/更省(重构、删死代码、挪文件都不是 perf);
   - emoji 可选,写了必须与 type 相符(白名单唯一真相源是 `frontend/commitlint.config.mjs`);
   - subject 末尾**不加标点**,控制在 50 字符内。
4. **自检提交信息**(可选):`cd frontend && echo "feat(cart): 示例" | pnpm exec commitlint`
5. **提交**:`git commit`。项目历史全部**直接提交 `main`**,不走分支/PR,除非用户明确要求开分支。

⚠️ **push main 不会构建任何东西**——CI 只由发布 tag 触发,且 tag 只推 `github` 远端
(origin 是 GitLab,没有 Actions)。要触发 CI 验证或部署,见
[git-commit.md](git-commit.md) 的「发布 tag 与 CI 触发」。

钩子说明:commit-msg 钩子由 vite-plus 装(`core.hooksPath=frontend/.vite-hooks/_`),直调
`frontend/node_modules/.bin` 里的 commitlint(2026-08-26 起不再经 pnpm exec,理由与
127 的读法见 [git-commit.md](git-commit.md)「钩子退出 127 怎么读」)。**钩子退出 127** =
frontend 依赖未装(`cd frontend && pnpm install`),是环境问题不是消息问题——先人工比对
上面第 3 条规则,确认无误后才可 `--no-verify`,并在回复里说明。
不要把 `--no-verify` 变成肌肉记忆。

---

## 7. 收尾:踩坑要沉淀

判断是「模式性教训」(换个模块仍成立)还是「一次性 diff」。前者写回 `context/` 对应层:
团队级 → `context/team/`;协作机制 → `context/harness-framework/`;某服务特有坑 →
`context/project/ecommerce/{module}/experience/`。见 `harness-framework/self-refinement.md`。

---

## 真相源清单

**不在这里重复**——完整的分层导航与真相源清单见 [`context/INDEX.md`](../INDEX.md)。
本文开头已给出冲突时的裁决顺序:规范看 `context/`,拓扑看 `.service-matrix.yaml`,
进度看 `TODO.md`,提交校验规则看 `frontend/commitlint.config.mjs`。
