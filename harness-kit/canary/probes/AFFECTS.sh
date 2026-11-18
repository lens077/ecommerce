#!/usr/bin/env bash
# 注错：affects 指向不存在的路径（文档本身合规且已登记）。
sb="$1"
cat > "$sb/context/team/tmp-canary-affects.md" <<'EOF'
---
name: tmp-canary-affects
layer: team
description: canary 注错样本——affects 指向不存在的路径
affects:
  - no/such/path.md
---
# canary
EOF
printf -- '- [tmp-canary-affects.md](tmp-canary-affects.md)\n' >> "$sb/context/team/INDEX.md"
