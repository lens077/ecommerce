---
name: 2026-09-22-repowise-gate
layer: decisions
status: implemented
description: Repowise 以固定版本、无 LLM 的只读索引接入双远端文档漂移门禁
---
# 决策：Repowise 作为只读文档漂移门禁

## 问题

本仓已有 `verify-context.sh`、`structcheck`、部署 parity 和 live diff，能拦住结构性、生成投影和部署对象漂移，但内容中的「文档声称某个路径/符号仍存在」需要额外的代码图解析。Repowise 可以提供这层证据，但它本身也会写 editor 配置、hooks、模型 prose 和遥测，直接使用会制造新的副作用与口径来源。

## 决策

Repowise 以 `0.52.0` 固定在 `tools/repowise/pyproject.toml` / `uv.lock`，通过 `scripts/verify-repowise.sh` 接入 GitLab 和 GitHub 的 per-push 文档门禁：

- 使用 `--mode fast --no-prose --provider mock --embedder mock`，不调用 LLM 或 embedding 服务；
- 关闭 telemetry、editor setup、agent 文件、hooks、distill 和 key 保存；
- 排除 `.scratch/` 过程文档；
- 要求 `doctor` 通过、索引 commit 等于当前 `HEAD`；
- 以 `scripts/repowise-doc-drift-baseline.json` 实施新增失败、修复即删的棘轮。

Repowise 只提供引用漂移和代码导航证据，不成为真相源，不替换现有 `verify-context.sh`、`.service-matrix.yaml` / `structcheck`、`verify-deploy-parity.sh` 或 Kubernetes live diff。

## 考虑过的替代方案

- **只保留现有 `verify-context.sh`** — 它能机械检查链接、索引和嵌入投影，但不解析代码图，也不能发现可解析的自然语言路径/符号引用已经失效。
- **让 Repowise 生成 `AGENTS.md` / CLAUDE.md 并作为真相源** — 会与本仓 `AGENTS.md`、`context/` 和 `.service-matrix.yaml` 的职责分裂，重新引入第二套规范。
- **在 `verify-quick.sh` 内每次直接运行标准 prose 初始化** — 运行时间、LLM/key/网络副作用都不适合提交前快速锚点；因此拆成独立 CI job，使用 fast/no-prose 模式。
- **对所有 Repowise finding 立即清零** — 当前仓库包含历史决策、过程文档和已知失效引用，直接清零会把门禁接入与文档清债混为一次不可审查的大改动；先用 baseline 棘轮，只阻断新增。

## 后果

- CI 增加一个独立的 Repowise job，安装成本较高但不影响 Go/前端/parity 的并行快速组；本地显式运行 `scripts/verify-repowise.sh`。
- `.repowise/` 是可删除重建的本地缓存，不进 Git；`tools/repowise/.venv/` 也不进 Git。
- 仍需维护 Repowise 的锁文件和版本升级验证；grammar 下载或索引失败必须使门禁失败，不能静默放行。当前仓库没有 COBOL 文件，脚本只屏蔽未使用的 COBOL grammar 下载；一旦加入 `.cbl` / `.cob` / `.cobol` / `.cpy`，真实 grammar 加载失败会直接阻断。
- 该门禁不能证明运行态、Config Center、Secret、Kubernetes 对象或所有自然语言架构结论正确；这些继续由本仓已有真相源和专门门禁负责。
