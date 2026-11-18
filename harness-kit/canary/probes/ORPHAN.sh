#!/usr/bin/env bash
# 注错：合规文档，但没登记进任何 INDEX（孤儿）。
sb="$1"
cat > "$sb/context/team/tmp-canary-orphan.md" <<'EOF'
---
name: tmp-canary-orphan
layer: team
description: canary 注错样本——未被 INDEX 收录
---
# canary
EOF
