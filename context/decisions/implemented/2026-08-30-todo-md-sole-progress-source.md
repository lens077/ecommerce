---
name: 2026-08-30-todo-md-sole-progress-source
layer: decisions
status: implemented
description: TODO.md 是唯一进度真相源；PROGRESS.md 双文档（08-13）与 kaneo 看板（08-30）都已下线，[PROGRESS-SRC] 门禁挡住第二套进度视图
---
# 决策：进度只有一处真相——`TODO.md`

## 问题

进度视图只要有两处就会漂移，而漂移的那一份带着"最后更新：今天"的头部提供过期数字，比没有更糟。
本仓两次验证了这一点：`docs/PROGRESS.md` 与 `TODO.md` 双写，"每次改动两份都要更新"的硬性要求在没有验证器兜底下
5 天内断裂（08-08 后无实质更新，服务数修正漏掉 3 处，可观测性描述整体落后一轮）；kaneo 看板作为执行态镜像，
留着半截的同步 skill 与脚本，下一个照做的 agent 只会撞上已经不存在的后端。两次事故的经过见
[evolution-log 2026-08-13](../../harness-framework/evolution-log.md) 与 2026-08-30 条。

## 决策

`TODO.md` 是**唯一**进度真相源，硬规则 #3 要求每次提交前先更新它，因此它有独立的强制时机。
待办明细按 `docs/TECH.md` 体系分类在 `docs/todo/`，属于同一体系的细分而非第二份视图。

不再存在的东西：`docs/PROGRESS.md`（归档为带废止横幅的 `docs/progress-archive/PROGRESS_ARCHIVE_20260813.md`，
制度文件 `progress-and-todo.md` 已删）；kaneo 看板（`.claude/skills/kaneo-sync/`、`.claude/kaneo-mcp.json`、
`scripts/kaneo/`、node1 上的容器 / 数据卷 / 网络、Pangolin 资源 `kaneo.apikv.com` 全部删除）。
**不要重建"按需挂载看板 MCP"**——2026-08-21 token 治理曾把它写成长期约定，那条约定已随看板一起作废。

机械守卫是 `scripts/verify-context.sh` 的 `[PROGRESS-SRC]`：复选框（`- [ ]` / `- [x]`）只允许出现在
`TODO.md`、`docs/todo/`、不可变归档（`docs/progress-archive/`、`docs/reports/`）、`.scratch/` 与围栏代码块内；
别处出现即第二套进度视图。存量按计数冻结在 `scripts/context-progress-baseline.txt`，只许降不许升。
`TODO.md` 本身受 `[BUDGET]`（≤ 96000 字节）约束，超限把证据长文按日期归档进 `docs/progress-archive/`，不提额度。

## 考虑过的替代方案

- **保留 PROGRESS.md 作为"评估视图"，TODO.md 作为"执行视图"** — 评估视图没有独立的强制更新时机，
  也没有验证器能判断它是否过期；它的滞后是结构性的，不是纪律问题。
- **保留 kaneo 看板作为执行态镜像，靠 `kaneo-sync` skill 同步** — 镜像不损失真相源，但同步链每轮对话常驻 MCP Schema
  却只有一个 skill 使用（08-21 已实测），用户裁决停用；留半截接线比删干净更糟。
- **只写规则、不加门禁** — 2026-08-29 实测 `docs/TECH.md` §12 自己长出 19 个复选框且已漂移（P1/P2 各勾一项，
  P0 九项全空），说明"不要另建进度视图"靠自觉守不住。

## 后果

- 想看进度只有一个地方；想改进度也只有一个地方，提交前必改。
- 任何文档里写 `- [ ]` 都会被门禁拦，模板占位符要放进围栏代码块（SCAFFOLD.md 的写法）。
- `TODO.md` 会持续膨胀，定期归档是维护成本；08-21 它曾到 199 KB，立预算后靠归档控制。
- 钉住行为的验证：`verify-context-canary.sh` 的 `progress-src` / `progress-grow` / `progress-ratchet` 红探针，
  `progress-fenced-ok` 与 `budget-todo` 守卫。
