# Issue tracker: 本地 markdown

本仓库的 issue 与 spec（spec 也常被叫作 PRD）以 markdown 文件形式存放在 `.scratch/`，
不使用 GitHub Issues 或 GitLab Issues。

> 本仓有三个 remote（`origin` → GitLab，`github` / `gateway` → GitHub），都**不是** issue 的去处。
> 不要用 `gh issue` / `glab issue` 建单。

## 约定

- 一个 feature 一个目录：`.scratch/<feature-slug>/`
- spec 固定叫 `.scratch/<feature-slug>/spec.md`
- 实现类 issue 一张单一个文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
  —— **不要**把多张单塞进一个合并文件
- triage 状态写在文件靠顶部的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与讨论历史追加到文件末尾的 `## Comments` 标题下

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
