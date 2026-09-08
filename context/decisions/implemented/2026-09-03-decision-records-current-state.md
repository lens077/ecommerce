---
name: 2026-09-03-decision-records-current-state
layer: decisions
status: implemented
description: 决策理由从 evolution-log 编年史里分离出来，改为每决策一文件的当前状态文档；三条硬规则由 [DECISION] 门禁守着
---
# 决策：决策记录是当前状态文档，不是编年史

## 问题

`context/` 记录规则是什么，`TODO.md` 记录进度，`evolution-log.md` 记录"这条规则为什么是现在这个样子"。
日志是按日期追加、永不改写的编年史，到 2026-09-03 已有 52 条、1000 余行。它保住了"触发事故"这个不可替代的信息，
但读者要回答"现在这个决定是什么、当初打败了谁"时，得从几十条日志里自己拼：同一个主题散在多条（进度真相源
分别在 08-13、08-21、08-30 三条里），叙述里混着"原本 / 现在 / 不再"的相对时间，而且没有一条要求写下**被否决的替代方案**——
`.service-matrix.yaml` 头注里记着的教训正是这种缺失：kafka 的 note 留着一句已被 `docs/TECH.md` 推翻的旧决策，
AI 查拓扑时把它当成了现行结论。

## 决策

新增知识层 `context/decisions/`，一个决策一个文件，**路径即状态**：`proposed/`、`implemented/`、`rejected/`，
目录移动就是状态变更；文件名 `YYYY-MM-DD-slug.md`，日期是首次提出日。`implemented/` 用现在时描述已交付事实，
并随代码**同步改写**（路径、键、默认值变了就改这里），不追加历史。evolution-log 保留原职责：按日期追加事故与验证手段，
两处互相链接。

格式与三条硬规则写在 [decisions/INDEX.md](../INDEX.md)，由 `scripts/verify-context.sh` 的 `[DECISION]` 检查机械执行：
`status:` 与目录一致；按状态要求的小节齐全；「考虑过的替代方案」必须非空（迁入的旧决策可用
`alternatives-not-recorded` 标记，只对 2026-09-03 之前的日期放行——替代方案只能记录不能编造）；
`implemented/` 不得残留 `## 提案` / `## 计划` / `## 迁移计划` / `## 验收标准` / `## 风险` 这些提案期标题。
`verify-context-canary.sh` 为该检查各加了红探针与一道假阳性守卫。

首批迁入六条：本条、pre-push 门禁、gitleaks 硬门禁、两远端 CI 职责、TODO.md 唯一进度源、lint 基线棘轮。
其余 40 余条日志条目**按需迁**：某条规则再次被质疑、或被改动时，先为它建决策文件，再动规则。

## 考虑过的替代方案

- **只保留 evolution-log，给每条补一段「替代方案」** — 解决不了"当前状态要从多条日志里拼"的问题：日志的单位是**一次改动**，
  决策的单位是**一个主题**，同一主题被改三次就是三条；而且日志的纪律是永不改写，与"随事实同步"天然冲突。
- **把决策写成 `docs/reports/` 里的带日期报告**（已有 `2026-08-29-descheduler-decision.md` 这种） — reports 的定义是
  一次性证据，不维护、不扫退役横幅与实测日期门禁；决策一旦写进去就开始腐化，与日志同病。
- **放在 `context/harness-framework/` 下的子目录** — 那一层的范围是"AI 协作机制本身"，而选型、CI 职责、真相源归属
  这些决策跨团队级和服务级；单独一层也让 `[ORPHAN]`/`[FRONTMATTER]` 的 layer 推导保持一目一层。
- **一次性把 52 条全部迁完** — 替代方案只能从记录里重建，大多数旧条目原文没记，全量迁只会批量产出带标记的空壳；
  按需迁让每次迁移都发生在有人真正重新审视那条规则的时候。

## 后果

- 读"现在是什么"看 `decisions/`，读"当时出了什么事、怎么验的"看日志；两处各写各的，靠链接不靠复述。
- 改硬规则、门禁、CI 职责、真相源归属时多写一个文件（或改写既有的一个）；不写就过不了 `[ORPHAN]`/`[DECISION]`，
  这是有意的成本。
- 门禁只能查结构（小节在不在、非空与否、标题是不是 spec-speak），查不了"替代方案是不是真的"和"事实有没有过期"——
  后者仍靠改代码的人同一次提交带上，与 `[LIVE-FACT]` 的处境相同。
- 钉住行为的检查：`scripts/verify-context.sh` `[DECISION]`；`scripts/verify-context-canary.sh` 的
  `decision-no-alternatives` / `decision-status-mismatch` / `decision-spec-speak` / `decision-stray` /
  `decision-marker-too-new` 五个红探针与 `decision-legacy-marker-ok` 一道放行探针。
