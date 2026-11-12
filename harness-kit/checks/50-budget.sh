#!/usr/bin/env bash
# id: budget
# tag: BUDGET
# desc: 入口文档超过字节上限（按文件分别设限）
# config: HARNESS_BUDGETS
#
# 入口文档必须短到能被一次读完；长文一律下潜到 context/。字节而不是字数：
# 这个上限的作用是控制读取成本，不做排版指标。格式 `<文件>:<字节数>`。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

for entry in $HARNESS_BUDGETS; do
  file=${entry%:*}
  limit=${entry##*:}
  [ -f "$file" ] || continue
  size=$(wc -c < "$file" | tr -d ' ')
  if [ "$size" -gt "$limit" ]; then
    h_fail BUDGET "$file ${size} 字节 > ${limit}"
  fi
done

[ "$H_FAILS" -eq 0 ] && h_pass "入口文档预算合规"
[ "$H_FAILS" -eq 0 ]
