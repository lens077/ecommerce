---
name: INDEX
description: 框架级：AI 协作机制本身——上下文分层、门禁设计、自纠偏、可移植性。
layer: harness-framework
---

# harness-framework/ — 门禁机制本身

| 文件 | 管什么 | 何时读 |
|---|---|---|
| `context-engineering.md` | 分层、预算、索引写法 | 新增/整理知识文件时 |
| `e3-execution.md` | 先估计→最小执行→失败才扩张 | 任务规模判断失准时 |
| `self-refinement.md` | 踩坑沉淀的判据与写法 | 想把教训写进仓库前 |
| `portable-harness.md` | 换仓复用方式与采纳步骤 | 新仓接入前 |
| `gate-design.md` | 门禁有效性判据（元评测、fail-closed、棘轮） | 新增或修改检查项前 |
| `{{FRAMEWORK_DOC_N}}` | ... | ... |

> 本层的文件**不含任何项目事实**。若某条内容离不开具体服务名或目录，它属于 `project/<name>/`。
>
> 唯一例外是「已知失效模式」：可以写具体事故（如某钩子静默失效九个月），但必须脱敏成可复用的判据。
