#!/usr/bin/env bash
# harness.config.sh — 本仓门禁配置（实现见 harness-kit/，入口 scripts/verify-context.sh）。
#
# 只写与 kit 默认不同的项；每项含义见 harness-kit/harness.config.example.sh。
# 业务事实（服务名、集群、退役组件清单、预算）留在这里，不进 kit。

# ── 扫描范围 ─────────────────────────────────────────────────────
HARNESS_DOC_ROOTS="AGENTS.md README.md STACK.md TODO.md context docs"
HARNESS_LAYERS="team harness-framework decisions project"
HARNESS_NESTED_LAYER="project"

# ── 预算 ─────────────────────────────────────────────────────────
HARNESS_BUDGETS="AGENTS.md:13000 TODO.md:160000"

# ── 进度源 ───────────────────────────────────────────────────────
HARNESS_PROGRESS_FILE="TODO.md"
HARNESS_PROGRESS_SCOPE="repo"
HARNESS_PROGRESS_ALLOW=".scratch/* .impeccable/* */.impeccable/* */node_modules/*"
HARNESS_PROGRESS_BASELINE="scripts/context-progress-baseline.txt"

# ── Skill 约定 ───────────────────────────────────────────────────
HARNESS_SKILL_DOC="docs/agents/skills.md"
HARNESS_SKILL_SECTION="Skills"
HARNESS_SKILL_ENTRY_DOCS="AGENTS.md context/team/runbook.md"

# ── 文档责任 ─────────────────────────────────────────────────────
# 本仓用 scripts/verify-doc-sync.py（verify-quick 与 commit-msg 钩子），kit 的 DOC-SYNC 关闭。
HARNESS_DOC_SYNC=0

# ── 敏感数据 ─────────────────────────────────────────────────────
# 本仓 gitleaks 由 verify-quick 的敏感数据段执行；kit 的 SECRETS 关闭，避免同一判定两处跑。
HARNESS_GITLEAKS="required"
HARNESS_IP_ALLOWLIST=""
HARNESS_DISABLED_CHECKS="path-ref doc-sync public-ip secrets"

# ── 经验文档格式 / 证据 ──────────────────────────────────────────
HARNESS_FORMAT_GLOBS="context/*/experience/*.md"
HARNESS_FORMAT_SECTIONS="症状;关键陷阱|陷阱"
HARNESS_FORMAT_BASELINE="scripts/context-format-baseline.txt"
HARNESS_EVIDENCE_GLOBS="context/*/experience/*.md"
HARNESS_EVIDENCE_SECTION="证据"
HARNESS_EVIDENCE_LABELS="log trace metric alert kubectl code blame db repro"

# ── frontmatter affects ──────────────────────────────────────────
HARNESS_AFFECTS_ROOTS="context docs/design"

# ── 退役物横幅 ───────────────────────────────────────────────────
# 退役依据见 context/project/ecommerce/.../live-facts.md 与 docs/TECH.md。
HARNESS_RETIRED_ROOTS="context docs/design docs/observability"
HARNESS_RETIRED_TERMS="Loki|Jaeger|fluent-bit|192\\.168\\.3\\.131|SeaweedFS"
HARNESS_RETIRED_BANNERS="存量|退役|历史|迁移期|覆盖|已删除|已停用|不再|已改|旧|撤销|uninstall|孤儿|已迁|不存在"
HARNESS_RETIRED_WINDOW=2
HARNESS_RETIRED_HEAD=10

# ── INDEX 单元格长度 ─────────────────────────────────────────────
HARNESS_INDEX_LINE_LIMITS="context/INDEX.md:120 context/**/INDEX.md:200"

# ── 实现单完成自检 ───────────────────────────────────────────────
HARNESS_SELFCHECK_GLOBS=".scratch/*/issues/*.md"
HARNESS_SELFCHECK_STATUS="^Status:[[:space:]]*done[[:space:]]*$"
HARNESS_SELFCHECK_SECTION="完成自检"
HARNESS_SELFCHECK_SEPARATOR="——"

# ── 基线 ─────────────────────────────────────────────────────────
HARNESS_PATHREF_BASELINE="scripts/context-pathref-baseline.txt"

# ── 检查开关 / 适配层 ────────────────────────────────────────────
HARNESS_CHECKS=""
HARNESS_EXTRA_CHECKS_DIR="scripts/context-adapters"
HARNESS_BASE_REF=""
