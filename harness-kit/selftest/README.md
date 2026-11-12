# 自测记录（2026-11-12 实跑）

目标：证明 kit「新项目接入即绿」，并且「注错必红」。以下命令均为实际执行，不是设想。

环境：macOS，`/bin/bash` 3.2（系统自带，不是 Homebrew bash 5），Python 3，gitleaks 8.30.1。
新检查全部按 macOS 自带 bash 验证过——`case` 的模式 `)` 会提前结束 `$( )`，
heredoc 里裸写三个反引号会被当成命令替换，这两处都踩过并已修。

## 1. 新项目接入

```bash
rm -rf /tmp/harness-kit-selftest/final2 && mkdir -p /tmp/harness-kit-selftest/final2
cp -R harness-kit /tmp/harness-kit-selftest/final2/harness
cd /tmp/harness-kit-selftest/final2
git init -q
harness/bin/harness init
/bin/bash harness/bin/harness check
```

结果：

```
wrote harness.lock（kit 0.2.0）
harness: 16/16 项通过（OK）        # check RC=0
```

`doctor` 同时通过：`✓ harness.lock 与 kit 一致`，`✓ gitleaks: 8.30.1`，
启用检查为 `DEAD-LINK PATH-REF FRONTMATTER AFFECTS ORPHAN INDEX-LINE FORMAT EVIDENCE
BUDGET RETIRED SKILL-REF PROGRESS-SRC DOC-SYNC SELFCHECK PUBLIC-IP SECRETS`。

## 2. canary（门禁的门禁）

```bash
/bin/bash harness/bin/harness canary
```

```
  ✓ clean-template
  ✓ mut-DEAD-LINK / PATH-REF / FRONTMATTER / AFFECTS / ORPHAN / INDEX-LINE
  ✓ mut-FORMAT / EVIDENCE / BUDGET / RETIRED / SKILL-REF / PROGRESS-SRC
  ✓ mut-DOC-SYNC / SELFCHECK / PUBLIC-IP / SECRETS / BASELINE（基线反向棘轮）
  ✓ ok-AFFECTS / ok-INDEX-LINE / ok-FORMAT / ok-EVIDENCE / ok-RETIRED / ok-SELFCHECK
  ✓ tag 覆盖：16 个启用 tag 均有探针
verify-canary: OK（23 探针全过：干净沙箱绿 + 各类注错被拦且 tag 正确）   # RC=0
```

## 3. 注错必红

```bash
printf '\n[坏链](no-such-file.md)\n' >> AGENTS.md
harness/bin/harness check
```

```
❌ [DEAD-LINK] Markdown 相对链接的目标必须存在且未被 gitignore (0s)
  ✗ [DEAD-LINK] AGENTS.md → no-such-file.md
harness: 15/16 项通过（FAIL）        # RC=1
```

## 4. gitleaks 默认 `required` 的两条路径

工具不在 PATH 时（`PATH=/usr/bin:/bin:/usr/sbin:/sbin`，Homebrew 的 gitleaks 被屏蔽）：

```bash
harness/bin/harness check      # 默认 required
  ✗ [SECRETS] HARNESS_GITLEAKS=required 但 gitleaks 不在 PATH（fail-closed）
harness: 15/16 项通过（FAIL）   # RC=1，预期行为

harness/bin/harness doctor
  ✗ gitleaks 未安装，但 HARNESS_GITLEAKS=required（fail-closed）   # RC=1
```

显式降级（改 `harness.config.sh`，不是命令行环境变量——配置文件优先）：

```bash
HARNESS_GITLEAKS="optional"
harness/bin/harness check
harness: 16/16 项通过（OK）     # RC=0，内置明文特征仍在跑
harness/bin/harness doctor
  · gitleaks 未安装（optional：只跳过历史扫描，内置明文特征仍会跑）
```

## 5. hook 安装

```bash
harness/bin/harness install-hooks
git config core.hooksPath
```

输出 `harness/hooks`，pre-commit 会跑 `check fast`，pre-push 会跑全量 + canary。

## 未验证

- GitHub Actions / GitLab Runner 上的实际执行（模板只做静态校对，未在远端跑过）。
- Windows（kit 只承诺 POSIX bash + Python 标准库）。
- 大规模仓库（万级文件）的耗时：未做性能测试，`h_md_files` 用 find，无索引。
