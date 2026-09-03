---
name: git-commit
layer: team
description: Conventional Commits 规范、emoji↔type 白名单、commitlint 校验，以及提交前必须先更新 TODO.md 的工作流
---

# Git 提交规范与工作流

## 硬规则：提交前先更新 TODO.md

每次修改代码后、执行 `git commit` **之前**，必须先更新 `TODO.md`（勾选/调整对应条目的实现进度），然后才提交。

**Why**：`TODO.md` 是本项目的进度真相源。不同步就会出现「代码已实现但文档还标 ⬜」或反过来，下一轮（尤其是新 AI 会话）会基于错误的进度做判断。

**How to apply**：
1. 完成一处代码改动
2. 编辑 `TODO.md` —— 更新「实现进度对照」表的 ✅ / 🟡 / ⬜ 状态，或勾选「近期待办」条目
3. 再 `git commit`

TODO 更新可以和代码改动放**同一个提交**，也可以紧跟一个 `docs: 更新 TODO 进度` 提交。

⚠️ 文件名是大写 `TODO.md`。git 曾误跟踪为小写 `todo.md`，已在 `b72eb7e7` 修正，不要再引入小写路径。

## 提交信息格式

遵循 **Conventional Commits**（Angular 风格）：

```
<type>(<scope>): [:emoji:] <subject>

<body>

<footer>
```

- **type**：下面十一类之一，**不可自造**
- **scope**：模块名，可省略。常见 `cart` / `product` / `address` / `order` / `frontend` / `api` / `search` / `recommend`。
  网关与配置中心已迁到 sibling 仓 control-tower，本仓不再有对应 scope
- **emoji**：**可选**。仓库既有历史全部不带，强制加上只会让 `git log --oneline` 一半带一半不带。但一旦写了就必须与 type 相符
- **subject**：中英文混用，描述做了什么，**末尾不加标点**

实例（取自本仓历史）：

```
perf(cart): 优化购物车页面展示
fix(frontend): sticky AppBar, login redirect loop fix
feat(address): 完整实现地址服务
fix(gateway): make build 的 --build-arg GOIMAGE 一直是空传
feat(config-center): 打通配置下发与 cart 热更新(不经 Consul 桥接)
feat(address): :sparkles: 行政区划落库 + RegionService 三级级联接口
```

### 十一类 type

| type | 用于 |
| --- | --- |
| `feat` | 新功能、新特性 |
| `fix` | 修 bug |
| `perf` | **真的**让程序更快或更省的改动 |
| `refactor` | 既不加功能也不修 bug 的代码变动 |
| `style` | 不影响语义的格式、UI 样式 |
| `test` | 测试代码 |
| `docs` | 文档 |
| `build` | 构建系统或依赖 |
| `ci` | CI 配置与脚本 |
| `chore` | 以上都不是的杂项 |
| `revert` | 回退 |

⚠️ `perf` 最容易被滥用。重构、删死代码、移动文件、改注释**都不是 perf** —— 它们不改变运行时开销，只改变代码的样子。

## emoji ↔ type 白名单

用 gitmoji **短代码**（`:bug:`）而不是 Unicode 字面量（🐛）：短代码是纯 ASCII，终端、diff 工具、`git log --oneline` 的列对齐都不会因为宽字符错位。

