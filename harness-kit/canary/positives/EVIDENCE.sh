#!/usr/bin/env bash
# 正样本：证据条目都带来源标签 → 必须放行。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_EVIDENCE_GLOBS="context/*/experience/*.md"
EOF
mkdir -p "$sb/context/team/experience"
cat > "$sb/context/team/experience/tmp-canary-evidence-ok.md" <<'EOF'
---
name: tmp-canary-evidence-ok
layer: team
description: canary 正样本——证据带标签
---
## 症状

症状。

## 关键陷阱

陷阱。

## 证据

- [log] 查了网关访问日志，502 集中在发布后 3 分钟
EOF
printf -- '- [experience/tmp-canary-evidence-ok.md](experience/tmp-canary-evidence-ok.md)\n' >> "$sb/context/team/INDEX.md"
