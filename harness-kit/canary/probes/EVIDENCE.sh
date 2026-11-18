#!/usr/bin/env bash
# 注错：证据段里有条目没带来源标签（已登记、格式合规）。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_EVIDENCE_GLOBS="context/*/experience/*.md"
EOF
mkdir -p "$sb/context/team/experience"
cat > "$sb/context/team/experience/tmp-canary-evidence.md" <<'EOF'
---
name: tmp-canary-evidence
layer: team
description: canary 注错样本——证据条目缺来源标签
---
## 症状

只有症状。

## 关键陷阱

只有陷阱。

## 证据

- 查了日志，发现超时
EOF
printf -- '- [experience/tmp-canary-evidence.md](experience/tmp-canary-evidence.md)\n' >> "$sb/context/team/INDEX.md"
