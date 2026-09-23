---
name: repowise
layer: team
description: Repowise 是按需运行的代码库审计工具（死代码、健康、调用图、文档引用），不是 per-push 门禁；固定版本、无 LLM/遥测/editor 副作用
affects:
  - scripts/verify-repowise.sh
  - scripts/repowise-doc-drift-baseline.json
  - tools/repowise/pyproject.toml
  - tools/repowise/uv.lock
---
# Repowise 按需审计

## 定位

Repowise 在本仓是**按需运行的审计工具**：建立代码/符号/依赖/Git 索引，用来查死代码、代码健康、调用关系和文档引用。它**不在任何 CI 里跑**，也不是真相源，不替代：

- `scripts/verify-context.sh`：知识库结构、死链、正文路径（`[PATH-REF]`）、索引、嵌入投影和格式门禁；
- `backend/structcheck`：服务矩阵、网关接线和服务同构性；
- `scripts/verify-deploy-parity.sh`：Helm 与裸 manifest 的逐对象 parity；
- `backend/tools/config-seed -drift`：Config Center 实际值与 `.service-matrix.yaml` 的端点/必需 key 一致性；
- `kubectl diff` / ArgoCD：仓库期望状态与集群 live state 的比较。

它曾在 2026-09-22 作为 per-push 门禁接入，两天后撤下：首轮 50 条发现里 47 条是「正文里写的路径不存在」，这一项已搬进 `verify-context.sh` 的 `[PATH-REF]`，而当天真正咬人的漂移（Config Center 里 gorse 地址与 matrix 不一致）它看不到。决策见 [2026-09-24-path-refs-in-verify-context.md](../decisions/implemented/2026-09-24-path-refs-in-verify-context.md)。

Repowise 官方资料：<https://github.com/repowise-dev/repowise/blob/main/docs/architecture/ARCHITECTURE.md>、<https://github.com/repowise-dev/repowise/blob/main/docs/agent/MCP_TOOLS.md>。

## 什么时候用

- 清理死代码、找重复实现之前：`repowise dead-code`、`repowise health`；
- 评估一次改动的影响面：调用图、共变更、风险排序；
- 给 agent 做代码导航：MCP（只在本机、按需启动）。

结论一律回到代码核实：动态加载、路径别名（`@/`）、`package.json` exports、脚本和 CI 入口都会让它误报「不可达」，2026-09-23 那轮 52 个「不可达文件」里只有 6 个属实。

## 固定安装

仓库内的可复现环境在 `tools/repowise/`，版本锁为 `repowise==0.52.0`：

```bash
uv sync --project tools/repowise --locked
PATH="$PWD/tools/repowise/.venv/bin:$PATH" repowise --version
```

不要执行裸 `repowise init`：默认行为可能写入 editor 配置、MCP 配置、agent 文件或 Git hook。

## 建索引

```bash
PATH="$PWD/tools/repowise/.venv/bin:$PATH" bash scripts/verify-repowise.sh
```

脚本固定执行以下策略，建完索引后再跑 `repowise dead-code` / `repowise health` 等命令：

- `--mode fast`：图、Git、死代码、健康和漂移分析；不生成模型 prose；
- `--no-seed`：禁止在 linked git worktree 里用主仓库的 `.repowise` 做种子。否则结果会混入主工作树里未提交的修改：2026-09-23 同一个提交先后报出 4、1、0 条漂移；
- `--provider mock --embedder mock`：不调用外部 LLM 或 embedding provider；
- `DO_NOT_TRACK=1`、`REPOWISE_TELEMETRY_DISABLED=1`：关闭遥测；
- `--no-editor-setup --no-hook --no-claude-md --no-agents --no-codex --no-distill-hook`：不写 agent/editor 配置、不安装 hook；
- `--exclude .scratch/`：`.scratch/` 是 issue/spec 过程区，不是项目规范真相源；
- 当前仓库没有 COBOL 文件，脚本会屏蔽 Repowise 0.52.0 对未使用 COBOL grammar 的网络下载；一旦加入 `.cbl` / `.cob` / `.cobol` / `.cpy`，屏蔽自动取消。**直接跑 `repowise health` / `dead-code` 不经过这层屏蔽**，会重新卡在下载上；
- `doctor` 必须通过，索引记录的 commit 必须等于当前 `HEAD`；
- `doc-drift --min-confidence 0.90` 的结果与 `scripts/repowise-doc-drift-baseline.json` 对比。

`.repowise/` 和 `tools/repowise/.venv/` 已加入 `.gitignore`，不属于提交产物。

## 已知边界

- 只覆盖能从代码图解析的引用；Config Center 实际值、Secret、集群 live state 都不在它的证明范围内。
- `repowise health --refactoring-targets` 在本仓 5 分钟内跑不完（2026-09-23 实测），不要把它放进任何自动化。
- 版本升级必须同时改 `tools/repowise/pyproject.toml`、`tools/repowise/uv.lock`、脚本里的版本默认值和本文件。
