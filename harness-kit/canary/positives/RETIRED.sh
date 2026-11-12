#!/usr/bin/env bash
# 正样本：提到退役组件时写明已退役 → 必须放行。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_RETIRED_ROOTS="context"
HARNESS_RETIRED_TERMS="canaryretired"
EOF
cat > "$sb/context/team/tmp-canary-retired-ok.md" <<'EOF'
---
name: tmp-canary-retired-ok
layer: team
description: canary 正样本——带横幅
---
# canary

canaryretired 已退役，不再采集。
EOF
printf -- '- [tmp-canary-retired-ok.md](tmp-canary-retired-ok.md)\n' >> "$sb/context/team/INDEX.md"
