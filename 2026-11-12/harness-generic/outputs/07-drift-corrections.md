# 已漂移断言的处置

原则：**已漂移的断言不能原样进模板**——要么按真相源修正，要么改成占位符。
下面每条给出定位、现状、处置。

---

## 1. `AGENTS.md:52` 部署清单路径错误（最严重）

**文档说**：kustomize 裸 manifest 在 `deploy/{base,overlays/prod}`。
**实际**：仓库根**无 `deploy/` 目录**；真实位置是 `backend/services/*/deploy/base|overlays/prod`
与 `frontend/apps/*/deploy/...`，由 `scripts/verify-deploy-parity.sh:13-17` 与 `:66-79` 遍历。
**为什么严重**：它是「第二份真相源在哪」的唯一指引；照它找会扑空，而门禁本身是绿的，
所以不会有人被提醒。

**处置**：
- 修文档（推荐）：改成「`backend/services/*/deploy/{base,overlays/prod}` 与 `frontend/apps/*/deploy/`」。
- 进模板时写 `{{DEPLOY_MANIFEST_ROOTS}}`，并在生成器里校验该路径存在。
- **绝不**把 `deploy/{base,overlays/prod}` 写进任何模板。

## 2. `docs/agents/skills.md` 运行态工具表整体失效（11 条）

**现状**：文档称 gitleaks / golangci-lint / buf / sqlc / protoc-gen-go / protoc-gen-connect-go / rg / zstd /
docker / actionlint / shellcheck / yq / okteto 缺失；实测全部已安装。版本号也已过时（Python 3.9.6→3.14.7、
pnpm 12.3.4→12.16.1、Go 1.27.1→1.27.3）。仅 `protoc`、`kustomize` 仍确实缺失。

**为什么严重**：与 `AGENTS.md:49`「环境按需查询，文档只留契约与查法」直接冲突；
新人会重复安装已装工具，或误判「门禁跑不了」。

**处置**：
- 删掉「存在性」列，只保留「查法」（`command -v X`、`go version`、`pnpm -v`）与「缺失时的安装方式」。
- 若确实需要快照，放进带日期的独立文件并标注「历史快照，勿作现状引用」。
- 进模板时：**不复制任何具体版本号**，只保留查法。

## 3. 「改路由模板必须同 PR 升级 control-tower 依赖版本」无校验器

**现状**：`AGENTS.md:50` 是硬规则，但没有任何脚本或 CI 校验该联动。
`structcheck` 比对的是「矩阵 ↔ 目录 ↔ **已安装的** routes 模板」，因此「模板改了、依赖没升」时 CI 仍绿。

**处置**：
- 若要保留为规则：在规则后显式标注「无自动校验，靠评审」——不能让它看起来像有门禁。
- 若要真正拦住：需要一个比对 control-tower 最新模板版本与 `backend/go.mod` 的检查（新增工作，未做）。

## 4. `AGENTS.md:57` 中文文案约定无校验器

**现状**：直角引号、允许第二人称等约定写在硬规则区，没有任何检查。
**处置**：移入「项目补充规则」并标注「人工评审」；或接入中文排版校验器（`measure` 技能可用，但未接入）。
进模板时**不要**包含这几条——它们是项目偏好。

## 5. `TECH.md:42` connect-openapi 版本只是注释

**现状**：v0.19.1 只出现在 `buf.gen.openapi.yaml` 的注释（`go install` 示例）里，没有版本钉死或校验。
**处置**：要么在 CI 校验生成器版本，要么在文档里注明「版本未强制，生成结果可能随环境变化」。
标为「部分成立」，不要当作已验证事实进模板。

## 6. `TECH.md:47/48` 无仓内落点（k6 / OpenFGA）

**现状**：k6 无任何脚本；OpenFGA 不在本仓 Go 依赖里（归属 control-tower）。
**处置**：**不算漂移**（`TECH.md:28-29` 已声明「目标契约，不表示已实现」），
但不能当现状引用；进模板时删除。

## 7. 未验证项（不要写成结论）

- `AGENTS.md:108`「`verify-context.sh` 是 main 上唯一必需的 CI 检查」——required check 属平台分支保护设置，本地不可读。
- GitHub/GitLab 远端是否已把 `context-gate` 设为必过：需在平台侧确认。
- （已复核）`scripts/verify-context-canary.sh` 本轮实跑 **49 探针全过**：干净沙箱绿 + 各类注错被拦且 tag 正确
  + 假阳性守卫放行。注意其中 `todo-fenced-ok`、`live-fact-dated-ok` 对应已删除的检查，属恒绿死探针，
  计入 49 但不提供覆盖——移植时不要照抄总数。

## 8. 上一轮「local red」的成因已消除

上一轮报告 `verify-context.sh` 本地红、报 22 条指向 `docs/gitops/00-introduction.md` 的 `[DEAD-LINK]`。
本轮 `git status` 干净、该文件已被跟踪，门禁 exit 0。
结论：那是**工作树脏导致的假红**，不是文档断言漂移。`[DEAD-LINK]` 扫磁盘、`[PATH-REF]` 扫 git 索引，
这个差异是设计使然，移植时不要「统一成扫磁盘」，否则会制造不可复现的假红。

---

## 写进模板前的自检清单

```markdown
- [ ] 模板里没有出现任何具体服务名、端口、集群地址、域名
- [ ] 模板里没有出现 `deploy/{base,overlays/prod}`
- [ ] 模板里没有出现工具版本号或「已安装/缺失」判断
- [ ] 模板里没有出现 ecommerce 的预算数值（13000 / 96000）
- [ ] 每条路径占位符都有对应的存在性自检
- [ ] 每条「硬规则」要么有校验器，要么显式标注「人工」
```
