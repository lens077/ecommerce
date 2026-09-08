---
name: 2026-09-03-pre-push-verify-quick
layer: decisions
status: implemented
description: push 前跑 scripts/verify-quick.sh；钩子沿用 vite-plus 分发器而不引入 lefthook；只推 tag / 删分支放行，SKIP_VERIFY=1 绕过
---
# 决策：推送前门禁跑 verify-quick，钩子沿用 vite-plus

## 问题

提交路径上有 gitleaks 与暂存 lint（pre-commit），CI 两侧有 backend-gate / frontend-gate，但**本机 push 这一步没有任何校验**：
`go build/vet/test -short` 与 `pnpm ready` 靠人（和 agent）"记得跑 `verify-quick`"。push 是代码离开本机、别人和 CI 会看到的边界，
一次忘跑就是一次红流水线加一轮返工。deepseek-harness 在同一位置用 lefthook 的 `pre-push` 跑 `pnpm run typecheck`，证明这道门禁值得。

## 决策

`frontend/.vite-hooks/pre-push` 在每次 `git push` 前运行 `scripts/verify-quick.sh`（后端 go build/vet/test -short ‖ 前端
`pnpm ready` ‖ 凭据扫描，三路并行，绿只打一行，红打失败段尾部）。钩子由既有的 vite-plus 分发器 `frontend/.vite-hooks/_/h`
调起（`core.hooksPath=frontend/.vite-hooks/_`，`vp config` 在 `frontend/ pnpm install` 时设置），cwd 是仓库顶层。

读 git 经 stdin 传入的 ref 列表：**只推 tag** 或**只删远端分支**（local sha 全零）时没有新代码进远端，直接放行；其余一律跑。
绕过：`SKIP_VERIFY=1 git push`，须在提交/MR 信息里说明——与 pre-commit 的 `SKIP_GITLEAKS=1` 同一套路。
工具链登记在 [git-commit.md](../../team/git-commit.md)「校验工具链」。

## 考虑过的替代方案

- **引入 lefthook（照搬 deepseek-harness）** — 本仓已有 vite-plus 钩子；两套系统会争 `core.hooksPath`，
  抢输的那套静默失效——commitlint 钩子 2025-11 到 2026-08 就是这样丢了九个月（见 git-commit.md）。
  分发器 `_/pre-push` 早已存在，只缺被分发的脚本，补一个文件即可。
- **放进 pre-commit** — verify-quick 是分钟级全量（实测 41 s，前端冷缓存时 72 s），提交要快；
  pre-commit 只做秒级的 gitleaks + 暂存 lint，全量留给"离开本机"的边界。
- **只跑 `go build && go vet` + `vp lint`，不跑测试** — 更快，但漏掉 structcheck（它在 `go test -short` 里），
  而 structcheck 正是 push 前最该拦的结构漂移；如果耗时成为问题再降级，降级时改本文件。

## 后果

- 每次分支 push 多等约 40 s；CI 红流水线的常见原因（没跑本地锚点）在本机就被拦下。
- 推 tag 不受影响，发布链（GitHub tag 触发）节奏不变。
- 门禁依赖本机装了 go / pnpm / gitleaks；工具缺失时 verify-quick 的 secrets 通道直接红，不降级，
  与 gitleaks 硬门禁的原则一致（见 [2026-09-02-gitleaks-hard-gate.md](2026-09-02-gitleaks-hard-gate.md)）。
- 钉住行为的验证：通过 `_/pre-push` 分发器分别模拟只推 tag、删分支、`SKIP_VERIFY=1` 三条早退路径均 rc=0，
  模拟分支推送走完整 verify-quick 三路绿（2026-09-03 实测）。尚无自动 canary；改钩子后按上述四条手工复验。
