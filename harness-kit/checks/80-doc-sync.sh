#!/usr/bin/env bash
# id: doc-sync
# tag: DOC-SYNC
# desc: 声明 doc-sync: required 的文档，其 affects 覆盖的路径改动时必须同批更新
# config: HARNESS_DOC_SYNC HARNESS_DOC_ROOTS HARNESS_BASE_REF
#
# 这是「文档责任」的机械落点：只证明文档被一起改过，不证明语义一致。
# 改动来源优先级：HARNESS_CHANGED_FILES > git diff HARNESS_BASE_REF(默认 HEAD) + 暂存区。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

[ "$HARNESS_DOC_SYNC" = 1 ] || { h_pass "已关闭（HARNESS_DOC_SYNC=0）"; exit 0; }

changed=$(h_changed_files)
if [ -z "$changed" ]; then
  h_pass "无改动来源（非 git 或工作树干净），跳过"
  exit 0
fi

while IFS= read -r file; do
  [ "$(h_fm_scalar "$file" doc-sync)" = required ] || continue
  affects=$(h_fm_list "$file" affects)
  [ -n "$affects" ] || { h_fail DOC-SYNC "$file 声明 doc-sync: required 但没有 affects"; continue; }
  touch=0
  while IFS= read -r a; do
    [ -z "$a" ] && continue
    while IFS= read -r c; do
      case "$c" in
        "$a"|"$a"/*) touch=1 ;;
      esac
    done <<< "$changed"
  done <<< "$affects"
  [ "$touch" -eq 1 ] || continue
  if ! printf '%s\n' "$changed" | grep -qxF "$file"; then
    h_fail DOC-SYNC "$file 的 affects 被改动，但本文档没有同批更新"
  fi
done < <(h_md_files)

[ "$H_FAILS" -eq 0 ] && h_pass "文档责任一致"
[ "$H_FAILS" -eq 0 ]
