#!/usr/bin/env bash
# 正样本：done 的实现单，自检每条都带证据 → 必须放行。
sb="$1"
cat >> "$sb/harness.config.sh" <<'EOF'
HARNESS_SELFCHECK_GLOBS=".scratch/*/issues/*.md"
EOF
mkdir -p "$sb/.scratch/canary/issues"
cat > "$sb/.scratch/canary/issues/tmp-canary-selfcheck-ok.md" <<'EOF'
# 实现单

Status: done

## 完成自检

- [x] 跑了门禁 —— harness 16/16 通过
- [ ] 未跑远端 CI —— 分支未 push
EOF
