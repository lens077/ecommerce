#!/usr/bin/env bash
# harness.config.sh — 门禁配置（bash，不是 YAML）。
#
# 为什么不是 YAML：kit 要求零依赖，YAML 要么引第三方解析器、要么自写一个不可靠的子集；
# 配置项都是字符串/数字/列表，bash 变量足够。代价是配置是可执行代码——只放在自己的仓库里。
#
# 这个文件由 `harness init` 复制成仓库根的 harness.config.sh；改完跑 `harness doctor`。
# 这里列的是**默认值**，接入时只改与默认不同的项；删掉某项即回到默认。

# ── 扫描范围 ─────────────────────────────────────────────────────
# 参与 Markdown 检查的路径（相对仓库根；文件或目录）。
HARNESS_DOC_ROOTS="AGENTS.md TODO.md context docs"
# context 各层的目录名；层名同时用于 frontmatter 的 layer 校验。
HARNESS_LAYERS="team harness-framework decisions project"
# 形如 <层>/<项目>/<模块>/ 的两级结构；留空表示各层是平的。
HARNESS_NESTED_LAYER=""

# ── 预算 ─────────────────────────────────────────────────────────
# 每项 `<文件>:<字节数>`，空格分隔。超限先把内容搬进 context/，不要直接调大。
HARNESS_BUDGETS="AGENTS.md:16000"

# ── 进度源 ───────────────────────────────────────────────────────
# 唯一允许出现任务复选框（- [ ] / - [x]）的文件。
HARNESS_PROGRESS_FILE="TODO.md"
# repo = 全仓 *.md；doc-roots = 仅 HARNESS_DOC_ROOTS。
HARNESS_PROGRESS_SCOPE="repo"
# 额外豁免目录（shell glob，空格分隔）。
HARNESS_PROGRESS_ALLOW=".scratch/* node_modules/*"
# 存量冻结基线：每行 `<文件> <计数>  # 理由`；只许收紧不许放宽。
HARNESS_PROGRESS_BASELINE="baselines/progress.baseline.txt"

# ── Skill 约定 ───────────────────────────────────────────────────
# 记录 skill 采用状态的文档，以及其中表格的小节标题（`## Skills`）。
HARNESS_SKILL_DOC="docs/skills.md"
HARNESS_SKILL_SECTION="Skills"
# 入口文档：不得要求执行被标为不可用的 skill。
HARNESS_SKILL_ENTRY_DOCS="AGENTS.md"

# ── 文档责任 ─────────────────────────────────────────────────────
# 1 = 开启：frontmatter 写 doc-sync: required 的文档，其 affects: 覆盖的路径改动时，
#     该文档必须在同一批改动里；否则 DOC-SYNC 红。
HARNESS_DOC_SYNC=1

# ── 敏感数据 ─────────────────────────────────────────────────────
# off / optional / required。默认 required（fail-closed）：没装 gitleaks 就红，
# 避免「工具没装所以这层静默跳过」。安装见 https://github.com/gitleaks/gitleaks#installing ；
# 接入期确实装不了时显式写 HARNESS_GITLEAKS="optional"（降级会在 doctor 里提示），
# 不要改成 off——那会把整层关掉。
HARNESS_GITLEAKS="required"
# 公网 IP 检查的豁免清单（空格分隔的 IP 或 CIDR 前缀，如 203.0.113.）；空 = 不豁免。
HARNESS_IP_ALLOWLIST=""

# ── 经验文档格式 / 证据（可选）───────────────────────────────────
# 需要含固定小节的文档 glob；`find -path` 语义，* 可跨目录。
HARNESS_FORMAT_GLOBS=""
# 分号分组、竖线表示可选写法：`症状;关键陷阱|陷阱`。
HARNESS_FORMAT_SECTIONS=""
HARNESS_FORMAT_BASELINE="baselines/format.baseline.txt"
# 「证据」段每条列表项必须带来源标签；留空 = 关闭。
HARNESS_EVIDENCE_GLOBS=""
HARNESS_EVIDENCE_SECTION="证据"
HARNESS_EVIDENCE_LABELS="log trace metric alert kubectl code blame db repro"

# ── frontmatter affects ──────────────────────────────────────────
# 这些目录下文档的 affects: 条目必须真实存在。
HARNESS_AFFECTS_ROOTS="context"

# ── 退役物横幅（可选）────────────────────────────────────────────
# 退役组件词表（awk ERE）与放行横幅词；TERMS 留空 = 关闭。
HARNESS_RETIRED_ROOTS=""
HARNESS_RETIRED_TERMS=""
HARNESS_RETIRED_BANNERS="存量|退役|历史|迁移期|覆盖|已删除|已停用|不再|已改|旧|撤销|uninstall|孤儿|已迁|不存在"
HARNESS_RETIRED_WINDOW=2
HARNESS_RETIRED_HEAD=10

# ── INDEX 单元格长度（可选）──────────────────────────────────────
# 每项 `<glob>:<字数>`；INDEX 只写「管什么、何时读」。
HARNESS_INDEX_LINE_LIMITS=""

# ── 实现单完成自检（可选）────────────────────────────────────────
# 例如 `.scratch/*/issues/*.md`；留空 = 关闭。
HARNESS_SELFCHECK_GLOBS=""
HARNESS_SELFCHECK_STATUS="^Status:[[:space:]]*done[[:space:]]*$"
HARNESS_SELFCHECK_SECTION="完成自检"
HARNESS_SELFCHECK_SEPARATOR="——"

# ── 基线 ─────────────────────────────────────────────────────────
HARNESS_PATHREF_BASELINE="baselines/pathref.baseline.txt"

# ── 检查开关 ─────────────────────────────────────────────────────
# 留空 = 全部启用。写 id 或 tag（空格分隔）只启用这些；DISABLED 优先生效。
HARNESS_CHECKS=""
HARNESS_DISABLED_CHECKS=""
# 适配层检查目录（相对仓库根）。不适合进核心的仓库专属判定放这里，协议与核心检查相同。
HARNESS_EXTRA_CHECKS_DIR=""

# ── 文档责任映射（可选）─────────────────────────────────────────
# DOC-SYNC 的改动来源：留空时用 `git diff HEAD` + 暂存区；CI 里可显式给 base ref。
HARNESS_BASE_REF=""
