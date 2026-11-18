#!/usr/bin/env bash
# 正样本：affects 指向真实存在的路径 → 必须放行。
sb="$1"
cat > "$sb/context/team/tmp-canary-affects-ok.md" <<'EOF'
---
name: tmp-canary-affects-ok
layer: team
description: canary 正样本——affects 指向真实路径
affects:
  - context/INDEX.md
---
# canary
EOF
printf -- '- [tmp-canary-affects-ok.md](tmp-canary-affects-ok.md)\n' >> "$sb/context/team/INDEX.md"
