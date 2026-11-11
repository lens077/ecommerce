#!/usr/bin/env bash
# 注错：声明 doc-sync: required 的文档，其 affects 被改但文档没跟着改。
sb="$1"
cat > "$sb/docs/canary-doc.md" <<'EOF'
---
name: canary-doc
description: canary 注错样本——文档责任
doc-sync: required
affects:
  - AGENTS.md
---
# canary

本文档负责入口文档的责任映射。
EOF
printf '\ncanary: 改一行 affects 覆盖的内容。\n' >> "$sb/AGENTS.md"
