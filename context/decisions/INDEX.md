# context/decisions/ — 决策记录（当前状态，不是编年史）

**范围**：一个决策一个文件，写的是**它现在是什么、打败了谁、付出了什么**。与
[evolution-log.md](../harness-framework/evolution-log.md) 分工明确：日志按日期追加、永不改写，
记「触发事故 + 怎么验证的」；这里的 `implemented/` 随交付事实**同步改写**，读者不必从
几十条日志里自己拼出"现在是什么"。

路径即状态，目录移动 = 状态变更：

```
context/decisions/
├── proposed/      提案，尚未实现（可以用将来时）
├── implemented/   已交付：现在时描述事实，随代码同步改写
└── rejected/      已否决：提案原样冻结，否决理由写在 ## 否决理由
```

## 已实现 · `implemented/`

| 决策 | 一句话 |
|---|---|
| [2026-09-11-spec-reverse-index-and-selfcheck.md](implemented/2026-09-11-spec-reverse-index-and-selfcheck.md) | 规范文档 frontmatter `affects:` 登记反向依赖、`spec-impact.sh` 双向查影响（`[AFFECTS]` 守存在性）；实现单 `done` 必带可验证「完成自检」（`[SELFCHECK]`）；验收标准限五种可判定形态 |
| [2026-09-03-shared-infra-kit-boundary.md](implemented/2026-09-03-shared-infra-kit-boundary.md) | 共享基础设施实现只存在于 go-connect-kit；消费方只保留 provider-neutral Options adapter，不使用 BSR |
| [2026-09-03-decision-records-current-state.md](implemented/2026-09-03-decision-records-current-state.md) | 本目录为什么存在：决策理由从 evolution-log 编年史分离为当前状态文档，三条硬规则由 `[DECISION]` 门禁守着 |
| [2026-09-03-third-party-notices-regenerate.md](implemented/2026-09-03-third-party-notices-regenerate.md) | `THIRD_PARTY_NOTICES.md` 由脚本从真的编进制品的依赖生成；依赖清单进暂存区时 pre-commit 重生成并 git add，copyleft/UNKNOWN 只显形不阻断 |
| [2026-09-03-pre-push-verify-quick.md](implemented/2026-09-03-pre-push-verify-quick.md) | push 前跑 `verify-quick`：钩子沿用 vite-plus 分发器，不引入 lefthook；只推 tag / 删分支放行 |
| [2026-09-02-gitleaks-hard-gate.md](implemented/2026-09-02-gitleaks-hard-gate.md) | 凭据门禁是 commit 路径上的硬门禁：工具缺失即红、三处接线、CI 必须全历史扫描并断言扫描范围 |
| [2026-09-02-two-remote-ci-split.md](implemented/2026-09-02-two-remote-ci-split.md) | GitLab 跑门禁、GitHub 只由发布 tag 触发；同一 tag 只允许一边写镜像仓 |
| [2026-08-30-todo-md-sole-progress-source.md](implemented/2026-08-30-todo-md-sole-progress-source.md) | `TODO.md` 是唯一进度真相源：PROGRESS.md 双文档与 kaneo 看板都已下线，`[PROGRESS-SRC]` 门禁挡住第二套视图 |
| [2026-08-08-lint-baseline-ratchet.md](implemented/2026-08-08-lint-baseline-ratchet.md) | 静态检查走基线棘轮：存量冻结放行、只拦新增、修好必须刷基线（反向棘轮） |

## 已否决 · `rejected/`

暂无独立文件。「底层改 Cordis 插件框架」的否决与重估条件已有一处家：
[cordis-evaluation.md](../harness-framework/cordis-evaluation.md)，不重复。

## 提案中 · `proposed/`

| 决策 | 一句话 |
|---|---|
| [2026-09-08-object-authz-check-placement.md](proposed/2026-09-08-object-authz-check-placement.md) | 对象级授权 Check 放服务侧 use case 层而非网关；OpenFGA 只存组织图、对象归属用服务归属列。**待拍板**：TECH.md §8.1 与 control-tower 裁决互相矛盾 |

## 怎么写

文件名 `YYYY-MM-DD-slug.md`，日期是**首次提出**的日期（迁自日志的用日志里的日期），slug 小写连字符。
frontmatter 的 `status:` 必须与所在目录一致——路径是状态的唯一真相，frontmatter 只是可 grep 的投影。

````markdown
---
name: 2026-09-03-slug
layer: decisions
status: implemented
description: 一句话：决定了什么、打败了谁
---
# 决策：<标题>

## 问题
动机。写到**不看方案也能独立成立**的程度。

## 决策
已交付的事实，现在时：改了哪些文件、机制现在怎么运作、默认值是什么。
（proposed 用 `## 提案`，可以用将来时；rejected 保留原 `## 提案` 并加 `## 否决理由`。）

## 考虑过的替代方案
- **<替代方案 A>** — 为什么输。
- **<替代方案 B>** — 为什么输。

## 后果
付出了什么、换来了什么；哪个测试/门禁/canary 现在钉住了这个行为。
（proposed 用 `## 验收标准` + `## 风险`；变成 implemented 时必须改写成 `## 后果`。）
````

硬规则（`scripts/verify-context.sh` 的 `[DECISION]` 检查，改门禁后跑 `verify-context-canary.sh`）：

1. **「考虑过的替代方案」必须非空**——没写打败了谁的决定会被反复重新争论。替代方案**只能记录，不能事后编造**：
   迁自日志、原文确实没记的旧决策，用 `<!-- decision-format: alternatives-not-recorded -->` 代替该小节，
   门禁只对 2026-09-03 之前日期的文件放行这个标记。
2. **implemented 不得残留提案期标题**（`## 提案` / `## 计划` / `## 迁移计划` / `## 验收标准` / `## 风险`）——
   提案原文不改写，读者永远分不清「打算」和「已是」。
3. **随交付事实改写，不追加历史**。代码后来搬了路径、改了键或默认值，同一次提交改这里的事实；
   "原本 / 现在 / 不再"这类叙述归 evolution-log 和 git。**决定本身被推翻时不改写旧文件**：
   新建一条并互链，旧文件移入 `rejected/` 或在 `## 后果` 里指向替代者。

什么时候写一条：改了约束 AI/团队行为的机制（AGENTS.md 硬规则、门禁、CI 职责、真相源归属）、
做了选型、否决了一个反复被提起的方案。业务代码改动不写；一次性调试细节不写（见
[self-refinement.md](../harness-framework/self-refinement.md)）。同一次改动通常**两处都要写**：
日志记事故与验证，这里记决策与替代方案，互相链接。
