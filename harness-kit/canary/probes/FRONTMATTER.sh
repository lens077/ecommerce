#!/usr/bin/env bash
# 注错：name 与文件名不一致（其余合规，且已登记进层 INDEX）。
sb="$1"
cat > "$sb/context/team/tmp-canary-bad.md" <<'EOF'
---
name: tmp-canary-wrong-name
layer: team
description: canary 注错样本——name 与文件名不一致
---
# canary
EOF
printf -- '- [tmp-canary-bad.md](tmp-canary-bad.md)\n' >> "$sb/context/team/INDEX.md"
