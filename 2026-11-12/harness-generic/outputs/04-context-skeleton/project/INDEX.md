---
name: INDEX
description: 项目级知识：本仓架构概览、模块职责、踩坑经验。替换 {{PROJECT_SLUG}} 后使用。
layer: project
module: {{PROJECT_SLUG}}
---

# project/{{PROJECT_SLUG}}/ — 本仓知识

| 文件/目录 | 管什么 | 何时读 |
|---|---|---|
| `architecture.md` | 本仓的分层与依赖方向 | 首次进入本仓、做大改前 |
| `modules.md` | 模块职责与边界 | 定位改动落点时 |
| `experience/` | 踩坑记录（见下） | 遇到反直觉行为时 |
| `{{PROJECT_DOC_N}}` | ... | ... |

## experience/ 的唯一格式

每条踩坑必须四段，缺一段就不算沉淀：

```markdown
---
name: <slug>
description: <一句话：什么现象、什么原因>
layer: project
module: {{PROJECT_SLUG}}
---

# <现象标题>

## 症状
<可观测到的错误/异常表现，含原样报错>

## 根因
<为什么会这样，指向具体文件:行>

## 关键陷阱
<下次最容易再犯的那一步>

## 证据
<命令、日志、issue/PR 链接>
```

> 「证据」段必须有可执行或可点开的落点。没有证据的踩坑记录无法复核，等于传言。
