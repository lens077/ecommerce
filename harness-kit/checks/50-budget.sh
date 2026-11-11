#!/usr/bin/env bash
# id: budget
# tag: BUDGET
# desc: 入口文档的字节数不得超过预算（预算写进配置，别为变绿调大）
# config: HARNESS_BUDGET_FILES HARNESS_BUDGET_BYTES

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0
total=0

for f in $HARNESS_BUDGET_FILES; do
  [ -f "$REPO_ROOT/$f" ] || { h_fail BUDGET "$f 不存在"; continue; }
  bytes=$(wc -c < "$REPO_ROOT/$f" | tr -d ' ')
  total=$((total + bytes))
  [ "$bytes" -le "$HARNESS_BUDGET_BYTES" ] || \
    h_fail BUDGET "$f = $bytes 字节，超过预算 $HARNESS_BUDGET_BYTES"
done

h_pass "$(printf '%s' "$HARNESS_BUDGET_FILES") 共 $total / $HARNESS_BUDGET_BYTES 字节"
[ "$H_FAILS" -eq 0 ]
