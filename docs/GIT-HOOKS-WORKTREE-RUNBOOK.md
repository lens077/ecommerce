# Git 钩子在 worktree 中静默失效：修复与验证记录

日期：2026-11-26
适用仓库：`lens077/ecommerce`（core.hooksPath 由 vite-plus 管理）

## 1. 现象

在 worktree `/Users/lens/lens077/ecommerce-http-otel`（分支 `feat/http-otel-instrumentation`）提交时，
`commit-msg` / `pre-commit` / `pre-push` 三道门禁**没有任何输出，也没有拦截**，提交直接成功。
Git 不报错，CI 也不在本地提交阶段给出任何信号——这是最危险的部分：门禁看起来存在，实际没有运行。

## 2. 根因

三层配置叠加造成「静默跳过」：

1. `core.hooksPath` 写在仓库公共配置（`.git/config`）里，而且是**相对路径**：

   ```text
   # 主仓
   $ git config --show-origin --get core.hooksPath
   file:.git/config	frontend/.vite-hooks/_

   # worktree（注意来源仍是主仓的 .git/config）
   $ git -C /Users/lens/lens077/ecommerce-http-otel config --show-origin --get core.hooksPath
   file:/Users/lens/lens077/ecommerce/.git/config	frontend/.vite-hooks/_
   ```

   相对路径按**每个 worktree 自己的根目录**解析，而不是按主仓根目录。

2. 被跟踪的只有三个外层入口脚本：

   ```text
   $ git ls-files frontend/.vite-hooks
   frontend/.vite-hooks/commit-msg
   frontend/.vite-hooks/pre-commit
   frontend/.vite-hooks/pre-push
   ```

   真正被 `core.hooksPath` 指向的 `frontend/.vite-hooks/_/` 是 `vp config --hooks` 生成的分发器目录，
   **被显式 gitignore**：

   ```text
   $ git check-ignore -v frontend/.vite-hooks/_
   .gitignore:39:frontend/.vite-hooks/_	frontend/.vite-hooks/_
   ```

   `.gitignore` 的注释也写明「fresh clone 里不存在」。新 worktree 只拿到被跟踪的外层脚本，
   拿不到 `_/`，于是 Git 在该路径下找不到任何 hook 可执行文件，直接跳过，**不告警**。

3. 即使 `_/` 存在而外层脚本缺失，也会静默放行。分发器 `_/h` 第 6 行：

   ```sh
   s=$(dirname "$(dirname "$0")")/$n   # n = hook 名，s = frontend/.vite-hooks/<hook>
   [ ! -f "$s" ] && exit 0             # 外层脚本不存在 → 静默 exit 0
   ```

   这是 vite-plus 生成物，不要手改（下次 `vp config` 会覆盖）。

结论：**判断钩子是否生效，不能看脚本是否在仓库里，必须在本机做触发验证。**

## 3. 修复（在受影响的 worktree 执行）

```bash
cd /Users/lens/lens077/ecommerce-http-otel

# 1) worktree 没有独立的 node_modules；指向主仓已安装的那份（若已存在则跳过）
ln -s /Users/lens/lens077/ecommerce/frontend/node_modules frontend/node_modules

# 2) 重新生成被 gitignore 的分发器目录
cd frontend
CI=1 ./node_modules/.bin/vp config --hooks --no-agent
```

生成后 `frontend/.vite-hooks/_/` 下应有 `h`、`pre-commit`、`pre-push`、`commit-msg` 等文件；
外层三个脚本仍是仓库跟踪版本，不要改动。`ln -s` 只在当前 worktree 留下未跟踪软链，不污染主仓。

## 4. 验证方法

### 4.1 负向触发测试（推荐，无副作用）

用一个**故意不合法**的提交信息直接触发钩子；钩子生效时必然被 commitlint 拒绝：

```bash
printf 'bad message for hook probe\n' > /tmp/hook-probe-msg.txt
git -C <repo-or-worktree> hook run commit-msg -- /tmp/hook-probe-msg.txt
echo "exit=$?"
```

预期输出（主仓与修复后的 worktree 一致）：

```text
⧗   --- input ---
bad message for hook probe
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]
VITE+ - commit-msg script failed (code 1)
probe_exit=1
```

若返回 `exit=0` 且无任何输出，说明钩子**没有运行**，不要提交。

### 4.2 结构检查

```bash
git config --show-origin --get core.hooksPath
git ls-files frontend/.vite-hooks
git check-ignore -v frontend/.vite-hooks/_
ls -l frontend/.vite-hooks/_/commit-msg
```

### 4.3 端到端

修复后的 worktree 已用真实提交 + `pre-push` 全量门禁（`scripts/verify-quick.sh`）验证通过，
变更以 `9ca3e6d5` 合入并推送；主仓提交钩子同时在位。

## 5. 本次排查结果

| 位置 | hooksPath 来源 | `_/` 分发器 | 结论 |
| --- | --- | --- | --- |
| `/Users/lens/lens077/ecommerce`（主仓） | `.git/config`，相对路径 | 存在（2026-11-17 生成） | **正常**，负向探针 exit=1 |
| `/Users/lens/lens077/ecommerce-http-otel` | 主仓 `.git/config` 共享 | 2026-11-26 重建 | **已修复**，负向探针 exit=1 |
| `/Users/lens/lens077/ecommerce-meili-retirement` | 共享 | 缺失 | 有同样风险，提交前需修 |
| `/Users/lens/WorkBuddy/Worktrees/ecommerce/main-1f6f5f6f` | 共享 | 缺失 | 有同样风险 |
| `/Users/lens/WorkBuddy/Worktrees/ecommerce/main-4eddb7fc` | 共享 | 缺失 | 有同样风险 |
| `/Users/lens/WorkBuddy/Worktrees/ecommerce/main-cfa167c8` | 共享 | 缺失 | 有同样风险 |
| `/Users/lens/WorkBuddy/Worktrees/ecommerce/main-fe03354a` | 共享 | 缺失 | 有同样风险 |
| `/Users/lens/WorkBuddy/Worktrees/ecommerce/main-42043b57` | 无（已 prunable） | 目录不存在 | 可忽略/清理 worktree 登记 |

主仓本次**没有**同样问题：`_/` 目录存在，且负向触发测试证明 commitlint 与 doc-sync 链路确实执行。

## 6. 约定

- 新建 worktree 后、第一次提交前，先跑 §4.1 的负向探针；这应成为与 `pnpm install` 同级的准备步骤。
- 门禁「没输出」不等于「通过」：钩子缺失和钩子放行在 git 层面表现相同。
- 不要把 `_/` 加入版本控制，也不要手改 `_/h`；它是 `vp config` 的生成物，重建即可。
- 绕过门禁只能用显式环境变量（`SKIP_GITLEAKS=1`、`SKIP_VERIFY=1`）并在提交信息里说明理由；
  钩子缺失导致的绕过不是「绕过」，是事故。
