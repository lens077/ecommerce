# 从一个新项目从零接入

按顺序做，每步都有可观察的产出。**先让门禁对上现有仓库，再证明它会红，最后才接 hook/CI**——
顺序反了会把「红」当成 hook 的 bug，而不是门禁的发现。

前提：仓库是 git 仓库；有 `bash` 与 `python3`；不需要 Node/YAML 工具。

## 1. 放入 kit

```bash
cp -R /path/to/harness-kit <your-repo>/harness
cd <your-repo>
```

建议把 `harness/` 一起提交（vendor 形态），而不是做子模块：门禁是必需品，不能因为外部仓不可达而失效。

## 2. 生成骨架

```bash
harness/bin/harness init
```

产出（已存在的一律不覆盖）：

```
AGENTS.md                 入口文档（含 {{REPO_NAME}} 已替换）
TODO.md                   唯一进度源
context/                  四层骨架：team / harness-framework / decisions / project
docs/skills.md            skill 采用状态表
harness.config.sh         从 example 复制，接下来要改
baselines/*.txt           三份空基线
harness.lock              kit 版本与文件摘要
```

## 3. 改配置（最小集）

至少确认这几项与仓库现实一致：

```bash
# harness.config.sh
HARNESS_DOC_ROOTS="AGENTS.md TODO.md context docs"   # 参与扫描的路径，必须都存在
HARNESS_LAYERS="team harness-framework decisions project"
HARNESS_NESTED_LAYER=""                              # 有 <层>/<项目>/<模块>/ 结构时填层名
HARNESS_BUDGETS="AGENTS.md:16000"                    # 每项 <文件>:<字节>
HARNESS_PROGRESS_FILE="TODO.md"
HARNESS_SKILL_DOC="docs/skills.md"
HARNESS_GITLEAKS="required"                          # 默认值；见下方「gitleaks 没装怎么办」
# 可选：文档引用了同级仓资源时填（相对仓库根），如 "../shared/docs"
HARNESS_CANARY_EXTERNAL=""
# 可选：测试夹具里确有假凭据时按路径豁免内置特征，如 "fixtures/*"
HARNESS_SECRETS_ALLOW=""
```

改完自检：

```bash
harness/bin/harness doctor
```

`doctor` 会报：配置引用不存在的文件、`HARNESS_BUDGETS` 格式不对、gitleaks 与模式不一致、
`harness.lock` 与 kit 摘要不一致（说明本地改过 kit）。

### gitleaks 没装怎么办

默认 `HARNESS_GITLEAKS="required"` 是刻意的 fail-closed：**接入期因未装工具而红是预期行为**，
它把「装工具」变成一次明确的动作，而不是一条没人看的提示。

```bash
# 1) 先装（任选一种，见官方安装入口）
#    https://github.com/gitleaks/gitleaks#installing
brew install gitleaks          # macOS
# 2) 确认 doctor 认到工具
harness/bin/harness doctor     # 应输出 ✓ gitleaks: <版本>

# 3) 确实装不了（离线/受限环境）才显式降级——doctor 会提示当前是 optional
#    在 harness.config.sh 写：
HARNESS_GITLEAKS="optional"
```

不要写 `off`：那会把内置明文特征扫描一起关掉，等于整层消失。

## 4. 先跑一次，看红在哪

```bash
harness/bin/harness check
```

预期：新骨架通常是绿的。接进既有仓库时多半会红，按下面顺序处理：

1. **路径类**（`DEAD-LINK` / `PATH-REF`）：优先改文档，不存在的文件就是不存在。
2. **结构类**（`FRONTMATTER` / `ORPHAN`）：补 frontmatter、补 INDEX 行。
3. **预算**（`BUDGET`）：删重复内容或下沉到 `context/`，不要调大预算。
4. **存量**（`PROGRESS-SRC` 等）：只把确实排不上修复的登记基线，并写进 `TODO.md`。

基线初始化顺序（重要）：

