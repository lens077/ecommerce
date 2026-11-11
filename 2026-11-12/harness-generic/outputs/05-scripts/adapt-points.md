# 脚本适配点：把硬编码常量外提

对象：`/Users/lens/lens077/ecommerce/scripts/` 下的门禁脚本。
目标：复制到新仓后，只需改本文件列出的位置，不改判定逻辑。

> 行号基于 2026-11-12 的源仓快照，改动后会漂移——以「搜索串」为准，行号只做定位参考。

## 1. `verify-context.sh`（631 行，18 个 tag）

| 位置 | 硬编码内容 | 改成 | 搜索串 |
|---|---|---|---|
| `:143` | 扫描集 `AGENTS.md README.md STACK.md TODO.md context docs` | `scan.roots` + `scan.trees` | `STACK.md` |
| `:147` | 层名 `team harness-framework decisions project/ecommerce` | `context.layers[]` | `project/ecommerce` |
| `:35-38` | 预算常量 `13000` | `budgets` | `13000` |
| `:388-389` | TODO 预算 `96000` + 棘轮注释 | `budgets` + `ratchet` | `96000` |
| `:253-281` | 格式基线反向棘轮 + 陈旧行清理 | **必须整体保留**（不要只留「在基线里就放行」） | `context-format-baseline` |
| `:459-476` | 进度基线（复选框上限） | 保留；路径改配置 | `context-progress-baseline` |
| `:591-596` | 路径基线 | 保留；路径改配置 | `context-pathref-baseline` |
| `:379-383` | `[SKILL-REF]` 取 skills 表第 3 列判状态 | `skills.status_column` | `skills.md` |
| `:520-528` | `[EMBED]` 调 `doc-embed.py` | 无投影需求则整段删除 | `doc-embed` |
| `:530-535` | `[ENV-CONTRACT]` 调 `env-check.py` | 无本地环境契约则整段删除 | `env-check` |
| `:537-544` | `[GENERATED]` 生成物目录 | `generated_paths` | `GENERATED` |

**不要改的部分**：`[DEAD-LINK]`、`[PATH-REF]`、`[ORPHAN]`、`[FRONTMATTER]`、`[FORMAT]`、`[DECISION]`、
`[BUDGET]`、`[RETIRED]` 的判定逻辑——这些是通用语义（见 `01-classification.md` A 类）。

## 2. `path-refs.py`

| 位置 | 硬编码 | 改成 |
|---|---|---|
| 扫描入口 | 从 `verify-context.sh` 传入 | 保持参数化（现在已是） |
| `:61-70` | `future_scoped` 放行规则、相对 `backend/` 的路径解析 | 路径前缀改 `doc_roots` |
| 判定依据 | 以 **git 索引** 判定存在性 | **必须保留**：这决定了「未跟踪的本地草稿」不会造成假红 |

> 上一轮审计里「本地门禁因未跟踪的 `docs/gitops` 草稿而红」就是这条边界造成的：`[DEAD-LINK]` 扫磁盘、
> `[PATH-REF]` 扫索引。移植时不要把两者统一成「都扫磁盘」，否则本地会出现无法复现的假红。

## 3. `verify-context-canary.sh`

| 项 | 处理 |
|---|---|
| 临时仓创建 / `git init` | 直接复用 |
| 探针注册（`probe <name> <inject> <assert-tag>`） | 直接复用；探针清单需按目标仓的检查集重写（见 `canary-probe-template.md`） |
| 探针 0（pristine green） | 直接复用，它是「门禁在干净树上不会误报」的唯一证据 |
| 假阳性守卫 | 直接复用 |
| 49 个探针 | **不可整体复制**：其中 2 个（`todo-fenced-ok`、`live-fact-dated-ok`）对应已删除的检查，是恒绿死探针 |

## 4. `verify-quick.sh`

| 位置 | 内容 | 处理 |
|---|---|---|
| `:61-70` | 五段并行：backend / frontend / sensitive-data / notices / deploy-manifests | 段数按仓调整 |
| `:4-13` | 调度器自身也要 fail-closed（门禁脚本失败必须传播） | 保留 |
| `:90-119` | 绿只打一行、红打失败段、完整日志落 `/tmp` | 保留 |
| 日志目录 | `TMPDIR/verify-quick.*` | 保留（不要写进仓库） |
| 缺失工具 | 缺 gitleaks 即红 | 保留 fail-closed |

## 5. `verify-kyaml.sh` / `verify-deploy-parity.sh` / `verify-doc-sync.py`

这三个**不是通用语义**：

- `verify-kyaml.sh`：只有采纳 KYAML 约定的仓才需要；若采纳，`helm/files/zero-trust.yaml` 这类
  「模板语法与 KYAML 冲突」的豁免必须写进 `exemptions.files`。
- `verify-deploy-parity.sh`：前提是「同一套对象有两份独立清单」。没有这个结构就别搬——
  硬搬会得到一份永远绿的假门禁。目标仓若有 helm + kustomize，路径要按 `03-config-schema.md` 配；
  源仓 `AGENTS.md:52` 写的 `deploy/{base,overlays/prod}` 是错的，别抄。
- `verify-doc-sync.py`：规则表（`doc-sync: required` / `affects:`）必须按仓重写，否则会拦错提交。

## 6. `harness-scars.sh`

纯通用：读三份基线，把「被放行的存量」逐条打印。唯一适配是基线路径。
它解决的问题是「豁免静默生效」——建议**每个**采用基线的仓都接。

## 7. hook 安装

源仓用 vite-plus 的 `core.hooksPath=frontend/.vite-hooks/_`，分发器 `h` 按钩子名转发到同目录同名脚本。
移植时两种选择：

- 有 Node 工具链：沿用 `core.hooksPath` 单一指向，**不要**同时往 `.git/hooks/` 写文件（两套钩子互抢会静默失效）。
- 无 Node 工具链：在 `Makefile` 加 `hooks` 目标做幂等安装（已存在则覆盖并在文件头写版本标记），
  并在 README 首次运行步骤里强制调用一次。
