# Agent skills 与开发工具：采用状态与查法

本页只记两类**不易过期**的信息：某 skill **是否采用**（决定入口文件能不能要求执行它），以及工具**怎么查、缺了怎么装**。

不记「已装/缺失」与版本号——它们是运行态，写入当天就开始过期，且与 [AGENTS.md](../../AGENTS.md) 的「环境按需查询，文档只留契约与查法」冲突。需要现况就跑下面给出的查法；历史快照见 git 历史。

`## Skills` 表的列契约由 `scripts/verify-context.sh` 的 `[SKILL-REF]` 读取：**第 1 列是 skill 名（反引号包裹），第 2 列是状态词**，出现「缺失 / 不采用 / 未装」即视为入口文件不得要求执行它。改表时不要动这两列的位置。

## Skills

| Skill | 采用状态 | 用途与入口 |
|---|---|---|
| `tech-doc-style-chinese` | 采用 | 项目中文技术文档规则；上游 [Fenng/tech-doc-style-chinese](https://github.com/Fenng/tech-doc-style-chinese)。保持上游原文，项目覆盖仍写在 AGENTS.md |
| `impeccable` | 采用 | 前端设计与检查；上游 [pbakaus/impeccable](https://github.com/pbakaus/impeccable)。已有 PRODUCT.md、DESIGN.md 和 `.impeccable/` 项目资产，不要重新初始化覆盖 |
| `adversarial-review` | **不采用外部 skill** | runbook §5 的「异构双审」用本仓 subagent 实现：两个只读子代理分别走 Claude / Codex 路由审同一份 diff，主会话合并。候选的 [localSummer/skills](https://github.com/localSummer/skills) 同名实现是 Bug-finder / Defender / Referee 三角色对抗审 `target_path`，与「异构双模型审 diff」语义不同，未采用。`[SKILL-REF]` 门禁：入口文件不得要求执行本表标为不可用的 skill |
| mattpocock 系列（`to-tickets` `triage` `to-spec` `wayfinder` `domain-modeling` `handoff` 等） | 采用 | 读取 `docs/agents/{issue-tracker,triage-labels,domain}.md`；交接内容契约见 `context/harness-framework/handoff-format.md` |
| `archify` | 采用（按需） | 架构图/流程图；上游 [tt-a1i/archify](https://github.com/tt-a1i/archify)。按当前工具有没有该 skill 决定是否安装，不阻塞开发 |
| `modern-web-guidance` | 采用 | Chrome/Edge/Firefox/MDN 团队的现代 Web 平台特性指南；CLI 另有 `search` / `retrieve` / `legacy-scan`（`npx modern-web-guidance@latest <cmd>`，legacy-scan 只覆盖约 20% 确定性规则）。2026-11-13 用它指导 consumer/consumer-next 现代化：IME 安全回车、View Transitions、scroll-driven animations。上游 [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) |

> 是否真的加载成功，按 `## 开发与验证 CLI` 的查法思路现查：看会话里 skill 目录是否可见、能否调用。不要假设装到某一个目录就一定被所有工具发现。

### 安装与恢复（仅在查不到时执行）

中文 Skill 的上游命令：

```bash
npx skills add https://github.com/Fenng/tech-doc-style-chinese -a codex -g
npx skills add https://github.com/Fenng/tech-doc-style-chinese -a claude-code -g
```

若安装器未将其放到 DSH 扫描目录，需要另行把完整 Skill 目录接入 `~/.dsh/skills/tech-doc-style-chinese` 或共享的 `~/.agents/skills`，不能只复制 SKILL.md 而漏掉 references。

Impeccable 上游当前推荐从项目根运行 `npx impeccable install` 并选择所需 provider；也提供 `dist/dsh/.dsh/skills/` 的 DSH 构建。先核对安装器版本与变更，保留项目既有产品和设计资产。当前上游 Hook 已使用 `scripts/impeccable hook` launcher，而本项目遗留 Hook 使用 前端 vite-plus hooks：安装新版后必须核对生成配置和 frontend-only 过滤，不能把「路径已修正」当作 Hook 已恢复。

## 开发与验证 CLI

查法现跑；「缺失时」只给入口，不记录当前装没装、也不记版本号。没有连接数据库、Kubernetes 或其他远程环境。

| 工具 | 查法 | 缺失时 |
|---|---|---|
| 基础工具 | `command -v brew git make curl jq` | `brew install ...` |
| Node / pnpm | `node -v && pnpm -v` | 按 `frontend/package.json` 的 `packageManager` 装 |
| Go | `go version`；版本以 `backend/go.mod` 的 `go` 指令为准 | 按 go.mod 安装对应版本 |
| Python | `python3 -V` | 不覆盖系统 Python；第三方工具用独立环境 |
| Claude / Codex / gh | `command -v claude codex gh`；`gh auth status` | 按官方文档安装；认证另行检查 |
| DSH CLI | `command -v dsh` | GUI 可用时 CLI 只是快捷入口，按需配置 |
| `gitleaks` | `command -v gitleaks` | `brew install gitleaks`。pre-commit 与验证链 fail-closed：缺失即红 |
| `golangci-lint` | `command -v golangci-lint && golangci-lint version` | 版本须与 CI 对齐，口径看 `.gitlab-ci.yml` / `.github/workflows/` |
| `buf` | `command -v buf` | `brew install bufbuild/buf/buf` |
| `protoc-gen-go` / `protoc-gen-connect-go` | `command -v protoc-gen-go protoc-gen-connect-go` | 用 `go.mod` 钉住的版本 `go install`，不要 `@latest` |
| `sqlc` | `command -v sqlc` | `brew install sqlc` |
| `rg` / `zstd` | `command -v rg zstd` | `brew install ripgrep zstd` |
| Docker / OrbStack | `command -v docker && docker info` | 装 OrbStack 或 Docker Desktop 之一；testcontainers 与镜像构建共用 |
| `kubectl` / `helm` | `command -v kubectl helm` | `brew install kubectl helm`。集群可达性另行验证 |
| `uv` / `uvx` | `command -v uv uvx` | `brew install uv` |
| vite-plus `vp` / `protoc-gen-es` | `ls frontend/node_modules/.bin/vp frontend/node_modules/.bin/protoc-gen-es` | 项目局部依赖，`pnpm install` 即可，不需全局装 |
| Playwright 浏览器 | `ls ~/Library/Caches/ms-playwright` | 按目标 app 的 E2E 文档 `pnpm exec playwright install` |
| `protoc` / `protoc-gen-jsonschema` / `protoc-gen-validate` | `command -v protoc protoc-gen-jsonschema protoc-gen-validate` | 按实际生成目标选装；buf 常规生成不必单独装 protoc |
| `goose` | 不需要全局：迁移走 `go run ./tools/dbmigrate` | goose 是库依赖 |
| `actionlint` / `shellcheck` | `command -v actionlint shellcheck` | `brew install actionlint shellcheck`；改 CI / Shell 时用 |
| `glab` / `psql` / `yq` / `kustomize` / `okteto` / `mise` | `command -v glab psql yq kustomize okteto mise` | 按 GitLab / 数据库 / 部署 / 内环需求选装；kubectl 自带 kustomize 子命令 |
| `staticcheck` / `govulncheck` / `osv-scanner` / `trivy` / `syft` / `grype` | `command -v staticcheck govulncheck osv-scanner trivy syft grype` | 安全/供应链/静态检查扩展，按任务入口要求选装 |

缺失时可一次装齐基础工具（安装器会修改本机文件）：

```bash
brew install gitleaks ripgrep zstd sqlc uv
```

golangci-lint 按项目/CI 版本要求安装；两个 Go 插件必须与 `backend/go.mod` 钉住的模块版本一致，不要用 `@latest`（版本漂移会让生成结果随机器变化）：

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@<protobuf 版本，见 go.mod>
go install connectrpc.com/connect/cmd/protoc-gen-connect-go@<connect 版本，见 go.mod>
```

确认安装目标目录在 PATH 中。安装完只验证版本和本地命令，不顺带部署、推送或迁移数据库。

## 路径修正范围与残留

项目 Claude 设置、frontend-only Hook、portable harness 入口、SGH 草案以及 gateway 索引的旧用户路径已修正。后续恢复只向全局 Claude 设置增加 E3 PreToolUse，保留模型、插件和通知配置，并留有备份；没有修改全局 Codex/DSH 配置，也没有改变 Impeccable 缺依赖时的原有行为。

历史 `.scratch/`、`.agent-teams/`、docs/reports、旧测试测量结果及 Impeccable 缓存中的旧机器路径保留为原始证据；`.idea/workspace.xml` 的最近打开路径也未改。后续恢复中已确认 worktree 实体位于 `/Users/lens/lens077/ecommerce-meili-retirement`，执行 `git worktree repair /Users/lens/lens077/ecommerce-meili-retirement` 修复双向关联；原分支 `chore/retire-meilisearch-20260904`、HEAD 和已有文件差异保留。另一个 `/private/tmp/ecommerce-verify-0702ca5` 的实体目录已不存在，残留记录未 prune，以免未经核对丢弃其元数据。

`backpass-distill.sh` 已通过 `scripts/backpass-dsh.py` 适配 DSH v0-v2 的明文/压缩多帧日志，按最高格式代和明确的 header cwd 读取直接用户消息，排除注入与 fork seed。修复了空 injected.txt 导致 human.tsv 被全部过滤的旧 awk 问题。13 个合成与命令行回归测试通过；本机 v2 样本的多帧读取已确认可提取直接用户消息，验证只打印计数，不打印正文。Node 内置 zstd 可解压，但必须按消费字节数循环处理每个帧；单次 zstdDecompressSync 只会读到首帧。完整用法和兼容边界见 [Session 反传](../../context/harness-framework/flywheel-audit.md)。这仍是人工审计的消息抽取器，不是语义记忆库。

## 验收与相关文档

已验证：Node/pnpm/Go/Python 版本、常用目录与 CLI 存在性、共享 symlink、Exa 搜索调用、Kitesurf 页面列表；E3 回归及已配置命令的正向拦截/重试，worktree 修复后定位，backpass 多帧解析与输出权限。未验证：付费模型会话中的 Hook 调度、模型认证、Skill 实际执行、Impeccable 检测、Blender、容器运行时、集群、数据库及完整前后端构建。

路径修改前的 `scripts/verify-context.sh` 已报告 `.scratch/doc-embed-demo/README.md` 的 EMBED 不一致；该既有问题不在本轮修正范围。变更后的校验结果由交付说明报告。

- issue/spec 存放约定：[issue-tracker.md](issue-tracker.md)
- triage 标签：[triage-labels.md](triage-labels.md)
- 领域文档：[domain.md](domain.md)
- 可执行命令：[runbook.md](../../context/team/runbook.md)
