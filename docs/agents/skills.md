# Agent skills 与重装后的工具清单

实测日期：2026-09-08；主机用户目录 `/Users/lens`，项目 `/Users/lens/lens077/ecommerce`。本页替换旧机器的「已装」记录，不把文档声明、配置存在或 PATH 命中当成端到端可用证明。首次清点修正了路径；后续按用户要求恢复 E3 接线、修复 worktree 并适配 backpass。没有安装第三方软件、登录服务或修改集群。

## Skills

检查范围：`~/.claude/skills`、`~/.agents/skills` 均不存在；`~/.codex/skills` 只有 `.system`；`~/.dsh/skills` 有 Sepia 系列、novel-writer、qimao-novel-scraper。当前 DSH 会话还提供 archify。项目 `.claude`、`.codex`、`.cursor` 中未发现下列缺失 Skill 的本体。

| Skill | 本机状态 | 用途与恢复入口 |
|---|---|---|
| `tech-doc-style-chinese` | 缺失 | 项目中文技术文档规则；上游 [Fenng/tech-doc-style-chinese](https://github.com/Fenng/tech-doc-style-chinese)。保持上游原文，项目覆盖仍写在 AGENTS.md |
| `impeccable` | 缺失 | 前端设计与检查；上游 [pbakaus/impeccable](https://github.com/pbakaus/impeccable)。已有 PRODUCT.md、DESIGN.md 和 `.impeccable/` 项目资产，不要重新初始化覆盖 |
| `adversarial-review` | 缺失，原安装来源未确认 | runbook 要求隔离 fresh Claude + Codex 双审；优先从旧备份恢复。网上有多个同名实现，不能据名称认定为原版 |
| `archify` | 当前 DSH Skill 目录已可见 | 无需为当前 DSH 重复安装；Claude/Codex 是否要独立安装按使用场景决定，上游 [tt-a1i/archify](https://github.com/tt-a1i/archify) |

DSH 默认扫描项目 `.dsh/skills`、`.agents/skills` 和用户 `~/.dsh/skills`、`~/.agents/skills` 等来源；不要假设只装到 `~/.claude/skills` 就一定能被 DSH 发现。安装后新建会话，确认 Skill 目录出现且能加载，再更新本页状态。

### 安装提示（供用户执行，本轮未执行）

中文 Skill 的上游命令：

```bash
npx skills add https://github.com/Fenng/tech-doc-style-chinese -a codex -g
npx skills add https://github.com/Fenng/tech-doc-style-chinese -a claude-code -g
```

若安装器未将其放到 DSH 扫描目录，需要另行把完整 Skill 目录接入 `~/.dsh/skills/tech-doc-style-chinese` 或共享的 `~/.agents/skills`，不能只复制 SKILL.md 而漏掉 references。

Impeccable 上游当前推荐从项目根运行 `npx impeccable install` 并选择所需 provider；也提供 `dist/dsh/.dsh/skills/` 的 DSH 构建。先核对安装器版本与变更，保留项目既有产品和设计资产。当前上游 Hook 已使用 `scripts/impeccable hook` launcher，而本项目遗留 Hook 使用 `scripts/hook.mjs`：安装新版后必须核对生成配置和 frontend-only 过滤，不能把「路径已修正」当作 Hook 已恢复。

## MCP 与搜索能力

| 能力 | 检查结果 | 是否需要安装 |
|---|---|---|
| DSH Exa MCP | `~/.dsh/cordis.patch.yml` 已配置远程服务；本轮调用搜索成功 | 当前 DSH 不需要重复安装；不代表 Claude/Codex 同时配置 |
| DSH Kitesurf / Chrome DevTools MCP | 已配置；本轮 `list_pages` 成功 | 当前远程浏览器通道可用；本机 localhost 访问能力另测 |
| Blender MCP | 配置残留，指定 `/opt/homebrew/bin/uvx`；PATH 无 uvx，常见 `/Applications/Blender.app` 不存在，当前无 Blender MCP 工具 | ecommerce 日常开发不需要。确需 3D 时再恢复 uv/uvx、Blender、addon 并验证连接 |
| Claude Code MCP | 检查的 `~/.claude.json` 中 MCP 配置为空 | 需要 Claude 独立使用 Exa/浏览器时另配，不会继承 DSH MCP |
| Codex MCP | `~/.codex/config.toml` 没有 MCP server 条目；项目 config.toml 也没有 | 按实际需求另配 |
| `mcporter` | PATH 未找到，`~/.mcporter/mcporter.json` 不存在 | 仅脚本或 Agent Reach 需要 MCP CLI 时恢复；DSH 原生 Exa 不依赖它 |
| Playwright MCP / `playwright-cli` | 未发现项目 MCP 配置；CLI 不在 PATH | 非当前 DSH 浏览器功能的必需依赖；不要依据旧机器另一个项目的配置自动安装 |
| Funes / Memorix / Engram | 本次项目配置未接入 | 属可选记忆方案，不是 ecommerce 开发前置条件 |

项目没有独立 MCP 清单；`.claude/settings.local.json` 是权限与 Hook 配置，不是 MCP server 配置。凭据只留在用户配置或凭据服务，安装记录不得复制令牌。

## Hooks 与辅助工具

| 项目 | 本机状态 | 恢复动作 |
|---|---|---|
| Impeccable frontend-only 包装 | 项目脚本存在，旧用户路径已修正；被调用的 hook.mjs 缺失 | 先安装 Skill，再按其实际版本接线。缺文件时现有包装静默跳过，不构成检查通过 |
| E3 overread guard | 已按文档重建；用户路径 symlink 指向仓库源码，Claude 全局 PreToolUse 已接线 | 9 个回归测试及配置命令烟测通过；新建 Claude 会话再确认运行。不是恢复原件，也未接入 DSH/Codex，见 [e3-execution.md](../../context/harness-framework/e3-execution.md) |
| `hcom` | PATH 未找到；当前 Claude settings 无原 Notification/Permission 接线 | 仅需跨 CLI 消息时恢复；旧记录给出的入口为 `brew install aannoo/hcom/hcom`，安装前核对上游 |
| `agent-reach` | PATH 未找到 | 多平台研究可选；见 [Agent-Reach](https://github.com/Panniantong/Agent-Reach) 当前安装文档，平台登录分别验证 |
| `agy` | PATH 未找到 | 旧文档已将其摘出搜索链，本轮不建议恢复 |
| TokenTracker notify | Claude/Codex 配置均指向现用户路径，notify.cjs 文件存在 | 未测试发送、认证或计费统计，不列为缺失 |
| DSH Claude Hook bridge | 检查的全局/Web patch 未接入 `dsh-hooks-claude-code` | 安装 Claude Skill 不等于 DSH 会执行 Claude Hook；有需要再显式桥接 |

`/Users/lens/lens077/AGENTS.md`、`HARNESS.md`、`backpass-distill.sh` 三个共享相对 symlink 均存在且目标可达，不需要重建。

## 开发与验证 CLI

下表的「缺失」仅表示本轮 Shell 的 PATH 未发现；不对未检查目录里的备用安装作全盘断言。没有连接数据库、Kubernetes 或其他远程环境。

| 工具 | 结果 | 优先级 / 说明 |
|---|---|---|
| Homebrew、git、make、curl、jq | PATH 已有 | 基础工具，无需重复安装 |
| Node / pnpm / Go | `v26.8.1` / `12.3.4` / `go1.27.1` | 已执行版本检查；pnpm 与 frontend/package.json 声明一致 |
| Python | 系统 Python `3.9.6` | 已有；第三方工具需更新版本时用独立环境，不覆盖系统 Python |
| Claude / Codex / gh | PATH 已有 | 未验证模型认证；gh 未检查登录状态 |
| DSH CLI | PATH 未找到 `dsh`，但当前 DSH GUI 正在提供工具 | 不等于 DSH 没装；CLI 快捷入口可后续单独配置 |
| `gitleaks` | 缺失 | 高优先级：项目 pre-commit 和验证链要求，缺失会阻塞 |
| `golangci-lint` | 缺失 | 高优先级：runbook 的 exported 基线检查要求；仓库当前要求与 CI 对齐 v2.13.1 |
| `buf` | 缺失 | API/conf 生成需要，见 backend/Makefile |
| `protoc-gen-go` / `protoc-gen-connect-go` | PATH 均缺失 | backend/go.mod 已声明 tool 依赖，但 buf.gen.yaml 使用 local executable；仅有依赖声明不足以满足 PATH 查找 |
| `sqlc` | 缺失 | SQL 数据访问代码生成需要 |
| `rg` / `zstd` | PATH 均未找到 | ripgrep 推荐恢复；新版 backpass 可使用现有 Node 解压 DSH 多帧 zstd，不再要求先安装 zstd CLI |
| Docker / OrbStack | PATH 无 docker，常见应用位置均未找到 | 需要本地容器、testcontainers 或镜像构建时选一个运行时，不必同时安装两套 |
| `kubectl` / `helm` | PATH 已有 | 未验证 kubeconfig、集群认证或可达性 |
| `uv` / `uvx` | 均缺失 | Python 工具隔离安装推荐；Blender MCP 残留配置直接依赖 uvx |
| vite-plus `vp` / `protoc-gen-es` | frontend/node_modules/.bin 下已有 | 项目局部依赖，不需要因全局 PATH 缺 vp 而重复安装 |
| Playwright 浏览器 | 默认浏览器缓存目录不存在；根 workspace 无 playwright bin | 本轮未检查每个 app 的依赖完整性。按目标 app 的 E2E 文档恢复浏览器，不当成 MCP 安装 |
| `protoc` / `protoc-gen-jsonschema` / `protoc-gen-validate` | 均缺失 | 按实际生成目标选装；buf 常规生成不必单独安装 protoc，不要为遗留 PGV 默认装 validate 插件 |
| `goose` | PATH 未找到 | 不必单独安装：项目迁移使用 `go run ./tools/dbmigrate`，goose 为库依赖 |
| `actionlint` / `shellcheck` | 均缺失 | 修改 CI / Shell 时按验证要求选装 |
| `glab` / `psql` / `yq` / `kustomize` / `okteto` / `mise` | 均缺失 | 按 GitLab、数据库、部署或开发内环需求选装；kubectl 自带 kustomize 子命令 |
| `staticcheck` / `govulncheck` / `osv-scanner` / `trivy` / `syft` / `grype` | 均缺失 | 安全/供应链/静态检查扩展，按当前任务入口要求选择，不要求一次全装 |

可先由用户执行基础恢复命令（本轮未执行；安装器可能修改本机文件）：

```bash
brew install gitleaks ripgrep zstd sqlc uv
```

golangci-lint 按项目/CI 版本要求安装；两个 Go 插件可在 backend 目录使用当前 go.mod 选定的依赖版本安装：

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest
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
