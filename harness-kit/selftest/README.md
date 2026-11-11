# 自测记录（2026-11-12 实跑）

目标：证明 kit「新项目接入即绿」，并且「注错必红」。以下命令均为实际执行，不是设想。

环境：macOS，bash 3.2，Python 3，gitleaks 8.30.1（SECRETS 的可选层）。

## 1. 新项目接入

```bash
rm -rf /tmp/harness-kit-selftest/demo2 && mkdir -p /tmp/harness-kit-selftest/demo2
cp -R harness-kit /tmp/harness-kit-selftest/demo2/harness
cd /tmp/harness-kit-selftest/demo2
git init -q
harness/bin/harness init
harness/bin/harness check
```

结果：

```
created AGENTS.md / TODO.md / context/ / docs/skills.md / harness.config.sh / 三份基线 / harness.lock
harness: 10/10 项通过（OK）        # check RC=0
```

`doctor` 同时通过：`✓ harness.lock 与 kit 一致`，`✓ gitleaks: 8.30.1`。

## 2. canary（门禁的门禁）

```bash
harness/bin/harness canary
```

```
  ✓ clean-template
  ✓ mut-DEAD-LINK / PATH-REF / FRONTMATTER / INDEX-COVERAGE / BUDGET / SKILL-REF
  ✓ mut-PROGRESS-SRC / DOC-SYNC / PUBLIC-IP / SECRETS
  ✓ tag 覆盖：10 个启用 tag 均有探针
verify-canary: OK（11 探针全过...）   # RC=0
```

## 3. 注错必红

```bash
printf '\n[坏链](no-such-file.md)\n' >> AGENTS.md
harness/bin/harness check
```

```
❌ [DEAD-LINK] Markdown 相对链接的目标必须存在且未被 gitignore (0s)
  ✗ [DEAD-LINK] AGENTS.md → no-such-file.md
harness: 9/10 项通过（FAIL）        # RC=1
```

## 4. hook 安装

```bash
harness/bin/harness install-hooks
git config core.hooksPath
```

输出 `harness/hooks`，pre-commit 会跑 `check fast`，pre-push 会跑全量 + canary。

## 未验证

- GitHub Actions / GitLab Runner 上的实际执行（模板只做静态校对，未在远端跑过）。
- Windows（kit 只承诺 POSIX bash + Python 标准库）。
- 大规模仓库（万级文件）的耗时：未做性能测试，`h_md_files` 用 find，无索引。
