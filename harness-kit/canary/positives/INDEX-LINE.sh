#!/usr/bin/env bash
# 正样本：INDEX 单元格在阈值内 → 必须放行。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_INDEX_LINE_LIMITS="context/INDEX.md:120 context/**/INDEX.md:200"
EOF
printf '\n| [team/INDEX.md](team/INDEX.md) | %s |\n' "$(printf '短%.0s' $(seq 1 20))" >> "$sb/context/INDEX.md"
