#!/usr/bin/env bash
# 注错：INDEX 单元格超过 120 字（根 INDEX）。
sb="$1"
printf '\n| [team/INDEX.md](team/INDEX.md) | %s |\n' "$(printf '长%.0s' $(seq 1 130))" >> "$sb/context/INDEX.md"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_INDEX_LINE_LIMITS="context/INDEX.md:120 context/**/INDEX.md:200"
EOF
