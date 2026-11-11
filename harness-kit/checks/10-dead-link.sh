#!/usr/bin/env bash
# id: dead-link
# tag: DEAD-LINK
# desc: Markdown 相对链接的目标必须存在且未被 gitignore
# fast: 1
# config: HARNESS_DOC_ROOTS

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

while IFS= read -r file; do
  dir=$(dirname "$file")
  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in
      http://*|https://*|mailto:*|\#*) continue ;;
      *://*) continue ;;
    esac
    path="${target%%#*}"            # 去掉 #fragment
    [ -z "$path" ] && continue
    if [ ! -e "$dir/$path" ]; then
      h_fail DEAD-LINK "$file → $target"
    elif h_gitignored "$dir/$path"; then
      # 本机存在但被 gitignore：提交树里没有它，对 fresh clone 就是死链。
      h_fail DEAD-LINK "$file → $target（目标被 gitignore，不在提交树里）"
    fi
  done < <(h_strip_fences "$file" | grep -oE '\]\([^)]+\)' | sed 's/^](//; s/)$//' || true)
done < <(h_md_files)

[ "$H_FAILS" -eq 0 ] && h_pass "链接全部可达"
[ "$H_FAILS" -eq 0 ]
