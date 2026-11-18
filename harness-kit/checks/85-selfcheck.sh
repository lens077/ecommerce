#!/usr/bin/env bash
# id: selfcheck
# tag: SELFCHECK
# desc: 实现单标 done 时必须有「完成自检」且每条带证据
# config: HARNESS_SELFCHECK_GLOBS HARNESS_SELFCHECK_STATUS HARNESS_SELFCHECK_SECTION
#         HARNESS_SELFCHECK_SEPARATOR
#
# 「写完代码 = 任务完成」是 AI 交付最常见的假成功；自检行没有证据等于没自检。
# 默认关闭（GLOBS 为空）：这是 issue 工作流的约定，不是每个仓库都有。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

if [ -z "$HARNESS_SELFCHECK_GLOBS" ]; then
  h_pass "未配置实现单自检，跳过"
  exit 0
fi

sec="$HARNESS_SELFCHECK_SECTION"

while IFS= read -r file; do
  grep -qE "$HARNESS_SELFCHECK_STATUS" "$file" || continue
  if ! grep -qE "^## $sec" "$file"; then
    h_fail SELFCHECK "$file 标了 done 却没有「## $sec」小节"
    continue
  fi
  items=$(awk -v s="## $sec" '$0 == s {on=1; next} on && /^## / {on=0} on && /^- \[[ x]\] / {print}' "$file")
  if [ -z "$items" ]; then
    h_fail SELFCHECK "$file 的「$sec」下没有任何 \`- [x]\` / \`- [ ]\` 条目"
    continue
  fi
  while IFS= read -r it; do
    [ -z "$it" ] && continue
    tail_part="${it#*$HARNESS_SELFCHECK_SEPARATOR}"
    if [ "$tail_part" = "$it" ] || [ -z "$(printf '%s' "$tail_part" | tr -d '[:space:]')" ]; then
      h_fail SELFCHECK "$file 自检条目缺 \`$HARNESS_SELFCHECK_SEPARATOR\` 后的证据/原因：${it}"
    fi
  done <<< "$items"
done < <(h_glob_files "$HARNESS_SELFCHECK_GLOBS")

[ "$H_FAILS" -eq 0 ] && h_pass "实现单自检合规"
[ "$H_FAILS" -eq 0 ]
