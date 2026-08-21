#!/usr/bin/env bash
# impeccable 即时检查的路径过滤包装(2026-08-21)。
#
# 原配置对**所有** Edit/Write/MultiEdit 触发 hook.mjs——后端 Go/proto/文档的每次
# 编辑都要起一次 node,且检查输出会进当轮上下文,对非 UI 改动是纯噪音。
# 本包装只在被编辑文件位于 frontend/ 下时把 stdin 透传给原 hook,其余直接放行。
# Stop 钩子的全量深检不经过本包装,兜底不受影响。
set -u
input=$(cat)
hook="/Users/sumery/.claude/skills/impeccable/scripts/hook.mjs"
[ -f "$hook" ] || exit 0
case "$input" in
  *'/frontend/'*) printf '%s' "$input" | node "$hook" ;;
  *) exit 0 ;;
esac
