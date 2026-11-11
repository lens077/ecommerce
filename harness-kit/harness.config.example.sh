#!/usr/bin/env bash
# harness.config.sh — 门禁配置（bash，不是 YAML）。
#
# 为什么不是 YAML：kit 要求零依赖，YAML 要么引第三方解析器、要么自写一个不可靠的子集；
# 配置项都是字符串/数字/列表，bash 变量足够。代价是配置是可执行代码——只放在自己的仓库里。
#
# 这个文件由 `harness init` 复制成仓库根的 harness.config.sh；改完跑 `harness doctor`。

# ── 扫描范围 ─────────────────────────────────────────────────────
# 哪些路径参与 Markdown 检查（相对仓库根；可以是文件或目录）。
# 默认值 = `harness init` 会生成的骨架；接进既有仓库时按自己的目录结构改。
HARNESS_DOC_ROOTS="AGENTS.md TODO.md context docs"

# context 四层的目录名（相对仓库根）。层名同时用于 frontmatter 的 layer 校验。
HARNESS_LAYERS="team harness-framework decisions project"

# ── 预算 ─────────────────────────────────────────────────────────
# 入口文档的字节预算：[BUDGET] 超过即红。按项目规模调，不要为了变绿直接调大。
HARNESS_BUDGET_FILES="AGENTS.md"
HARNESS_BUDGET_BYTES=16000

# ── 进度源 ───────────────────────────────────────────────────────
# 唯一允许出现任务复选框（- [ ] / - [x]）的文件；其他文档出现即红。
HARNESS_PROGRESS_FILE="TODO.md"

# ── Skill 约定 ───────────────────────────────────────────────────
# 记录 skill 采用状态的文档，以及其中表格的小节标题（`## Skills`）。
HARNESS_SKILL_DOC="docs/skills.md"
HARNESS_SKILL_SECTION="Skills"
# 入口文档：不得提及被标为不可用的 skill。
HARNESS_ENTRY_DOCS="AGENTS.md"

# ── 文档责任 ─────────────────────────────────────────────────────
# 1 = 开启：frontmatter 写 doc-sync: required 的文档，其 affects: 覆盖的路径改动时，
#     该文档必须在同一批改动里；否则 DOC-SYNC 红。
HARNESS_DOC_SYNC=1

# ── 敏感数据 ─────────────────────────────────────────────────────
# off / optional / required：gitleaks 缺失时 required 直接红（fail-closed）。
HARNESS_GITLEAKS=optional
# 公网 IP 检查的豁免清单（每行一个 IP 或 CIDR 前缀，如 203.0.113.）；空 = 不豁免。
HARNESS_IP_ALLOWLIST=""

# ── 检查开关 ─────────────────────────────────────────────────────
# 留空 = 全部启用。写 id 或 tag（空格分隔）只启用这些；HARNESS_DISABLED_CHECKS 优先生效。
HARNESS_CHECKS=""
HARNESS_DISABLED_CHECKS=""

# ── 文档责任映射（可选）─────────────────────────────────────────
# DOC-SYNC 的改动来源：留空时用 `git diff HEAD` + 暂存区；CI 里可显式给 base ref。
HARNESS_BASE_REF=""
