---
name: 2026-09-11-spec-reverse-index-and-selfcheck
layer: decisions
status: implemented
description: 规范文档用 frontmatter `affects:` 登记反向依赖、`spec-impact.sh` 双向查影响；实现单关单必须带可验证的「完成自检」；验收标准必须落在五种可判定形态之一
---
# 决策：规范↔实现的反向索引、可验证的验收标准与完成自检

## 问题

本仓的 harness 一直在回答「动某类代码前读哪份文档」（runbook §0.1），但三件反向的事没有机制：

1. **规范改了，按旧规范写的实现没人回头看。** `context/` 与 `docs/design/` 的约束改动后，唯一的传播路径是
   下次有人恰好读到；错误格式后来加了 `trace_id`、早期接口没跟——这种漂移既不报错也不出现在任何 diff 里。
2. **「已完成」没有证据。** AGENTS.md 硬规则 8 要求「如实说明测了什么、没测什么」，但它是一句要求，不是一个格式；
   `.scratch/<feature>/issues/` 的实现单没有关单条件，AI 写完代码就宣布完成是最常见的假成功。
3. **验收标准写成形容词。** 「保证安全」「性能要好」「处理好边界」人和 AI 都无法判定，
   AI 会用「代码能跑、测试能过」替代它——测试也是它自己写的。

三条都来自对 [JavaGuide《Spec Coding 规范驱动编程实战》](https://javaguide.cn/ai-coding/practices/spec-coding.html)
的对照：它讲的其余做法（规范进 Git、三色权限、Never 规则推进到 CI、单会话单任务）本仓已有，缺的正是这三处。

## 决策

**反向索引。** `context/**` 与 `docs/design/**` 的 frontmatter 可带 `affects:` 块列表，登记「实现或受本文约束」的
仓库相对路径（文件或目录，不支持 glob）。`scripts/verify-context.sh` 的 `[AFFECTS]` 检查要求每个路径真实存在。
`scripts/spec-impact.sh [git-diff 范围]` 双向查：改了文档 → 列出登记的实现点并给出验证命令；改了代码 → 列出声明依赖它的文档。
只读、退出码恒 0，不阻断。首批登记四份（proto-design / deploy-parity / db-migrations / git-commit），
其余在写规则或 experience 时顺手登记，**不做一次性全仓补全**。约定全文在
[knowledge-layering.md](../../harness-framework/knowledge-layering.md)「frontmatter 与 `affects:` 反向索引」。

**完成自检。** 实现单新增终态 `Status: done`（[triage-labels.md](../../../docs/agents/triage-labels.md)，不在 mattpocock 五角色内）。
标 `done` 的单必须有 `## 完成自检`，每条 `- [x]` / `- [ ]` 用 `——` 接证据或原因；未验证项保留并写原因，不许删行。
`verify-context.sh` 的 `[SELFCHECK]` 强制。模板在 [issue-tracker.md](../../../docs/agents/issue-tracker.md)。

**验收标准形态。** `spec.md` 与每张实现单的 `## 验收标准` 每条必须是「命令+期望结果 / 请求+状态码 / 数字+单位+阈值 /
文件断言 / 具名测试」五种之一；列出禁用的形容词写法与改写示例。**只有约定，没有门禁**（见后果）。

## 考虑过的替代方案

- **Spec 变动时 CI 自动跑受影响模块的测试**（文章原建议） — 本仓 CI 只由发布 tag 触发且跑全量测试，
  按文档改动裁剪测试范围没有收益；本地 `spec-impact.sh` 给出命令、由人跑，够用且不需要在 CI 里解析 frontmatter。
- **`affects:` 支持 glob** — glob 无法做存在性检查，一条 `backend/services/**` 等于没登记；
  目录已经表达「其下全部」，够用。
- **把「完成自检」写进 AGENTS.md** — AGENTS.md 已到 13991 / 14000 字节的预算上限（`[BUDGET]`），
  且它是行为基线不是模板容器；放 issue-tracker.md（mattpocock 系列 skill 读的正是这份）并在 runbook §0.1 / §6 挂指针。
- **给验收标准也加门禁**（扫描形容词黑名单） — 自由文本上的正则误报率高，会逼人改措辞而不是改内容；
  先靠约定与 `/to-tickets` 生成时遵循，观察一段时间再决定是否机械化。
- **用 `resolved` 复用 wayfinder 的关单状态** — `resolved` 语义是「研究问题有答案」，答案写在 `## Answer`；
  实现单需要的是「验收对上了证据」，混用会让 `[SELFCHECK]` 误伤研究单。

## 后果

- 改 `context/` 或 `docs/design/` 的人多一步：跑 `spec-impact.sh`，把命中的实现点核对一遍。当前只有四份文档登记，
  命中面小；随登记增加，这一步的价值与成本同步增长。
- 登记的路径被删或搬家时，`verify-context.sh` 立即红，逼人同步改索引——这是刻意的：指向已删路径的索引比没有更糟。
- 实现单多一个 `done` 状态与一个必填小节；研究类子单不受影响。
- 钉住行为的验证：`verify-context-canary.sh` 新增五个探针——`affects-dead`、`affects-glob`、`selfcheck-missing`、
  `selfcheck-no-evidence` 四个红探针，`selfcheck-ok`（含带原因的未勾选项）一个假阳性守卫。
- 事故与验证过程见 [evolution-log.md](../../harness-framework/evolution-log.md) 2026-09-11 条目。
