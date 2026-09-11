# Issue tracker: 本地 markdown

本仓库的 issue 与 spec（spec 也常被叫作 PRD）以 markdown 文件形式存放在 `.scratch/`，
不使用 GitHub Issues 或 GitLab Issues。

> 本仓有两个 remote（`origin` → GitLab，`github` → GitHub），都**不是** issue 的去处。
> （原第三个 `gateway` remote 已于 2026-08-24 随旧 `gateway/` 目录一并删除。）
> 不要用 `gh issue` / `glab issue` 建单。

## 约定

- 一个 feature 一个目录：`.scratch/<feature-slug>/`
- spec 固定叫 `.scratch/<feature-slug>/spec.md`
- 实现类 issue 一张单一个文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
  —— **不要**把多张单塞进一个合并文件
- triage 状态写在文件靠顶部的 `Status:` 行（角色字符串见 `triage-labels.md`）；实现完成后改成 `done`，
  前提是已填「完成自检」（见下文）
- `spec.md` 与每张实现单都要有 `## 验收标准`，每条可机械判定（见下文）
- 评论与讨论历史追加到文件末尾的 `## Comments` 标题下

## 验收标准：每条都要能验，不能靠感觉

`spec.md` 与每张实现单都必须有 `## 验收标准`。这是 AI 执行时唯一能对照的「完成定义」，
写得模糊，AI 就会用「代码能跑」代替它。判据一条：**读完这一行，能不能不问任何人就判定通过或不通过。**

每条验收标准必须落在下面五种形态之一：

| 形态 | 写法示例 |
|---|---|
| 命令 + 期望结果 | `cd backend && go test -short ./services/order/...` rc=0 |
| 请求 + 状态码/响应字段 | `POST /api/v1/orders/export` 超过 5000 条返回 `409`，body 含 `code: EXPORT_TOO_LARGE` |
| 数字 + 单位 + 阈值 | 导出 5000 条 P95 < 2 s（本机 `go test -bench`）；时间范围 > 31 天拒绝 |
| 文件/路径断言 | `backend/api/order/v1/order.proto` 的 `ExportRequest` 每个字段带 `buf.validate` 约束 |
| 具名测试 | `TestExport_CrossTenantDenied` 存在且通过 |

不合格的写法（出现即改）：「保证安全」「代码优雅」「性能要好」「处理好边界情况」「返回友好提示」。
这些词 AI 没法执行，人也没法验收。「安全」要写成「越权租户返回 403 且不泄露是否存在」；
「性能好」要写成「P95 < 200 ms」；「边界」要写成「空时间 / 越界时间 / 无权限 / 无数据四种输入各有断言」。

覆盖率数字不要机械套。比「80%」更有用的是：**权限、金额、状态迁移、重试、异常补偿这几类关键分支是否有断言**——
把这些分支点名写进验收标准。

## 完成自检：实现单关单前必填

实现单的 `Status:` 改成 `done` 前，文件里必须有 `## 完成自检` 小节，逐条对照验收标准和本仓门禁给出**证据**，
不是一句「已完成」。**确认不了的项不能删，写清为什么**——「未验证」是合法状态，「假装验证了」不是。
`scripts/verify-context.sh` 的 `[SELFCHECK]` 检查兜底：标 `done` 没有这一节、或条目没有 `——` 后的证据，门禁红。

模板（照抄，按需增减行；每条 `- [x]` / `- [ ]` 后面用 `——` 接证据或原因）：

```markdown
## 完成自检

- [x] 验收标准逐条通过 —— #1 `go test -short ./services/order/...` rc=0；#2 curl 返回 409；#3 见 TestExport_CrossTenantDenied
- [x] 跑过的锚点 —— `scripts/verify-quick.sh` 绿（2026-09-11）
- [x] 触发的专项门禁 —— 改了 proto：`go test -count=1 ./structcheck/...` 绿；未动 helm/矩阵/context
- [x] 规范回写 —— 本单没有改约束；或：`context/team/xxx.md` 已改，`scripts/spec-impact.sh` 命中的 2 处实现已核对
- [x] TODO.md 已更新 —— 「微服务与交易闭环」P0 第 N 项
- [ ] 索引命中未验证 —— 本地无 5000 条样本，线上 EXPLAIN 待人工（ready-for-human）
```

第一行是核心：把 `## 验收标准` 的每一条编号对上证据。其余各行对应本仓的提交纪律
（[runbook §6](../../context/team/runbook.md)、AGENTS.md 硬规则 3/5/8），有哪条不适用就写「不适用 —— 原因」。

wayfinder 的研究类子单（`Type: research / prototype / grilling`）用 `resolved` 关单、答案写在 `## Answer`，
不走本节；只有 `Type: task` 或没有 `Type:` 行的实现单用 `done`。

## 版本管理

`.scratch/` **入库**（不在 `.gitignore` 里）。这些文件走正常的 commit 流程，
因此同样受 `context/team/git-commit.md` 的提交规范约束：只改 `.scratch/` 的提交用
`docs` 类型，且提交前先更新 `TODO.md`（AGENTS.md 硬规则 3）。

## 当某个 skill 说「publish to the issue tracker」

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在就建）。

## 当某个 skill 说「fetch the relevant ticket」

读取被引用路径下的文件。通常用户会直接给出路径或单号。

## Wayfinding operations

供 `/wayfinder` 使用。**map** 是一个文件，每张单是一个 **child** 文件。

- **Map**：`.scratch/<effort>/map.md` —— 承载 Notes / Decisions-so-far / Fog 三段正文。
- **Child ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，正文写问题本身。
  `Type:` 行记录单的类型（`research` / `prototype` / `grilling` / `task`）；
  `Status:` 行记录 `claimed` / `resolved`。
- **Blocking**：靠顶部写一行 `Blocked by: NN, NN`。列出的文件全部 `resolved` 时，该单解除阻塞。
- **Frontier**：扫 `.scratch/<effort>/issues/`，挑出「未关闭 + 未阻塞 + 未认领」的文件，编号最小的胜出。
- **Claim**：动工前先把 `Status:` 改成 `claimed` 并保存。
- **Resolve**：在 `## Answer` 标题下追加答案，`Status:` 改成 `resolved`，
  再把一条上下文指针（要点 + 链接）追加到 `map.md` 的 Decisions-so-far。
