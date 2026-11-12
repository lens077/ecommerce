#!/usr/bin/env bash
# 注错：实现单标 done 且自检条目没有证据。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_SELFCHECK_GLOBS=".scratch/*/issues/*.md"
EOF
mkdir -p "$sb/.scratch/canary/issues"
cat > "$sb/.scratch/canary/issues/tmp-canary-selfcheck.md" <<'EOF'
# 实现单

Status: done

## 完成自检

- [x] 跑了门禁
EOF