语义以 [gitmoji.dev](https://gitmoji.dev/) 官方定义为准，**不要望文生义**。同一个 emoji 允许对应多个 type —— `:necktie:`（业务逻辑）新写是 `feat`、改错是 `fix`、只挪不改行为是 `refactor`，三种都成立。但 `:bug:` 只能是 `fix`、`:sparkles:` 只能是 `feat`，这类没有第二种读法。

> **完整白名单的真相源是 `frontend/commitlint.config.mjs` 的 `EMOJI_TYPES`**（机器可读，校验以它为准）。
> 下表只列最常用的十几个，**不是全集**；要查某个 emoji 允不允许，直接读那个文件，
> 或 `cd frontend && echo "<消息>" | pnpm exec commitlint` 让它告诉你。

| emoji | 含义 | type |
| --- | --- | --- |
| `:sparkles:` | 引入新特性 | feat |
| `:necktie:` | 业务逻辑 | feat / fix / refactor |
| `:card_file_box:` | 数据库相关变更 | feat / fix / chore |
| `:safety_vest:` | 校验相关代码 | feat / fix / refactor |
| `:bug:` | 修复 bug | fix |
| `:ambulance:` | 关键热修复 | fix |
| `:green_heart:` | 修复 CI 构建 | fix / ci |
| `:zap:` | 提升性能 | perf |
| `:recycle:` | 重构代码 | refactor |
| `:building_construction:` | 架构变更 | refactor |
| `:fire:` | 删除代码或文件 | refactor / chore |
| `:white_check_mark:` | 添加或让测试通过 | test |
| `:memo:` | 添加或更新文档 | docs |
| `:arrow_up:` | 升级依赖 | build |
| `:wrench:` | 添加或更新配置文件 | chore / build |
| `:construction_worker:` | 添加或更新 CI 构建系统 | ci |
| `:rewind:` | 回退变更 | revert |

## Body 与 Footer

两者都可选，但一旦写就有形状：

- **body** 解释**为什么**这么改、与之前行为差在哪，不是复述 diff。每行不超过 72 字符
- **footer** 只放两类：`BREAKING CHANGE: <描述>`（全大写，说明不兼容点）和 `Closes #123, #124`

subject 控制在 50 字符以内；正文可以长，长的是 body 不是 header。

```
feat(api): 将用户接口从 REST 迁移至 GraphQL

REST 版本每次拉用户主页要发四个请求，且字段固定，
移动端只用到其中三分之一。改为 GraphQL 后由调用方声明字段。

BREAKING CHANGE: 旧版 REST 接口 /api/user 已移除，请使用 GraphQL 查询。
Closes #123, #124
```

## 校验工具链

```
frontend/commitlint.config.mjs   规则 + EMOJI_TYPES 白名单（唯一真相源）
frontend/package.json            devDependencies 装 @commitlint/cli + config-conventional
frontend/.vite-hooks/commit-msg  commitlint --config <$0 推导>/commitlint.config.mjs --edit "$1"
frontend/.vite-hooks/pre-commit  gitleaks 暂存区扫描 → 依赖清单变更时重生成 THIRD_PARTY_NOTICES.md 并 git add → cd frontend && vp staged
frontend/.vite-hooks/pre-push    scripts/verify-quick.sh（只推 tag / 删分支放行；SKIP_VERIFY=1 绕过）
```

> 2026-08-26 起 commitlint 由 frontend workspace 承载：仓库根的
> `package.json` / `pnpm-lock.yaml` / `commitlint.config.mjs` 三件套已删，
> 根目录不再有 Node workspace。迁移理由与红测记录见 evolution-log 同日条目。

钩子由 **vite-plus** 安装，不是 husky：在 `frontend/` 下跑 `pnpm install`，其 `prepare: "vp config"` 会把仓库级的 `core.hooksPath` 设成 `frontend/.vite-hooks/_`。`core.hooksPath` 是仓库级设置，所以**后端 Go 的提交同样受这套校验**。

⚠️ **不要把钩子挪回仓库根的 `.husky/`。** `vp config` 里有这么一段接管守卫：

```js
if (existingHooksPath && existingHooksPath !== target
    && existingHooksPath !== ".husky" && !existingHooksPath.startsWith(".husky/"))
  return { message: `core.hooksPath is already set to ..., skipping` };
```

它只在已有值「不像 husky」时才让路。只要 `core.hooksPath` 以 `.husky` 开头，下一次 `pnpm install` 就会被 vite-plus 悄悄接管过去，而 `_/h` 的 `[ ! -f "$s" ] && exit 0` 让缺失的钩子**静默放行**。两套钩子抢同一个 git 配置，抢输的那套就这么没的。

自己验一条消息（在 `frontend/` 下执行——commitlint 装在那个 workspace）：

```bash
cd frontend
echo "feat(address): :sparkles: 行政区划落库" | pnpm exec commitlint
pnpm exec commitlint --from HEAD~7 --to HEAD   # 回放校验既有提交
```

### 钩子退出 127 怎么读（2026-08-26 依赖链变更后）

钩子**不再调 pnpm**：`_/h` 把 `frontend/node_modules/.bin` 注入 PATH，脚本直调
`commitlint` 二进制并显式 `--config`。原因：2026-08-26 根目录 Node workspace
三件套删除后，`pnpm exec` 因 cwd 向上找不到 workspace 而**恒红**（合法消息也报
`ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`），故整链迁入 frontend workspace 并改直调。

- **钩子 exit 127**（command not found）= frontend 依赖未装：`cd frontend && pnpm install`。
  **这是环境断了，不是消息写错了。**
- 上面的手动校验命令仍需 pnpm——本机 pnpm 无独立安装，由 corepack 按
  `frontend/package.json` 的 `packageManager` 提供；`pnpm: command not found` 时
  重跑一次 `corepack enable pnpm`（vite-plus 升级 node 运行时后 shim 随旧目录
  消失，属已知再发条件）。
- 应急绕法（依赖装不上时）：手动校验绿后再 `git commit --no-verify`——
  校验没有被跳过，只是手动执行。

> ⚠️ **这套校验曾经九个月一次都没生效**（2025-11-04 → 2026-08-02，期间全部提交都没被校验过）。
> 五处串联失效的完整复盘已移到 [self-refinement.md 的「教训存档」](../harness-framework/self-refinement.md#教训存档)——它讲的是 harness 门禁静默失效，
> 不是提交规范本身。这里只留结论：**校验类工具装完，必须用一条故意写错的消息验证它真的拦得住。**

## 分支策略

项目历史**全部直接提交到 `main`**（git user: lens），不走分支 / PR 流程。

遵循这个既有习惯，**除非用户明确要求开分支**。

## 提交分组

按逻辑分组提交：**前端 / 后端 / 文档分开**，不要一次 `git add -A` 混在一起。

开始新改动前，若工作区已有未提交的改动，**先分组提交干净**再动新代码——否则新旧改动混在一个提交里，无法单独回滚。

例外：当拆分会产出**编译不过的中间提交**时，合并成一个提交，并在 body 里写清楚为什么不拆。拆坏的提交比大提交更没用。

### 暂存三步走（别靠记性，靠动作）

> ⚠️ **上面那句「不要 `git add -A`」在 2026-08-29 被违反了，而当时执行者读过本文件。**
> 劝诫式规则挡不住顺手——所以这条改成三个必须执行的动作。

1. **`git status --short` 先看全貌**，问自己：这里面**哪些不是我改的**？
   共享工作区里几乎总有别人的在途工作。
2. **用显式文件列表暂存**，不用 `-A`、不用 `.`：
   ```bash
   git add STACK.md docs/todo/xxx.md backend/services/*/Dockerfile
   ```
3. **`git diff --cached --name-only` 复核**，确认列表与第 1 步的判断一致，再 commit。

**触发事故（2026-08-29）**：AI 在 `docker-deploy` 仓刚因发现「文件里混着用户未提交的卡片新增」
而主动停下来问用户，转头在 `ecommerce` 仓用了 `git add -A`，把用户 **604 行**在途工作
（告警信号卫生 138 行 + 通知链路手册 315 行 + Debezium 经验 133 行 + 四处 INDEX/TECH 登记）
一起并进了标题为「alpine 基底升级」的提交并推送到两个远端。

**善后成本远高于事前一条 `git status`**：`reset --soft` 重拆 → 两次提交 →
GitLab force-push 成功但 **GitHub 被 `allow_force_pushes: False` 拒绝**
（`enforce_admins: False` 只放行普通推送，**不覆盖 force-push**，两个开关独立）→
需临时改分支保护、推完立即关回。

**拆分后必须验树哈希**，确认零内容丢失：

```bash
git tag backup/mixed-commit-<date> <混合提交>          # 先留退路
# ……拆分……
[ "$(git rev-parse HEAD^{tree})" = "$(git rev-parse backup/mixed-commit-<date>^{tree})" ] \
  && echo "内容零差异" || echo "有丢失，别推"
```

比对**树**而非 diff：树哈希相同即两个历史的最终文件内容逐字节一致，比逐文件看 diff 可靠。

## 相关

- 知识沉淀闭环见 [`context/harness-framework/self-refinement.md`](../harness-framework/self-refinement.md)
- 前端工具链与钩子安装见 [`frontend/README.md`](../../frontend/README.md)
- 完整 emoji 语义见 [gitmoji.dev](https://gitmoji.dev/)

（本文件已合并原 `frontend/git-commit-conventional.md`。同一件事不要两个真相源——那份文档最后那行 `npx husky add .husky/commit-msg '...'` 正是上面第 1 层故障的来源。）

## 远端：只有 origin 和 github 两个

```
origin   GitLab  (sumery/ecommerce)     ← 日常 push 的去处，无 Actions
github   GitHub  (lens077/ecommerce)    ← CI 在这里，发布 tag 只推它
```

**发布 tag 只推 `github`**。除这两个之外不要再往别的远端推任何东西。

## 发布 tag 与 CI 触发（2026-08-20 起）

**构建/发布 CI 只由发布 tag 触发**。push main 不再跑构建——发布节奏由打 tag 的人控制，
文档推送不再引发全量构建，CI 机器人的 values 回写也不再与本地历史抢跑
（触发事故见 evolution-log 同日条目）。`workflow_dispatch` 保留为显式手动例外。
唯一的 per-push 例外是结构门禁 `context-gate.yml`（每 PR/分支 push 都跑）：它是分支保护的
必需检查且本仓 Actions 零计费，**不要为「省额度」把它改回 tag 触发**——2026-08-29 曾这么改过
一次，预算前提当日即被证伪（净额 $0.00），详见 evolution-log 同日条目与该 workflow 头注。

**tag 格式**：裸 semver `X.Y.Z`（不带 v、不补零；GitHub 过滤模式
`[0-9]+.[0-9]+.[0-9]+`）。旧 `v1.3.x` 系（带 v + 补零）已冻结，天然不匹配新模式，
不删除不复用。版本从 `1.4.0` 起延续项目迭代。

**语义（semver 社区实践）**：

| 位 | 何时递增 |
|---|---|
| `X` | 破坏性变更 / 大版本重构（proto 兼容性红线被有意打破、架构级替换） |
| `Y` | 向后兼容的新功能、新服务、新组件接线 |
| `Z` | 修复、文档、配置、依赖对齐等其余改动 |

**操作手顺（人与 agent 一致）**：

```bash
git tag --list '[0-9]*' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1   # 看最新
git tag <X.Y.Z>              # 打在 main 上已推送的提交
git push github <X.Y.Z>      # ⚠️ 必须推 github 远端——Actions 在那里；origin(GitLab) 无 CI
```

四条纪律：**tag 不可变**（打错就打新号，不 move 不复用）；tag 指向的提交必须已在
main 上；**agent 需要触发 CI 验证或部署时，一律走打 tag**，并按上表选择递增位；
镜像会同时带 `X.Y.Z` 与 `sha-<7>` 双标，`helm/values.yaml` 回写用版本号。

### 两个远端的 CI 职责切分（2026-09-02 起）

| 远端 | 触发 | 跑什么 | 不跑什么 |
|---|---|---|---|
| origin（GitLab，`.gitlab-ci.yml`） | 每次分支 push / MR | `context-gate` + 本地锚点原样搬进去的 `backend-gate`（go build/vet/test -short）与 `frontend-gate`（`pnpm ready`） | 任何产制品、推镜像、回写清单的动作；**tag 不建流水线** |
| github（GitHub Actions） | 仅发布 tag | 多架构镜像 → Trivy → Cosign → SBOM → 清单回写，外加 supply-chain / deploy-consistency | 分支 push 的代码门禁（`context-gate.yml` 是唯一 per-push 例外） |

为什么不把发布链搬去 GitLab：Cosign keyless 的签名身份是 Fulcio 证书里的 GitHub
workflow ref（`service-ci.yml` 的 `CERT_IDENTITY_RE` 硬编码了它）、Trivy SARIF 的上报目的地是
GitHub Code scanning、buildx 缓存走 `type=gha`、public 仓在标准 runner 上零计费——这四样
都绑在 GitHub，搬家是纯成本换不到新能力。反过来 GitLab 是日常 push 的去处，却曾只有
`context-gate` 一道门，`pnpm ready` 在任何 CI 里都不跑；把不需要凭据的门禁放 GitLab、
把需要凭据和身份的发布留 GitHub，两边没有重叠的逻辑，就不会漂移。

**硬约束：同一个发布 tag 只允许一边写镜像仓与回写清单。** 要在 GitLab 侧加任何构建，
必须保持「不推、不回写」（等价 GitHub 的 `push-image: false`），否则不可变 tag 会被写两次、
Cosign 签两次、SBOM 记两个 digest。
