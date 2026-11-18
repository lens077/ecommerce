#!/usr/bin/env bash
# 注错：提到退役组件却没写它已退役（文档已登记、frontmatter 合规）。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_RETIRED_ROOTS="context"
HARNESS_RETIRED_TERMS="canaryretired"
EOF
cat > "$sb/context/team/tmp-canary-retired.md" <<'EOF'
---
name: tmp-canary-retired
layer: team
description: canary 注错样本——术语用法
---
# canary

canaryretired 组件负责采集。
EOF
printf -- '- [tmp-canary-retired.md](tmp-canary-retired.md)\n' >> "$sb/context/team/INDEX.md"
