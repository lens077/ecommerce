---
name: kaneo-sync
description: 双向同步 TODO.md 与 Kaneo「备忘录」看板 — 用户说"同步看板/kaneo 同步/把 TODO 同步到 kaneo/回写 TODO"时使用。TODO.md 是进度真相源，Kaneo 是执行态看板。
---

# TODO.md ↔ Kaneo 双向同步

## 真相分工（先读懂再动手）

- **TODO.md 是进度真相源**：做没做成、为什么这么做、验收证据都在这里。
- **Kaneo 是执行态看板**：状态流转（to-do → in-progress → in-review → done）在 Kaneo 上做。
- **新任务同时建到两边**：先写进 TODO.md（对应章节），再建进 Kaneo。
- **阶段性成果回写 TODO.md**：Kaneo 挪到 done 的任务，把 TODO.md 对应条目勾选/改标记，并补一句结论。

固定参数：
- workspace `26nJ8z3Apj4eRsN0m56Bo1hNXrSRlhED`（Sumery）
- project `leu92oiuymkh862btnbhubli`（备忘录，slug `back`）
- 列 slug：`to-do` / `in-progress` / `in-review` / `done`

## 前置：按需启用 kaneo MCP（2026-08-21 起不再全局常驻）

kaneo MCP 已从 `~/.claude.json` 用户级注册移除——它的工具 Schema 曾在**所有项目的每轮
对话**里常驻计费，而只有本技能用得到。配置收在仓库 `.claude/kaneo-mcp.json`（只有 URL，
无凭据）。若当前会话没有 `mcp__kaneo__*` 工具，先让用户以按需方式启动会话：

```bash
claude --mcp-config .claude/kaneo-mcp.json   # 仅本次会话挂载 kaneo
```

或临时注册、用完即删：`claude mcp add --transport http kaneo https://kaneo.apikv.com/api/mcp`
→ 同步完 `claude mcp remove kaneo`。**不要**把它加回用户级常驻配置。

## 同步流程

1. **提取本地清单**：
   ```bash
   python3 scripts/kaneo/extract_todo.py TODO.md > /tmp/kaneo_payload.json
   ```
   输出数组每元素含 `title`（匹配键）/ `description` / `status` / `priority` / `todo_line` / `todo_marker`。

2. **取远端清单**：`mcp__kaneo__list_tasks`（limit 100，翻页取完）。任务量大时把第 3-4 步交给子代理做，别把全量任务灌进主上下文。

3. **对账（title 精确匹配）**：
   - 本地有、Kaneo 没有 → `create_task` 补建（新任务进 `to-do`）。
   - Kaneo 有、本地没有 → **不删**，列出来问是不是该补进 TODO.md（可能是直接在看板上建的新任务——按约定它也该进 TODO.md）。
   - 双方都有 → 比状态，按下面的规则合流。

4. **状态合流规则**：
   | TODO.md | Kaneo | 动作 |
   |---|---|---|
   | ✅/[x] | 非 done | Kaneo 挪到 done（TODO.md 说了算） |
   | ⬜/[ ]/🟡 | done | **回写 TODO.md**：checkbox 打勾 `[x]`，表格行改 ✅；说明列补一句结论（不知道结论就先标 ✅ 并留 `<!-- 待补结论 -->`） |
   | ⬜/[ ] | in-progress / in-review | 不动 TODO.md（执行态只住在 Kaneo）；若 TODO.md 是表格行可顺手改 🟡 |
   | 🟡 | to-do | Kaneo 挪到 in-progress |

5. **回写后自检**：重跑 extract_todo.py 确认条目数没有意外增减，`git diff TODO.md` 过一眼再落。

## 硬约束

- 匹配键是生成的 title（`[标签] 原标题`）。**别改 extract_todo.py 的 tag/标题规则**，改了等于把既有映射全部作废。
- 回写 TODO.md 只改状态标记与追加结论，**不重排、不删说明正文**。
- Kaneo 侧不删任何不认识的任务。
- 本技能不做 git 提交；改完 TODO.md 由用户决定何时提交。
