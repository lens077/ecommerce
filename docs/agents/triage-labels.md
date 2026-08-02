# Triage Labels

各个 skill 用五个标准 triage 角色说话。本文件把这些角色映射到本仓库 issue tracker 里
实际使用的字符串。

| Label in mattpocock/skills | 本仓库使用的字符串 | 含义                     |
| -------------------------- | ------------------ | ------------------------ |
| `needs-triage`             | `needs-triage`     | 需要维护者评估这张单     |
| `needs-info`               | `needs-info`       | 等待提出者补充信息       |
| `ready-for-agent`          | `ready-for-agent`  | 描述完备，可交给 AFK agent |
| `ready-for-human`          | `ready-for-human`  | 需要人来实现             |
| `wontfix`                  | `wontfix`          | 不会处理                 |

沿用默认值，两列一致。

## 本仓库的承载方式

本仓库用的是**本地 markdown** tracker（见 `docs/agents/issue-tracker.md`），没有 tracker 侧的
label 机制。因此「打标签」= 写/改 issue 文件靠顶部的 `Status:` 行，值取上表右列：

```markdown
# 修复网关 JWT nbf 时钟偏移

Status: ready-for-agent
```

一张单同一时刻只有一个 `Status:` 值。当某个 skill 提到某个角色（例如「apply the AFK-ready
triage label」），就把 `Status:` 改成上表对应的字符串。

想换一套词表，直接改右列即可。
