#!/usr/bin/env bash
# 正样本：经验文档小节齐备 → 必须放行。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_FORMAT_GLOBS="context/*/experience/*.md"
HARNESS_FORMAT_SECTIONS="症状;关键陷阱|陷阱"
EOF
mkdir -p "$sb/context/team/experience"
cat > "$sb/context/team/experience/tmp-canary-format-ok.md" <<'EOF'
---
name: tmp-canary-format-ok
layer: team
description: canary 正样本——小节齐备
---
## 症状

症状。

## 关键陷阱

陷阱。
EOF
printf -- '- [experience/tmp-canary-format-ok.md](experience/tmp-canary-format-ok.md)\n' >> "$sb/context/team/INDEX.md"
