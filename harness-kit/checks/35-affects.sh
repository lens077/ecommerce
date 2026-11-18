#!/usr/bin/env bash
# id: affects
# tag: AFFECTS
# desc: frontmatter 的 affects 条目必须是非空、无通配符、真实存在的路径
# config: HARNESS_AFFECTS_ROOTS
#
# affects 是「改动影响面」的声明，指向不存在的路径等于失效的契约。允许不写；
# 写了就得逐条对得上磁盘。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

for root in $HARNESS_AFFECTS_ROOTS; do
  [ -d "$root" ] || continue
  while IFS= read -r file; do
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      case "$entry" in
        *'*'*|*'?'*|*'['*)
          h_fail AFFECTS "$file 的 affects 含通配符：$entry"
          continue ;;
      esac
      [ -e "$entry" ] || h_fail AFFECTS "$file 的 affects 指向不存在的路径：$entry"
    done < <(h_fm_list "$file" affects)
  done < <(find "$root" -name '*.md' -type f | LC_ALL=C sort)
done

[ "$H_FAILS" -eq 0 ] && h_pass "affects 均指向真实路径"
[ "$H_FAILS" -eq 0 ]
