---
name: repowise
layer: team
description: Repowise 的只读代码索引与文档漂移门禁；固定版本、无 LLM/遥测/editor 副作用，作为现有结构门禁的补充
affects:
  - scripts/verify-repowise.sh
  - scripts/repowise-doc-drift-baseline.json
  - tools/repowise/pyproject.toml
  - tools/repowise/uv.lock
  - .github/workflows/context-gate.yml
  - .gitlab-ci.yml
---
# Repowise 门禁

## 定位

Repowise 在本仓只承担两件事：建立可复现的代码/符号/依赖/Git 索引，以及检查它能解析到的文档引用是否发生漂移。它是**观察与导航层**，不是新的真相源，也不替代：

- `scripts/verify-context.sh`：知识库结构、死链、索引、嵌入投影和格式门禁；
- `backend/structcheck`：服务矩阵、网关接线和服务同构性；
- `scripts/verify-deploy-parity.sh`：Helm 与裸 manifest 的逐对象 parity；
- `kubectl diff` / ArgoCD：仓库期望状态与集群 live state 的比较。

Repowise 官方资料：<https://github.com/repowise-dev/repowise/blob/main/docs/architecture/ARCHITECTURE.md>、<https://github.com/repowise-dev/repowise/blob/main/docs/agent/MCP_TOOLS.md>。

## 固定安装

仓库内的可复现环境在 `tools/repowise/`，版本锁为 `repowise==0.52.0`：

```bash
uv sync --project tools/repowise --locked
PATH="$PWD/tools/repowise/.venv/bin:$PATH" repowise --version
```

个人全局 CLI 也可以安装同一版本：

```bash
uv tool install repowise==0.52.0
```

不要执行裸 `repowise init`：默认行为可能写入 editor 配置、MCP 配置、agent 文件或 Git hook。门禁入口已经显式关闭这些副作用。

## 门禁入口

```bash
PATH="$PWD/tools/repowise/.venv/bin:$PATH" bash scripts/verify-repowise.sh
```

脚本固定执行以下策略：

- `--mode fast`：图、Git、死代码、健康和漂移分析；不生成模型 prose；
- `--no-seed`：禁止在 linked git worktree 里用主仓库的 `.repowise` 做种子。否则结果会混入主工作树里未提交的修改：2026-09-23 同一个提交先后报出 4、1、0 条漂移。在 worktree 里自己重建 baseline 时也必须带上这个参数；
- `--provider mock --embedder mock`：不调用外部 LLM 或 embedding provider；
- `DO_NOT_TRACK=1`、`REPOWISE_TELEMETRY_DISABLED=1`：关闭遥测；
- `--no-editor-setup --no-hook --no-claude-md --no-agents --no-codex --no-distill-hook`：不写 agent/editor 配置、不安装 hook；
- `--exclude .scratch/`：`.scratch/` 是 issue/spec 过程区，不是项目规范真相源；
- 当前仓库没有 COBOL 文件，脚本会屏蔽 Repowise 0.52.0 对未使用 COBOL grammar 的网络下载；一旦加入 `.cbl` / `.cob` / `.cobol` / `.cpy`，屏蔽自动取消，grammar 安装失败就让门禁失败；
- `doctor` 必须通过，索引记录的 commit 必须等于当前 `HEAD`；
- `doc-drift --min-confidence 0.90` 的新结果必须被拦截。

脚本每次重建 `.repowise/` 本地索引；该目录和 `tools/repowise/.venv/` 已加入 `.gitignore`，不属于提交产物。

## 漂移基线棘轮

`scripts/repowise-doc-drift-baseline.json` 只冻结首次接入时已有、且能被 Repowise 解析的历史结果：

- 新增 finding：门禁失败；
- 已修复的 baseline finding：门禁也失败，要求从 baseline 删除；
- `.scratch/` 的 finding：明确过滤，不进入项目文档门禁；
- baseline 不表示这些历史引用正确，只表示它们尚未在本次接入中修复。

修复一条历史漂移后，同一提交删除对应 baseline 行，并运行 `scripts/verify-repowise.sh`。不要扩大 baseline 来消除新红；如果 Repowise 误判，先在决策或经验文档中记录证据，再讨论过滤规则。

## 与其他门禁的关系

- 文档链接、INDEX 覆盖、frontmatter、`embed` 投影：以 `verify-context.sh` 为硬门禁；Repowise 是额外的内容级引用检查。
- Helm/Kustomize 资源等价：以 `verify-deploy-parity.sh` 为硬门禁；Repowise 不理解 Kubernetes 对象语义。
- 服务拓扑：以 `.service-matrix.yaml` 和 `backend/structcheck` 为准；Repowise 的图不能把 `depends_on_planned` 当成已接线。
- 集群实况：以 `kubectl diff`、ArgoCD 和带日期的运行态验收为准；Repowise 不读取运行时/APM 数据。

## CI 接线

GitLab 的 `repowise-gate` 和 GitHub `context-gate.yml` 的同名 job 都运行同一份 `scripts/verify-repowise.sh`。两边都从 `tools/repowise/uv.lock` 安装，避免本地与远端只靠口头约定版本。

Repowise 索引会扫描较多文件，独立成 job，不塞进 `verify-quick.sh` 的 Go/前端/parity 并行组；本地需要验证时显式运行上面的入口。

## 已知边界

- 结果只覆盖 Repowise 能从代码图解析的引用；自然语言中的架构意图、Config Center 实际值、Secret 内容和集群 live state 不在它的证明范围内。
- 语言 grammar 可能需要 tree-sitter language pack；没有对应源码文件时的缺失 grammar 不应被当成业务漂移。索引命令本身失败仍然必须让门禁失败。
- 版本升级必须同时改 `tools/repowise/pyproject.toml`、`tools/repowise/uv.lock`、门禁版本默认值和本文件，并在 CI 与本地各跑一次；不要只改 PyPI 版本。
