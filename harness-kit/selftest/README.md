# 自测记录（2026-11-12 实跑，kit 0.3.2）

目标：证明 kit「新项目接入即绿」，并且「注错必红」。以下命令均为实际执行，不是设想。

环境：macOS，`/bin/bash` 3.2（系统自带，不是 Homebrew bash 5），Python 3，gitleaks 8.30.1。
新检查全部按 macOS 自带 bash 验证过——`case` 的模式 `)` 会提前结束 `$( )`，
heredoc 里裸写三个反引号会被当成命令替换，这两处都踩过并已修。

## 0. 0.3.2 性能版

LyraPass 报告 PATH-REF 在 125 个 md、11,005 个反引号 token 下耗时 39.5s（整个检查 44s 的 90%），
特征是 `sys` 远大于 `user`。原因是剥行号写在 `while read` 循环里，每个 token 起一次 `sed`。

### 0.1 改前 / 改后（实测，不是估算）

改法是：把剥反引号与剥行号合并进同一条 `sed`，每个文件一次。命令（只跑 PATH-REF 这一项）：

```bash
run_pr() { env HARNESS_KIT="$1" HARNESS_REPO_ROOT="$2" HARNESS_CONFIG="$2/harness.config.sh" \
  bash -c '. "$HARNESS_KIT/lib/config.sh"; . "$HARNESS_KIT/lib/runner.sh"; h_detect_roots; h_load_config; \
           cd "$REPO_ROOT" && bash "$HARNESS_KIT/checks/20-path-ref.sh"'; }
/usr/bin/time -p bash -c "$(declare -f run_pr); run_pr <kit> <repo>"
```

| 对象 | 规模 | 0.3.1 | 0.3.2 |
| --- | --- | --- | --- |
| 合成样本（8 个 md，2000 个带行号 token） | 2000 token | 7.41s / 7.60s | 0.24s / 0.26s |
| ecommerce | 约 4 千 token | 40.07s | 1.75s / 1.76s |
| LyraPass | 125 md / 11,005 token | 46.36s | 1.07s / 1.45s |

合成样本的 `time -p` 分解：0.3.1 为 `user 1.87 / sys 4.93`，0.3.2 为 `user 0.13 / sys 0.11`——
`sys` 的下降就是 fork 放大被消掉。旧实现 2000 token 触发 1211 次外部进程，新实现 11 次。
判定语义不变：ecommerce 与 LyraPass 上新旧输出的逐字节 `diff` 为空，rc 相同。

### 0.2 canary 新增两条自检

```
  ✓ selfcheck path-ref-line-forms: 四种行号形态与通配跳过
  ✓ selfcheck path-ref-fork-count: 1200 个 token 仅 11 次外部进程（与 token 数无关）
```

`path-ref-line-forms` 在沙箱里写单行 `:1149`、区间 `:1149-1164`、逗号多段
`:1149-1164,1196-1223`、逗号混合 `:1149,1196-1223`，以及 `docs/*.md`、`src/foo*`，
要求全部放行；真缺失仍由 `path-ref-patterns` 证明会红。

`path-ref-fork-count` 用 PATH 垫片包住 `sed`/`awk` 统计调用次数，样本 4 个文件、1200 个 token，
断言不超过 32 次。它不测墙钟，所以慢机器不会假红；旧实现（每 token 一次 sed）是 1211 次。

## 1. 0.3.1 收尾版（历史）

### 1.1 PATH-REF 逗号多段行号（修前红、修后绿）

同一份文档 `AGENTS.md` 写两段引用：

```text
切片 `docs/subsystems/core.md:1149-1164,1196-1223` 与 `src/foo.rs:984-993,1003-1007`。
```

0.3.0 的 kit（`git archive b93ecfdb`）跑 `check`：

```
❌ [PATH-REF] 正文反引号里写的仓库路径必须存在（链接检查看不到这一类） (0s)
  ✗ [PATH-REF] AGENTS.md → `docs/subsystems/core.md:1149-1164,1196-1223` 不存在
  ✗ [PATH-REF] AGENTS.md → `src/foo.rs:984-993,1003-1007` 不存在
harness: 0/1 项通过（FAIL）
```

0.3.1 跑同一份仓库：

```
✅ [PATH-REF] 正文反引号里写的仓库路径必须存在（链接检查看不到这一类） (1s)
harness: 1/1 项通过（OK）
```

kit 的 canary 把这条固定成 `selfcheck path-ref-line-forms`（0.3.2 起覆盖四种行号形态），以后改剥离逻辑会当场红。

### 1.2 canary 成本（实测，不是估算）

同一台机器、同一批探针、`/usr/bin/time -p`：

| 仓库 | 0.3.0 | 0.3.1 | 0.3.1 内部分段 |
| --- | --- | --- | --- |
| ToDo（561 个已跟踪文件，23 探针） | 338.51s | 139.35s | 模板 2s；各探针沙箱合计 22s；门禁合计 426s（并行 CPU 时间） |
| ecommerce（1794 个已跟踪文件，19 探针） | 384.88s | 145.08s | 模板 3s；各探针沙箱合计 29s；门禁合计 388s |

改动是两半：

1. 模板只建一次；探针沙箱优先 `cp -cR` 写时复制克隆，无 COW 的文件系统退回
   `cp -al` 整树硬链接（可变路径断开硬链接换成真拷贝），再不行才 `cp -R`。
2. 探针彼此独立，按 4 个一批并行；每个探针仍完整跑一遍门禁，断言一条不少。

