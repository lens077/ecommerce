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

- **查服务拓扑不要现搜**:注册名、网关前缀、依赖、Consul KV 键 → 一律查
  [`.service-matrix.yaml`](../../.service-matrix.yaml)。区分 `depends_on`(已接线)与
  `depends_on_planned`(设计要求但未接线),别把后者当已实现。
- **后端 10 个业务服务是同构副本**:`backend/services/*/internal/pkg/` 下的基础设施代码
  (otel/log/registry/config 等)一份逻辑铺 10 份,**改一处 = 改全部对应文件**,由
  structcheck 的同构检查兜底(见 §2)。整个后端只有一个 `go.mod`。
- **写/改 proto 前先读 `Design.md`**,为每个字段推断校验约束(见 `proto-design.md`)。
- **凭据不入库**:密码/密钥只在 Consul KV 和本地环境,仓库里只写主机名和端口。
- **不可逆动作(commit/push/合入/deploy/仓外写删)只由用户明示触发**,subagent 永不执行。

### 0.1 按改动类型的必读路由

> 本文件是入口,**不是内容的容器**。下面只给指针——同一条约束只写一处,复制会漂移
> (`harness-framework/knowledge-layering.md`)。**动手前先按下表跳一次**,
> 表里没有的再回 [`context/INDEX.md`](../INDEX.md) 逐层找。

| 你要动的是 | 先读 | 不读会怎样 |
|---|---|---|
| 服务拓扑/注册名/网关前缀/KV 键 | [`.service-matrix.yaml`](../../.service-matrix.yaml) | 现搜猜错,把 `depends_on_planned` 当已接线 |
| proto / API 契约 | [proto-design.md](proto-design.md) | 字段裸奔、破坏兼容性、炸前后端生成代码 |
| Redis(缓存/锁/去重/计数) | [go-redis.md](go-redis.md) | 抓到已 Close 的旧客户端;`redis.Nil` 被当故障;非幂等命令被默认重试执行多次 |
| 定时/周期任务、Ticker、后台 goroutine | [cron-jobs.md](cron-jobs.md) | 扩副本后同一任务跑 N 次;首次触发盲窗;挂错 ctx 导致心跳静默退出 |
| 指标 / 看板 / 告警 | [`observability/OBSERVABILITY.md`](../../observability/OBSERVABILITY.md) | 标签基数失控;错误率画成速率;加了指标却没有可行动的告警 |
| CI/CD、部署策略、镜像、migration | [`DEVOPS.md`](../../DEVOPS.md) | 镜像用 latest;单副本下滚更/金丝雀静默失效;migration 不兼容滚更期新旧共存 |
| 本地起服务连不上基础设施 | [local-env.md](local-env.md) | 连 `consul.app.com` 超时;KV 缺子块导致功能被静默关掉 |
| 提交信息 / 分支 / 分组 | [git-commit.md](git-commit.md) + 本文 §7 | type 自造、`perf` 滥用、`git add -A` 混提 |
| 踩到坑之后 | [`harness-framework/self-refinement.md`](../harness-framework/self-refinement.md) | 同一个坑下个会话再踩一次 |

⚠️ 两份**目标态**文档(`DEVOPS.md` / `OBSERVABILITY.md`)描述的是尚未实现的体系,
读它们是为了不把新代码写歪,**不要据此认为对应能力已经存在**——现状一律以 `TODO.md` 为准。

---

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

检查四项:matrix ↔ `backend/services/` 目录双向对齐、matrix 内部一致性、matrix ↔ 网关
接线、10 服务 `internal/pkg` 同构性。存量漂移记在 `backend/structcheck/homogeneity_baseline.txt`
(棘轮:新漂移即红)。

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

## 5. 冻结验收集(Frozen Nodes,做核心模块时)

```bash
scripts/freeze.sh <feature> <测试路径...>   # 把一组验收测试的内容哈希锁进 .freeze/<feature>.sha256
scripts/verify-freeze.sh --all              # 校验没被动过;DRIFT(内容变)/MISSING(删移)即 rc=1
scripts/verify-freeze.sh <feature>          # 只校验一个
```

冻结后**单独一个 commit** 提交 `.freeze/` 产物并声明冻结;之后改动这些测试需重跑
`freeze.sh` 并走审批(`.github/CODEOWNERS` 管 `/.freeze/`)。CI
`.github/workflows/freeze-check.yml` 在 PR/push 上跑 `verify-freeze.sh --all`,是 GitHub
main 分支保护里**唯一必需**的状态检查(GitLab 侧对应 `.gitlab-ci.yml` 的 `freeze-check`)。

## 6. 本地异构双审(push 前,替代 CI 里的 AI 审查)

核心改动 push 前对着 diff 跑 **`/adversarial-review`**(隔离 fresh Claude + Codex 独立审、
逐条核实合并);小改动可跳。这是「异构监督」防线,放行仍以 §1–§3 的执行事实(build/test 真绿)
为锚点,不以任何模型自报为准。

---

## 7. 提交流程(可执行)

顺序不能乱:

1. **先更新文档**:`TODO.md`(进度真相源,RPC 粒度 + `file:line`)**和** `PROGRESS.md`
   (完成度评估视图,每服务一行)。**两份都要改**,只改一份会让下一轮对不上。
   声称「已完成」前**先回扫代码**——返回假成功或 panic 的方法按**未实现**计。
2. **分组提交**:前端 / 后端 / 文档**分开**,不要 `git add -A` 混提。若拆分会产出编译不过的
   中间提交,才合并成一个并在 body 写明为什么不拆。
3. **提交信息** Conventional Commits:`<type>(<scope>): <subject>`,
   - type 限 11 类(`feat fix perf refactor style test docs build ci chore revert`),不可自造;
     `perf` 只用于**真的**更快/更省(重构、删死代码、挪文件都不是 perf);
   - emoji 可选,写了必须与 type 相符(白名单唯一真相源是 `commitlint.config.mjs`);
   - subject 末尾**不加标点**,控制在 50 字符内。
4. **自检提交信息**(可选):`echo "feat(cart): 示例" | pnpm exec commitlint`
5. **提交**:`git commit`。项目历史全部**直接提交 `main`**,不走分支/PR,除非用户明确要求开分支。

钩子说明:commit-msg 钩子由 vite-plus 装(`core.hooksPath=frontend/.vite-hooks/_`),调
`pnpm exec commitlint`。**若某 shell 里 `pnpm` 不在 PATH**(钩子退出 127),说明是环境问题
不是消息问题——先人工比对上面第 3 条规则,确认无误后才可 `--no-verify`,并在回复里说明。
不要把 `--no-verify` 变成肌肉记忆。

---

## 8. 收尾:踩坑要沉淀

判断是「模式性教训」(换个模块仍成立)还是「一次性 diff」。前者写回 `context/` 对应层:
团队级 → `context/team/`;协作机制 → `context/harness-framework/`;某服务特有坑 →
`context/project/ecommerce/{module}/experience/`。见 `harness-framework/self-refinement.md`。

---

## 真相源清单(冲突时以这些为准)

| 关注点 | 真相源 |
|---|---|
| 规范/约定 | `context/`(入口 `context/INDEX.md`) |
| 服务拓扑 | `.service-matrix.yaml` |
| 实现进度 | `TODO.md` |
| 架构设计 | `Design.md` / `CONFIG_CENTER_DESIGN.md` |
| 提交校验规则 | `commitlint.config.mjs` |