```bash
# a. 先看全量违规，确认哪些是存量
harness/bin/harness check

# b. 生成 hits 文件（每行一条违规），只登记确实不能立刻修的
#    具体格式见 docs/adaptation.md「基线怎么用」
python3 harness/lib/baseline.py init --baseline baselines/pathref.baseline.txt --hits /tmp/hits.txt

# c. 再跑一次，必须绿；之后任何新违规都会红
harness/bin/harness check
```

## 5. 证明门禁会红

```bash
harness/bin/harness canary
```

它会：构建临时沙箱 → 干净沙箱必须绿 → 每个 tag 注入一个已知违规 → 断言 rc=1 且 tag 正确 →
新增判定类检查再跑一个正样本（`canary/positives/`）证明不误杀 →
断言「每个启用 tag 都有探针、每个要求正样本的 tag 都有正样本、每个探针都有对应 tag」。

这里红通常是四种原因：

- 新增检查没写探针（元断言报「无探针」）；
- 声明了 `POSITIVE_TAGS` 却没写 `canary/positives/<TAG>.sh`；
- 探针的注错样本没真正违反判定（改探针，不要改检查）；
- 干净沙箱就红了（模板沙箱缺文件，按报错补沙箱构建逻辑）。

`canary` 通过之前**不要**接 hook 或 CI。

## 6. 接 hook

```bash
harness/bin/harness install-hooks
git config core.hooksPath     # 应输出 harness/hooks
```

- `pre-commit` → `check fast`（链接 / 正文路径 / 公网 IP / 明文凭据）。
- `pre-push` → 全量 `check` + `canary`。

注意：`core.hooksPath` 是单值设置。如果仓库原本用 husky / lefthook / vite-plus 管钩子，
接入前先确认不会互相覆盖；必要时把 kit 的两个 hook 内容并进既有钩子，而不是抢 `core.hooksPath`。

## 7. 接 CI

- GitHub：把 `harness/ci/github-context-gate.yml` 复制成 `.github/workflows/context-gate.yml`。
- GitLab：把 `harness/ci/gitlab-context-gate.yml` 的 job 合并进 `.gitlab-ci.yml`。

CI 里 `check` 与 `canary` 必须是两步：前者证明仓库干净，后者证明门禁仍然会红。
只跑 `check` 时，一个恒绿的门禁看不出来。

0.3.1 起的模板把两步拆成两种时机：PR/MR 只跑 `doctor` + `check`；push 到默认分支或打 tag
才跑 `canary`（大仓 canary 按探针数复制多份仓库，PR 阶段不必要）。要改回每次 PR 都跑，
删掉 GitHub 模板里 canary 步骤的 `if`、或 GitLab 脚本里的条件判断即可。
理由与回退写法见 `docs/adaptation.md` 的「CI 模板：PR 只跑 doctor + check」。

## 8. 验收命令

```bash
harness/bin/harness doctor          # RC=0
harness/bin/harness check           # RC=0，最后一行 "n/n 项通过（OK）"
harness/bin/harness canary          # RC=0，最后一行 "verify-canary: OK（... 探针全过）"
printf '\n[坏链](no-such-file.md)\n' >> AGENTS.md && harness/bin/harness check; echo "期望 RC=1"
git checkout -- AGENTS.md
```

第 4 条命令必须返回 1 且输出含 `[DEAD-LINK]`；如果返回 0，说明门禁没接上，回到第 3 步。

## 9. 交给下一个 agent 的最短路径

把这三句话写进项目的 `AGENTS.md`（模板已含）：

1. 门禁入口是 `harness/bin/harness check`，改完必须跑；
2. 改检查后必须补 `canary/probes/<TAG>.sh` 并跑 `canary`；
3. 每项检查的判定与放宽方式看 `harness/docs/adaptation.md`。

## 10. 升级 kit（含 0.3.0 / 0.3.1 / 0.3.2）

0.3.0 回流了五个接入仓的本地补丁（清单见 `README.md` 的「0.3.0 变更」）。
升级时先把接入期临时改在 `harness/` 里的补丁删掉，再用新版整目录替换：

