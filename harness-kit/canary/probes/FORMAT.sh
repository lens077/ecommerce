#!/usr/bin/env bash
# 注错：经验文档缺「关键陷阱」小节（已登记、frontmatter 合规）。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_FORMAT_GLOBS="context/*/experience/*.md"
HARNESS_FORMAT_SECTIONS="症状;关键陷阱|陷阱"
EOF
mkdir -p "$sb/context/team/experience"
cat > "$sb/context/team/experience/tmp-canary-format.md" <<'EOF'
---
name: tmp-canary-format
layer: team
description: canary 注错样本——缺关键陷阱小节
---
## 症状

只有症状。
EOF
printf -- '- [experience/tmp-canary-format.md](experience/tmp-canary-format.md)\n' >> "$sb/context/team/INDEX.md"
