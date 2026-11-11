#!/usr/bin/env bash
# 门禁配置加载器（草案，未执行验证）
#
# 目的：让 verify-context.sh 里的硬编码常量集中到一个文件。
# 为什么不用 YAML：门禁必须零第三方依赖离线运行；用 bash 变量最省，缺 yq 也不会让门禁失效。
# 若目标仓本就有 yq，可改成读 harness.config.yaml（见 03-config-schema.md）。
#
# 用法：在 verify-context.sh 顶部
#   . "$(dirname "$0")/harness.config.sh"

# ---- 扫描范围 ----
HARNESS_SCAN_FILES=(AGENTS.md README.md TODO.md)   # 顶层 Markdown
HARNESS_SCAN_TREES=(context docs)                  # 全树扫描目录

# ---- context 分层 ----
HARNESS_CONTEXT_ROOT="context"
HARNESS_LAYERS=(team harness-framework decisions)
HARNESS_PROJECT_SLUG="__PROJECT_SLUG__"            # context/project/<slug>/

# ---- 预算（字节）----
HARNESS_BUDGET_AGENTS=13000
HARNESS_BUDGET_TODO=96000

# ---- 基线 ----
HARNESS_BASELINE_DIR="scripts"
HARNESS_BASELINE_FORMAT="$HARNESS_BASELINE_DIR/context-format-baseline.txt"
HARNESS_BASELINE_PROGRESS="$HARNESS_BASELINE_DIR/context-progress-baseline.txt"
HARNESS_BASELINE_PATHREF="$HARNESS_BASELINE_DIR/context-pathref-baseline.txt"
HARNESS_RATCHET="strict"                           # strict | lax（lax 会退化成永久免罪符，不推荐）

# ---- 豁免 ----
HARNESS_EXEMPT_FILES=()                            # 例：helm/files/zero-trust.yaml
HARNESS_RETIRED_TERMS=()                           # [RETIRED] 术语表
HARNESS_GENERATED_PATHS=()                         # [GENERATED]

# ---- 检查开关（目标仓用不到的整段关掉，而不是留空跑）----
HARNESS_ENABLE_EMBED=0
HARNESS_ENABLE_ENV_CONTRACT=0
HARNESS_ENABLE_DOC_OWNERSHIP=0
HARNESS_ENABLE_DEPLOYMENTS=0                       # 无部署双清单的仓必须为 0

# ---- 验证命令 ----
HARNESS_CMD_QUICK="scripts/verify-quick.sh"
HARNESS_CMD_CONTEXT_GATE="scripts/verify-context.sh"
HARNESS_CMD_CANARY="scripts/verify-context-canary.sh"

# ---- 安全检查 ----
HARNESS_SECRETS_SCANNER="gitleaks"
HARNESS_SECURITY_FAIL_CLOSED=1                     # 缺工具即红

# 自检：配置本身的引用必须存在，否则门禁会带着死引用运行
_harness_selfcheck() {
  local missing=0
  for f in "${HARNESS_SCAN_FILES[@]}"; do
    [ -e "$f" ] || { echo "[CONFIG] 扫描根不存在: $f" >&2; missing=1; }
  done
  [ -d "$HARNESS_CONTEXT_ROOT" ] || { echo "[CONFIG] context 根不存在" >&2; missing=1; }
  for l in "${HARNESS_LAYERS[@]}"; do
    [ -d "$HARNESS_CONTEXT_ROOT/$l" ] || { echo "[CONFIG] 层不存在: $l" >&2; missing=1; }
  done
  [ -d "$HARNESS_CONTEXT_ROOT/project/$HARNESS_PROJECT_SLUG" ] \
    || { echo "[CONFIG] project 目录不存在: $HARNESS_PROJECT_SLUG" >&2; missing=1; }
  return "$missing"
}

# 注意：源仓 AGENTS.md 曾把 `deploy/{base,overlays/prod}` 写成部署清单路径，而该目录不存在。
# 凡是配置里的路径，都应该有类似上面的存在性自检——否则文档与门禁会一起漂移。