分段数据也说明：APFS 上复制本来只占十几秒，5–6 分钟的大头是串行跑门禁。
并行才是墙钟从约 6 分钟降到约 2 分钟的原因。

### 1.3 canary 自身的新自检

```
  ✓ selfcheck template-mirror: 已跟踪文件树完整
  ✓ selfcheck probe-isolation: 注错只落在自己的沙箱（写时复制克隆）
  ✓ selfcheck path-ref-comma-ranges: 逗号多段行号放行
```

`probe-isolation` 往沙箱里的 `AGENTS.md` 追加一行，断言模板摘要不变、沙箱确实写进去了；
走硬链接路径时会额外报告「源码树硬链接复用」，走整树复制时报告「整树复制」。

## 2. 新项目接入（0.3.0）

```bash
rm -rf /tmp/harness-kit-030 && mkdir -p /tmp/harness-kit-030
cp -R harness-kit /tmp/harness-kit-030/harness
cd /tmp/harness-kit-030
git init -q
harness/bin/harness init
/bin/bash harness/bin/harness check
```

结果：

```
wrote harness.lock（kit 0.3.0）
harness: 16/16 项通过（OK）        # check RC=0
```

`doctor` 同时通过：`✓ harness.lock 与 kit 一致`，`✓ gitleaks: 8.30.1`，
启用检查为 `DEAD-LINK PATH-REF FRONTMATTER AFFECTS ORPHAN INDEX-LINE FORMAT EVIDENCE
BUDGET RETIRED SKILL-REF PROGRESS-SRC DOC-SYNC SELFCHECK PUBLIC-IP SECRETS`。

## 3. canary（门禁的门禁，0.3.0 输出；0.3.1 / 0.3.2 见第 0、1 节）

```bash
/bin/bash harness/bin/harness canary
```

```
canary: 构建模板沙箱
  ✓ clean-template
  ✓ selfcheck hook-git-dir: GIT_DIR 存在时仍解析到仓库根
  ✓ selfcheck template-mirror: 已跟踪文件树完整
  · selfcheck gitleaks-copy: 宿主无 .gitleaks.toml，跳过
  ✓ selfcheck doc-root-single-file: 子目录单文件扫描根可复制
  ✓ selfcheck external-paths: 仓库外资源按相对位置铺设
  ✓ selfcheck path-ref-patterns: 通配与 path:line 放行、真缺失仍红
  ✓ selfcheck secrets-allowlist: 豁免生效、去掉豁免即红
  ✓ selfcheck skill-ref-probe: 探针读取配置路径
  ✓ mut-DEAD-LINK / PATH-REF / FRONTMATTER / AFFECTS / ORPHAN / INDEX-LINE
  ✓ mut-FORMAT / EVIDENCE / BUDGET / RETIRED / SKILL-REF / PROGRESS-SRC
  ✓ mut-DOC-SYNC / SELFCHECK / PUBLIC-IP / SECRETS
  ✓ ok-AFFECTS / ok-INDEX-LINE / ok-FORMAT / ok-EVIDENCE / ok-RETIRED / ok-SELFCHECK
  ✓ tag 覆盖：16 个启用 tag 均有探针
verify-canary: OK（23 探针全过：干净沙箱绿 + 各类注错被拦且 tag 正确）   # RC=0
```

## 4. 注错必红

```bash
printf '\n[坏链](no-such-file.md)\n' >> AGENTS.md
harness/bin/harness check
```

```
❌ [DEAD-LINK] Markdown 相对链接的目标必须存在且未被 gitignore (0s)
  ✗ [DEAD-LINK] AGENTS.md → no-such-file.md
harness: 15/16 项通过（FAIL）        # RC=1
```

## 5. 接入补丁的三个场景（0.3.0 新增）

**hook 场景（绝对 `GIT_DIR`）**：`install-hooks` 后用 `GIT_DIR="$(pwd)/.git"` 提交。
旧实现会把工作树根解析到 `harness/`，配置校验报一串「AGENTS.md 不存在」并挡住提交；
0.3.0 输出 `4/4 项通过（OK）`，提交成功。

**子目录单文件扫描根**：`HARNESS_DOC_ROOTS` 含 `meta/README.md` 时，
`check` 16/16、`canary` 23 探针全过（旧实现建模板时 `cp` 因父目录不存在失败）。

**通配符路径**：正文写 `harness/bin/harness:5` 与 `context/*.md` 时 `check` 16/16；
再追加 `context/definitely-missing.md` 后 RC=1 且输出 `[PATH-REF]`。
旧实现会对前两者误报「不存在」（已在 `/tmp/pre-fix-check` 复现）。

**仓库外资源**：`HARNESS_CANARY_EXTERNAL="../shared-docs"` 时，
`canary` 的 `clean-template` 为绿（资源按相对位置铺到了沙箱外层）。

## 6. gitleaks 默认 `required` 的两条路径

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

## 7. hook 安装

```bash
harness/bin/harness install-hooks
git config core.hooksPath
```

输出 `harness/hooks`，pre-commit 会跑 `check fast`，pre-push 会跑全量 + canary。

## 未验证

- GitHub Actions / GitLab Runner 上的实际执行（模板只做静态校对，未在远端跑过）。
- Windows（kit 只承诺 POSIX bash + Python 标准库）。
- 无 COW 文件系统（Linux ext4、部分容器卷）上的 canary 硬链接路径与耗时：
  本机是 APFS，实际走的是 `cp -cR` 克隆分支；硬链接分支只有 `probe-isolation` 的逻辑覆盖。
