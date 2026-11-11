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
HARNESS_BUDGET_FILES="AGENTS.md"
HARNESS_BUDGET_BYTES=16000
HARNESS_PROGRESS_FILE="TODO.md"
HARNESS_SKILL_DOC="docs/skills.md"
HARNESS_GITLEAKS=optional
```

改完自检：

```bash
harness/bin/harness doctor
```

`doctor` 会报：配置引用不存在的文件、`HARNESS_BUDGET_BYTES` 非整数、gitleaks 与模式不一致、
`harness.lock` 与 kit 摘要不一致（说明本地改过 kit）。

## 4. 先跑一次，看红在哪

```bash
harness/bin/harness check
```

预期：新骨架通常是绿的。接进既有仓库时多半会红，按下面顺序处理：

1. **路径类**（`DEAD-LINK` / `PATH-REF`）：优先改文档，不存在的文件就是不存在。
2. **结构类**（`FRONTMATTER` / `INDEX-COVERAGE`）：补 frontmatter、补 INDEX 行。
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
断言「每个启用 tag 都有探针、每个探针都有对应 tag」。

这里红通常是三种原因：

- 新增检查没写探针（元断言报「无探针」）；
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
