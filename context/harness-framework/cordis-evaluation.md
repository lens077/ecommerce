---
name: cordis-evaluation
layer: harness-framework
description: 已评估「参照 deepseek-harness 把 harness 底层改成 Cordis 插件框架」，结论暂不采用——再有同类提议先读这里的理由与重评条件
---

# Cordis 化评估：暂不采用

- **评估日期**：2026-08-19
- **提议**：参照 deepseek-harness（DSH，`deepseek-ai/deepseek-harness`）「Everything is a Plugin」的架构，把本仓 harness 的底层改成 [Cordis](https://github.com/cordiverse/cordis) 插件框架。
- **结论**：暂不采用。继续借鉴 DSH 的仓库工程实践（已在做，见 [evolution-log.md](evolution-log.md) 2026-08-18 的两条）；本条否决的只是「引入 Cordis 作为运行时底座」这一件事。

## 前提：两个 harness 不在同一层面

本仓的 harness 是「文件 + 脚本 + CI 检查」：`AGENTS.md` 硬规则、`context/` 三层知识库、`.service-matrix.yaml` + `backend/structcheck/`、`scripts/verify-*` 门禁与基线、hooks 和 skills。它们的组合发生在 git 仓库和 CI 里，没有属于本仓的长驻进程；真正执行 agent loop 的运行时是外部工具（Claude Code / Codex CLI / Cursor …）。

DSH 的 harness 是一个长驻 TypeScript 进程，agent loop、模型适配器、工具注册表、session log 都跑在自己进程里。Cordis 解决的正是这种进程内的运行时组合：插件热挂载/卸载、可逆效应（插件卸载时注册自动回退）、typed events、profile/bundle 分层配置替换。

## 暂不采用的理由

1. **问题域不存在**。Cordis 的能力只对进程内组件有意义；markdown 规范、bash 门禁和 Go 结构性测试不需要热插拔，需要的是在 CI 里稳定执行。
2. **运行时不归本仓所有**。「底层换 Cordis」唯一的实现路径是自建 dsh / pi 式 agent 运行时来替代外部工具——那是独立的大型项目，且会丢掉「多工具共同基线」：纯文件形态恰是本 harness 能同时约束多个 agent 工具的原因。
3. **栈与成熟度错位**。本仓门禁是 bash + Go；DSH 于 2026-08-13 进入 developer preview，官方明示会有兼容性破坏变更。把 harness 里最稳定的层绑到最不稳定的生态上，方向相反。
4. **分层组合的思想已用文档形态实现**。三层知识库对应 bundle 分层，用户级 hook / `AGENTS.md` / skill 项目覆盖对应 patch 层，反向棘轮基线对应可审计豁免，evolution-log 对应带事故理由的变更史。同构的是理念，不需要同构实现。

## 与「借鉴 DSH」的边界

- **已采纳并继续**：仓库工程实践与理念级做法（`CLAUDE.md -> AGENTS.md` symlink、`context/` 结构门禁等）。
- **本条否决**：引入 Cordis 运行时框架，或为此自建 agent 运行时。

## 重新评估的触发条件

满足任一条件时重评：

- 决定自建 agent 运行时（独立项目，不是本仓改造）。届时 Cordis 与 Pi（`earendil-works/pi`）的极简路线一起选型。
- DSH 结束 preview 后想要它的运行时收益（append-only session log 的 resume / fork / replay、Web UI、headless runner）。正确姿态是把 `dsh` 作为又一个消费本 harness 的运行时接进来——读同一份 `AGENTS.md` 和 `context/`——并先在 ecommerce 之外的沙盒实测。

## 状态更新

**2026-08-24**：第二条触发条件已发生——本仓已在 DSH 运行时下跑真实任务，`dsh` 确实是作为「又一个消费本 harness 的运行时」接入的，读同一份 `AGENTS.md` 与 `context/`，与上面预设的姿态一致。
**结论不变**：这验证的是「纯文件形态的 harness 能被多运行时共同消费」，恰好是暂不采用 Cordis 的理由 2；真要重评仍需第一条触发（决定自建 agent 运行时）。
