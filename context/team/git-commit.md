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
- **scope**：模块名，可省略。常见 `cart` / `product` / `address` / `order` / `gateway` / `frontend` / `api` / `config-center` / `kafka-connect` / `recommend`
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

**这份表的唯一真相源是 `commitlint.config.mjs` 里的 `EMOJI_TYPES`**，下表是它的可读副本，改动请两边同步。

### feat

| emoji | 含义 | 也可用于 |
| --- | --- | --- |
| `:sparkles:` | 引入新特性 | — |
| `:boom:` | 破坏性变更 | refactor |
| `:globe_with_meridians:` | 国际化与本地化 | fix |
| `:chart_with_upwards_trend:` | 添加或更新分析、埋点代码 | — |
| `:speech_balloon:` | 添加或更新文案与字面量 | docs / style |
| `:triangular_flag_on_post:` | 添加、更新或删除特性开关 | chore |
| `:label:` | 添加或更新类型 | refactor / chore |
| `:necktie:` | 添加或更新业务逻辑 | fix / refactor |
| `:safety_vest:` | 添加或更新校验相关代码 | fix / refactor |
| `:passport_control:` | 授权、角色与权限相关代码 | fix |
| `:stethoscope:` | 添加或更新健康检查 | chore |
| `:card_file_box:` | 数据库相关变更 | fix / chore |
| `:loud_sound:` | 添加或更新日志 | chore |
| `:goal_net:` | 捕获错误 | fix |
| `:thread:` | 多线程与并发相关代码 | fix / perf / refactor |
| `:wheelchair:` | 提升可访问性 | fix |
| `:seedling:` | 添加或更新种子数据 | chore |
| `:egg:` | 添加或更新彩蛋 | — |

### fix

| emoji | 含义 | 也可用于 |
| --- | --- | --- |
| `:bug:` | 修复 bug | — |
| `:ambulance:` | 关键热修复 | — |
| `:adhesive_bandage:` | 非关键问题的简单修复 | — |
| `:pencil2:` | 修复拼写错误 | docs |
| `:lock:` | 修复安全或隐私问题 | — |
| `:rotating_light:` | 修复编译器或 linter 告警 | style / chore |
| `:alien:` | 因外部 API 变更而修改代码 | refactor |
| `:green_heart:` | 修复 CI 构建 | ci |

### perf

| emoji | 含义 | 也可用于 |
| --- | --- | --- |
| `:zap:` | 提升性能 | — |
| `:mag:` | 改进 SEO | feat |
| `:children_crossing:` | 改善用户体验与可用性 | feat / fix |
| `:thread:` | 优化多线程与并发代码 | feat / fix / refactor |

### refactor

| emoji | 含义 | 也可用于 |
| --- | --- | --- |
| `:recycle:` | 重构代码 | — |
| `:building_construction:` | 架构变更 | — |
| `:art:` | 改进代码结构与格式 | style |
| `:truck:` | 移动或重命名资源 | chore |
| `:coffin:` | 删除死代码 | chore |
| `:fire:` | 删除代码或文件 | chore |
| `:wastebasket:` | 弃用需要清理的代码 | chore |
| `:mute:` | 删除日志 | chore |
| `:bulb:` | 添加或更新源码注释 | docs |

### style / test / docs

| emoji | 含义 | type |
| --- | --- | --- |
| `:lipstick:` | 添加或更新 UI 与样式文件 | style / feat |
| `:iphone:` | 响应式设计 | style / feat |
| `:dizzy:` | 添加或更新动画与过渡 | style / feat |
| `:white_check_mark:` | 添加、更新或让测试通过 | test |
| `:test_tube:` | 添加一个失败的测试（TDD） | test |
| `:clown_face:` | mock 数据 | test |
| `:camera_flash:` | 添加或更新快照 | test |
| `:memo:` | 添加或更新文档 | docs |
| `:page_facing_up:` | 添加或更新许可证 | docs / chore |
| `:busts_in_silhouette:` | 添加或更新贡献者 | docs / chore |
| `:money_with_wings:` | 添加赞助或资金相关 | docs / chore |

### build / ci / revert / chore

