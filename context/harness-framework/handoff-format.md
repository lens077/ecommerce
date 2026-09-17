---
name: handoff-format
layer: harness-framework
description: 上下文交接的内容契约——自动压缩保留清单、跨会话/子代理交接文档、.scratch/<slug>/HANDOFF.md 三处共用同一份八段模板；只定义「保留什么、丢什么」，生产动作交给 /handoff 或 DSH 压缩插件
---

# 交接格式：压缩与交接共用一份内容契约

## 解决什么

三件事本质相同——**把一段长上下文压成下一段上下文的起点**：

1. DSH 自动压缩（`compaction-basic`，阈值见 [dsh-model-onboarding.md](dsh-model-onboarding.md) §4）；
2. 会话结束或换人时的交接文档（本机 `/handoff` skill 生成，或 `.scratch/<slug>/HANDOFF.md`）；
3. 子代理回主会话的结构化摘要（[subagent-dispatch.md](subagent-dispatch.md) 约定一）。

此前只规定了「要做」（[multi-agent-concurrency.md](multi-agent-concurrency.md) 纪律一「状态用文件同步」、
subagent-dispatch「只回结构化摘要」），没规定「同步什么、摘要里必须有什么」。没有契约，
压缩摘要各写各的：有的丢掉用户偏好，有的把原始工具输出整段带过去，最贵的一种是
把「未提交产出清单」漏掉——2026-09-11 一次 `git checkout --` 抹掉了另一会话未提交的产出，
事后只能靠会话记录恢复（见 evolution-log 2026-09-11 条目）。

## 八段模板

```markdown
## 任务目标            用户原话 + 后来的澄清；目标改过要写改前改后
## 已完成              每条带验证命令与结果（「跑了 X，rc=0」），不写「应该没问题」
## 当前状态            正在改哪个文件、卡在哪一步、下一步动作是什么
## 关键决策            做了什么选择、否决了什么替代方案、为什么——与 decisions/ 同口径
## 未决问题 / 已知约束  还没答案的问题；环境限制（沙箱、权限、不可用能力）
## 用户偏好            本会话里用户纠正过的做法、明确说过的「以后不用问」
## 未提交产出清单      工作树里所有未 commit 的路径（git status --short 原样贴）
## 消费小票            请求数 / 总 token / 缓存 token / subagent 数（对齐 AGENTS.md 消费边界）
```

**预算 ≤ 600 token**（英文 ≈ 2400 字符，中文 ≈ 900 字）。超了先删「已完成」里的过程描述，
再删「关键决策」里的推理，**永远不删「未提交产出清单」和「当前状态」**。

## 丢什么

- 原始工具输出（文件内容、测试全量日志、API 响应）——需要时下一段上下文自己重读；
- 重复的尝试（同一命令跑三次只留最后一次的结论）；
- 错误轨迹（失败的方向只留一句「试过 X 不行，因为 Y」，不留报错原文）；
- 已经写进文件的内容——引用路径，不复制正文（`/handoff` skill 的同一条规则）。

## 三处怎么用

| 场景 | 生产者 | 落点 | 差异 |
|---|---|---|---|
| DSH 自动压缩 | `compaction-basic` 插件 | 会话内 | 「未提交产出清单」「消费小票」由插件可得的信息填，填不出就写「未知」，不省略段 |
| 会话交接 | `/handoff` skill 或手写 | 系统临时目录（skill 默认）或 `.scratch/<slug>/HANDOFF.md`（需入库时） | 加一节「建议加载的 skill」（skill 已要求）；`.scratch` 版首行加 `Status:`（[triage-labels.md](../../docs/agents/triage-labels.md)） |
| 子代理回报 | 子代理 | 主会话 | 只需「已完成 / 关键决策 / 未决问题」三段 + `file:line` 引用（subagent-dispatch 约定一）；其余段不适用 |

## 关键陷阱

**「已完成」不带验证命令，交接方会把它当成事实。** 实测：交接文档写「测试已通过」，接手方跳过重跑，
而那次通过是在改动之前跑的。带命令的写法让接手方 5 秒复验（同 [live-facts.md](../team/live-facts.md) 的「不变量 + 查法」）。

**未提交产出不写进交接，下一个会话会把它当垃圾清掉。** `git status --short` 原样贴，不要「有几处小改动」。
