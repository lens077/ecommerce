---
name: 2026-09-03-third-party-notices-regenerate
layer: decisions
status: implemented
description: THIRD_PARTY_NOTICES.md 由脚本从「真的编进制品」的依赖生成；依赖清单进暂存区时 pre-commit 重生成并 git add，verify-quick 只兜底新鲜度
---
# 决策：第三方许可声明"重生成而不是拒绝"

## 问题

仓库对外公开，却没有一份随代码走的第三方许可声明：SBOM 在 GitHub 发布链按 tag 生成，是机器可读的制品清单，
不在仓库里、不给人看、也不在 push 前出现。改依赖的人不会记得更新许可声明——deepseek-harness 的经验是
"CI 事后红只会多一轮往返"。首次生成还暴露了两件从没人知道的事：自有的两个 Go 库
`github.com/lens077/control-tower`、`github.com/lens077/go-connect-kit` 没有 LICENSE 文件；前端 sharp 的
`@img/sharp-libvips` 是 LGPL-3.0-or-later。

## 决策

`scripts/gen-third-party-notices.sh` 生成仓库根 `THIRD_PARTY_NOTICES.md`：

- **后端**只列 `go list -deps ./...` 实际链接进制品的模块（不用 `go list -m all`，那含大量只在 go.sum 里的间接模块），
  读模块缓存里的 LICENSE/LICENCE/COPYING 按关键句归类，识别不出标 UNKNOWN；
- **前端**用 `pnpm licenses list --json`（读 node_modules，含 dev 依赖），平台专属二进制包名里的平台段归一为
  `<platform>`——否则 macOS 生成、Linux CI 比对必然不一致；前端依赖未装时跳过该段并在文件里注明；
- 文首「需要人看一眼」段列出 UNKNOWN 与 copyleft（GPL/LGPL/AGPL/SSPL），**只显形不阻断**，是否允许由
  `docs/TECH.md` 的选型纪律决定；
- `--check` 模式重新生成并与已提交文件比对，不一致 rc=1。

接线：`frontend/.vite-hooks/pre-commit` 第 2 步——`go.mod`/`go.sum`/`package.json`/`pnpm-lock.yaml`/
`pnpm-workspace.yaml`/生成脚本本身进暂存区时重生成并 `git add`；生成失败算红（宁可拒绝提交，不提交一份漏掉后端的清单）。
`scripts/verify-quick.sh` 第四条并行 lane 跑 `--check`，只兜住绕过钩子的提交。

## 考虑过的替代方案

- **`go-licenses report ./...`** — 按包粒度重新构建全仓，10 个服务实测跑 10 分钟没跑完；`go list -deps` 0.5 s，
  许可证归类是几十行 case 语句，代价可接受。
- **只在 CI 里 `--check` 拒绝过期文件** — 就是"事后红多一轮往返"；生成是确定性的，没有理由让人手工做。
- **对 copyleft / UNKNOWN 直接阻断** — 首跑就有 LGPL（sharp 的 libvips，通常可接受）和自有库缺 LICENSE 两种
  截然不同的情况，阻断会把"要不要接受"这个人类决定藏进脚本；显形段 + 选型纪律是更诚实的位置。
- **不区分平台专属包，接受 macOS/Linux 各生成各的** — `--check` 在 CI 上恒红或必须关掉，门禁等于没有。

## 后果

- 依赖变更的提交自带一致的许可声明；`THIRD_PARTY_NOTICES.md` 是仓库里唯一给人看的第三方清单，SBOM 仍归发布链。
- 许可证识别是关键句启发式：新出现的许可证文本会落成 UNKNOWN，扩识别规则时改 `classify()` 并重生成。
- 每次 `pnpm install` 后 `pnpm licenses` 的结果可能变（间接依赖升版），`--check` 会要求重生成——这是预期的。
- 钉住行为的验证（2026-09-03 实测）：暂存 `pnpm-workspace.yaml` 经 `_/pre-commit` 分发器跑钩子 → NOTICES 自动进暂存区；
  向 NOTICES 追加一行 → `--check` rc=1，重生成 → rc=0；`verify-quick.sh backend` 四路绿。尚无自动 canary。