| emoji | 含义 | type |
| --- | --- | --- |
| `:heavy_plus_sign:` | 添加依赖 | build |
| `:heavy_minus_sign:` | 移除依赖 | build |
| `:arrow_up:` | 升级依赖 | build |
| `:arrow_down:` | 降级依赖 | build |
| `:pushpin:` | 将依赖锁定到指定版本 | build |
| `:package:` | 添加或更新编译产物与分发包 | build |
| `:bricks:` | 基础设施相关变更 | build / chore / feat |
| `:wrench:` | 添加或更新配置文件 | chore / build |
| `:hammer:` | 添加或更新开发脚本 | chore / build |
| `:construction_worker:` | 添加或更新 CI 构建系统 | ci |
| `:rocket:` | 部署 | ci / chore |
| `:rewind:` | 回退变更 | revert |
| `:closed_lock_with_key:` | 添加或更新密钥 | chore |
| `:see_no_evil:` | 添加或更新 `.gitignore` | chore |
| `:bento:` | 添加或更新静态资源 | chore / feat |
| `:construction:` | 工作进行中 | chore |
| `:twisted_rightwards_arrows:` | 合并分支 | chore |
| `:alembic:` | 进行实验 | chore / feat |
| `:monocle_face:` | 数据探查与检查 | chore |
| `:technologist:` | 改善开发者体验 | chore |
| `:tada:` | 初始化项目 | chore / feat |
| `:poop:` | 写下待改进的糟糕代码 | chore / fix |

## 校验工具链

```
commitlint.config.mjs     规则 + EMOJI_TYPES 白名单（唯一真相源）
.husky/commit-msg         pnpm exec commitlint --edit "$1"
package.json              仓库根，只装 @commitlint/cli + config-conventional + husky
```

新克隆仓库后跑一次 `pnpm install`（在**仓库根**，不是 `frontend/`）。`prepare: husky` 会自动把 `core.hooksPath` 设成 `.husky/_`。

自己验一条消息：

```bash
echo "feat(address): :sparkles: 行政区划落库" | pnpm exec commitlint
pnpm exec commitlint --from HEAD~7 --to HEAD   # 回放校验既有提交
```

### ⚠️ 这套东西曾经整整一年没生效

2026-08-02 之前，四层同时是断的，所以**在此之前的全部提交都没被校验过**：

1. `core.hooksPath` 指向 `frontend/.husky/_` —— **这个目录根本不存在**。git 对此不报错，只是静默地一个钩子都不跑
2. `.husky/commit-msg` 里写的是 `pnpm exec --no – commitlint`，那个 `–` 是**全角连字符 U+2013**，不是 `--`
3. 仓库根没有 `package.json`，`pnpm exec` 会报 `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`
4. commitlint 和 cz-git **压根没装**，工作区里搜不到任何依赖声明

教训：**校验类工具装完必须用一条故意写错的消息验证它真的拦得住**。「配置文件存在」不等于「规则在跑」——静默失效的钩子比没有钩子更危险，因为它给了一种虚假的安全感。

另外 `pnpm exec` 不要加 `--no`：pnpm 11 已不认这个 exec 参数，会报 `Command "--no" not found`，等于把校验变成**永远失败**——而 `--no-verify` 一旦成为肌肉记忆，等于没校验。

## 分支策略

项目历史**全部直接提交到 `main`**（git user: lens），不走分支 / PR 流程。

遵循这个既有习惯，**除非用户明确要求开分支**。

## 提交分组

按逻辑分组提交：**前端 / 后端 / 文档分开**，不要一次 `git add -A` 混在一起。

开始新改动前，若工作区已有未提交的改动，**先分组提交干净**再动新代码——否则新旧改动混在一个提交里，无法单独回滚。

例外：当拆分会产出**编译不过的中间提交**时，合并成一个提交，并在 body 里写清楚为什么不拆。拆坏的提交比大提交更没用。

## 相关

- 知识沉淀闭环见 [`context/harness-framework/self-refinement.md`](../harness-framework/self-refinement.md)
- 完整 emoji 语义见 [gitmoji.dev](https://gitmoji.dev/)