```bash
# 1) 用新 kit 替换 harness/（保留自己的 harness.config.sh、baselines/、文档）
rm -rf harness && cp -R /path/to/harness-kit harness

# 2) 对照新版 harness.config.example.sh，补上新增的可选项
#    HARNESS_CANARY_EXTERNAL（文档引用同级仓资源）
#    HARNESS_SECRETS_ALLOW（测试夹具里确有假凭据）

# 3) 重写 lock 并自检
harness/bin/harness doctor          # 应报 ✓ harness.lock 与 kit 一致
harness/bin/harness lock

# 4) 两道验收
harness/bin/harness check
harness/bin/harness canary
```

0.3.0 特别检查两项：`HARNESS_DOC_ROOTS` 里有没有子目录单文件（如 `docs/README.md`）；
文档是否引用了扫描根外的源码或同级仓资源——前者现在会被镜像，后者需要
`HARNESS_CANARY_EXTERNAL`，否则干净模板会因「路径不存在」而红。
升完把本次改动补进项目的决策记录；不要保留本地改过的 kit，`doctor` 会一直报 drift。

0.3.1 是收尾版，升级只需整目录替换后 `harness/bin/harness lock`：

- PATH-REF 会剥逗号多段行号（`docs/x.md:12-13,20-21`），不必再把这些引用写进基线；
- `canary` 改为「模板建一次、沙箱写时复制/硬链接复用、探针按 4 个一批并行」，探针互不污染；
  大仓墙钟约降到三分之一（ToDo 338.51s → 139.35s，ecommerce 384.88s → 145.08s，实测）；
- CI 模板改成 PR 只跑 `doctor` + `check`、push 默认分支/打 tag 才跑 `canary`；
  已接入的仓库按需把 `.github/workflows/context-gate.yml` 或 `.gitlab-ci.yml` 的 job 同步成新模板。

0.3.2 是 PATH-REF 的性能修正，升级同样只需整目录替换后 `harness/bin/harness lock`：

- 判定语义不变（单行、区间、逗号多段、逗号混合四种行号，以及中段/结尾 `*` 的跳过规则都与 0.3.1 相同），
  只是把剥行号从「每个 token 一次 `sed`」合并成「每个文件一次」，不需要改基线或探针；
- 大仓收益明显：LyraPass 单项 46.36s → 1.07–1.45s，ecommerce 40.07s → 1.75s（本机实测）；
- 如果你的 CI 对 `check` 有超时限制，升级后可以按新的单项耗时重新收紧。

0.3.4 是 EVIDENCE 标题层级的回归修正，升级只需整目录替换后 `harness/bin/harness lock`：

- 0.3.3 用 `^##? ` / `^#+ ` 替代 mawk 不支持的 `{m,n}`，但层级写成了 h1–h2 / h1–h6；
  0.3.4 恢复为 `^##?# `（h2–h3）与 `^#?#?# `（结束标记 h1–h3），与 0.3.2 的判定等价且 mawk 可用。
- 不改配置键、不改基线、不改探针格式；已接入仓库直接覆盖 `harness-kit/` 后重跑 `lock` 与 `doctor` 即可。
- 已用 mawk 1.3.4 实跑三种输入：`## 证据` 命中、`### 证据` 命中、`# 证据` 不命中（见 `selftest/README.md` 第 8.6 节）。
- 0.3.3 的另一部分（ext4 硬链接退路实测）仍然有效，无需重跑。

0.3.3 是 Linux/non-COW 兼容修正：

- EVIDENCE 的 awk 正则不再使用 `{2,3}`。Debian/Ubuntu 默认 `awk` 是 mawk，不支持区间量词，
  会把 `## 证据` 当成不匹配，导致整段静默不判（层级写法的问题由 0.3.4 修正）。
- 该版本在 Linux ext4 容器里用硬链接退路（`cp -al`）跑过 19 / 23 探针两种规模，
  模板未被探针污染、`.git` 不跨沙箱、并行探针无互踩（见 `selftest/README.md` 第 8 节）。
