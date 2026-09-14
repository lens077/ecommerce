# TECH 文档本地链接闭包审计

> 审计时间：2026-09-12 13:40（+0800）。数据来自当前 `/Users/lens/lens077/ecommerce` 工作树；只读计算，不读取 sibling 仓或线上内容。
> 目标文件原已存在，已先读取并确认是同类审计笔记，可由本轮结果覆盖。本轮只修改本文件，未修改其他文件、未提交、未部署。

## 计算口径

- 比较集固定为 `docs/**/*.md` 与 `context/**/*.md` 下的现存普通 Markdown 文件；不把 `.scratch/`、根目录或其他目录的 Markdown 文件计入比较集。比较集只限定「比较哪些文件」，不限制闭包递归：闭包会继续跟随指向仓库其他目录的现存本地 Markdown（例如根目录 `STACK.md`、`TODO.md`）。
- 从 `docs/TECH.md` 开始做 BFS 闭包。只解析 Markdown 内联链接 `[文字](目标)`；链接目标按源文件目录解析，先 URL 解码，再去掉 query 与 fragment。当前范围没有依赖 reference-link 定义。
- 跳过图片链接（`![文字](目标)`）、围栏代码块（````` / `~~~`）、行内代码，以及 `http`、`https`、`mailto`、`ftp`、`tel`、`data`、`javascript` 和协议相对外链。
- 只有解析结果为现存 `.md` 文件的本地目标才进入 Markdown 闭包；现存目录、脚本、YAML、SQL、HTML 等本地目标不进入文档闭包，也不计为死链。
- 死链定义为：闭包内已遍历文档发出的本地链接，其路径不存在，或目标 Markdown 存在但 fragment 找不到对应标题锚点。标题锚点按 GitHub 风格计算：保留字母/数字/连字符，去除标点与 Markdown 行内代码标记，小写化并把空白折叠为连字符；重复标题追加序号。

## 覆盖结果

- 比较集文件数：**181**。
- 闭包覆盖比较集：**174**。
- 未覆盖比较集：**7**。
- 覆盖率：**174 / 181**。
- 从 `docs/TECH.md` 实际递归到的现存 Markdown 文件总数：**193**；其中有 **19** 个不属于 `docs/**/*.md + context/**/*.md` 比较集（例如根目录或 `.scratch/` 文档）。
- 闭包内解析到的本地 Markdown 目标边数：**1013**（含重复引用）。另有 79 个现存的非 Markdown 本地目标，按上述口径不纳入闭包。

## 未覆盖文件完整清单

以下 7 个文件均属于比较集，但没有从 `docs/TECH.md` 出发的可达本地 Markdown 链接。用途和「是否刻意历史归档」判断只依据文件自身的标题、首段和明确状态文字。

| 文件 | 用途 | 是否刻意历史归档 |
|---|---|---|
| `docs/observability/grafana/README.md` | Grafana 三张看板与告警规则的生成、导入和指标修正说明；文件称体系真相源在 `../面板设计.md`，并保留生成脚本与 JSON 产物的操作说明。 | **是（历史内容/被后续决策覆盖）**。第 19、47 行明确说明现行链路已由后续决策覆盖，历史生成步骤不得部署到现网；它不是 `progress-archive/` 路径下的归档文件，但内容已明确按历史产物处理。 |
| `docs/progress-archive/2026-08-21-todo-evidence.md` | 保存 2026-08-21 从 `TODO.md` 移出的验收证据、回填记录和会话原文，供追溯查证。 | **是**。第 3–5 行明确写明「不可变历史归档」「不再更新」。 |
| `docs/progress-archive/2026-08-24-bff-session-migration.md` | 保存 Web 与桌面端切换服务端会话的改造背景、实测证据、修复项和遗留项。 | **是**。第 3–5 行明确写明验收证据归档、不可变历史，并指向同级仓真相源。 |
| `docs/progress-archive/2026-08-28-todo-trim.md` | 保存 2026-08-28 精简 `TODO.md` 时被移出的已完成或已关闭条目及其关闭依据。 | **是**。第 3–6 行明确写明不可变历史、非并行真相源，活跃状态以 `TODO.md` 为准。 |
| `docs/progress-archive/PROGRESS_ARCHIVE_20260813.md` | 保存已废止的旧 `docs/PROGRESS.md` 进度视图，以及废止原因和当时的历史完成度记录。 | **是**。第 1–8 行明确写明已废止、历史归档、不再更新，进度唯一真相源改为 `TODO.md`。 |
| `docs/progress-archive/tls-convergence-done-20260824.md` | 保存从 `TODO.md`「基础设施 TLS 收敛」段移出的已完成项证据，例如 Dragonfly、CNPG、MinIO、Pangolin、Redis 和 Harbor 的收敛记录。 | **是**。第 1–4 行明确写明「已完成项证据存档」，并说明未完成项仍留在 `TODO.md`。 |
| `docs/reports/2026-09-10-google-ranking-factors.md` | 摘要一篇 X 原帖的十项搜索排名因素，并把内容映射到本项目的公开商品页、SEO、内部链接和验收建议。 | **否（研究报告，未标注为不可变历史归档）**。文件有日期和外部来源，但正文未声明「归档」「废止」或「不再更新」。 |

## 死链

- 死链总数：**1**。
- 缺失本地路径：**0**。
- 失效 fragment：**1**：`context/project/ecommerce/frontend-api/sop/connect-query.md:33` 的 `#7-int64--messageinitshape`。同文件第 390 行标题实际生成的锚点是 `#7-int64-与-messageinitshape`；链接中的双连字符目标不存在。

因此，本轮闭包没有发现缺失的本地文件路径；唯一死链是上述标题 fragment 不匹配。
