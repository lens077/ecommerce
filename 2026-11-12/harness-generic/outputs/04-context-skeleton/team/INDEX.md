---
name: INDEX
description: 团队级约束：跨项目的设计规范、提交规范、运行环境契约、发布闸口。
layer: team
---

# team/ — 团队级约束

| 文件 | 管什么 | 何时读 |
|---|---|---|
| `proto-design.md` | 契约设计规范（字段校验、命名、兼容性） | 改 proto / OpenAPI / 消息 schema 前 |
| `git-commit.md` | 提交信息规范与 type 枚举 | 写提交信息前 |
| `runbook.md` | 按改动类型路由的必读清单 | 动手前最后一次核对 |
| `local-env.md` | 本地环境的**查法**（不存运行态快照） | 需要知道工具版本/端口时 |
| `{{TEAM_DOC_N}}` | ... | ... |

> 团队级文件必须是**跨项目成立**的。任何绑定单一仓库目录或服务名的内容，下沉到 `project/<name>/`。
