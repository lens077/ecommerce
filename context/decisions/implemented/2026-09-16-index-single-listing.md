---
name: 2026-09-16-index-single-listing
layer: decisions
status: implemented
description: 逐篇清单只维护在各层自己的 INDEX.md；根 context/INDEX.md 降为「该进哪一层」的路由，AGENTS.md 的层表也改为指针
---
# 决策：逐篇清单只维护一处，根 INDEX 降为路由

## 问题

`context/INDEX.md` 曾为 team 与 harness 两层各维护一份逐篇清单（共 5817 B，占全文 46%），
而这两层自己的 `INDEX.md` 里也有一份——同一批文档被描述两次，措辞已经分叉。
project 层从一开始就写明「逐篇清单只维护在 `project/ecommerce/INDEX.md` 一处」，team/harness 没有跟。

代价不是抽象的重复，是**新文档在第一跳隐形**：`ORPHAN` 门禁只强制「文件必须登记进所在层的 INDEX」，
管不到根 INDEX。2026-09-16 实测 `host-watchdog.md`、`live-facts.md`、`sgh-implementation-plan.md`
三份在层 INDEX 里有、在根 INDEX 里没有——按「先看根 INDEX 再逐层缩小」的检索约定走，这三份不存在。

`AGENTS.md` 的「知识索引」四行层表是同一份内容的第三个副本。

## 决策

**根 `context/INDEX.md` 只回答「该进哪一层」**：一张四行表（层 / 入口 / 什么时候进来 / 这层的 INDEX 额外回答什么），
加两个最常用入口（runbook、evolution-log 索引）。逐篇清单一律在层 INDEX，与 project 层口径统一。

**`AGENTS.md` 的层表删掉**，改为一句指向 `context/INDEX.md` 的指针——顺带为 `[BUDGET]` 腾出余量。

层 INDEX 保留各自更丰富的列（team 是三列，多一列「违反的后果」；harness 是两列），
因为第二跳要回答的问题与第一跳不同：第一跳问「进哪层」，第二跳问「读哪篇、不读会怎样」。

## 考虑过的替代方案

- **根 INDEX 的表由脚本从层 INDEX 生成 + 门禁比对**（照搬 evolution-log 索引那套）——保住「一跳看见全部文档」，
  但要多一个生成器和一道门禁，且「一句话」措辞就此与层 INDEX 统一，第一跳与第二跳的分工消失。
  漂移用结构消除比用门禁消除便宜，故不采用。
- **保留两份，只加一道「文件集合必须相等」的门禁**——改动最小，但加一份文档仍要写两处，
  且门禁只能保证「都登记了」，保证不了两处描述不矛盾。
- **反过来：根 INDEX 持有完整清单，层 INDEX 降为指针**——层 INDEX 的「违反的后果」列是真正被用来做判断的内容，
  搬到根会把第一跳撑大到现在这个规模，方向反了。

## 后果

- 根 `context/INDEX.md` 12575 B → 7840 B，表格行 37 → 4；第一跳成本降约六成。
- 浏览 team 文档多一跳。按改动类型找文档的主路径是 runbook §0.1，不经过这里，所以主路径不受影响。
- 新增文档只需登记一处，`ORPHAN` 门禁已经强制那一处，不需要新门禁。
- 事故与验证见 evolution-log.md 2026-09-16 条目。
