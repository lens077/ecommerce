#!/usr/bin/env bash
# id: path-ref
# tag: PATH-REF
# desc: 正文反引号里写的仓库路径必须存在（链接检查看不到这一类）
# fast: 1
# config: HARNESS_DOC_ROOTS

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

tmp=$(mktemp "${TMPDIR:-/tmp}/h-pathref.XXXXXX")
trap 'rm -f "$tmp"' EXIT

while IFS= read -r file; do
  h_strip_fences "$file" | grep -oE '`[^`]+`' | sed 's/^`//; s/`$//' | while IFS= read -r tok; do
    # 只认真实存在的顶层目录开头的路径；其余（命令、口号、占位符）不判定。
    case "$tok" in
      *' '*|*'*') continue ;;
      *'?'*|*'<'*|*'>'*|*'{'*|*'}'*|*'['*|*']'*|*'$'*|*'~'*|*'://'*) continue ;;
      /*|'#'*) continue ;;
    esac
    top="${tok%%/*}"
    [ "$top" = "$tok" ] && continue          # 没有 /，不是路径
    [ -d "$top" ] || continue                # 顶层目录不存在，不当路径看
    [ -e "$tok" ] || printf '%s\t%s\n' "$file" "$tok"
  done
done < <(h_md_files) >> "$tmp"

baseline="$REPO_ROOT/baselines/pathref.baseline.txt"
hits=$(python3 "$HARNESS_KIT/lib/baseline.py" filter --baseline "$baseline" --hits "$tmp")
while IFS=$'\t' read -r file tok; do
  [ -z "${tok:-}" ] && continue
  h_fail PATH-REF "$file → \`$tok\` 不存在（删了就改文档；确属历史陈述请在同一行写明已删除/已退役）"
done <<< "$hits"

stale=$(python3 "$HARNESS_KIT/lib/baseline.py" stale --baseline "$baseline" --hits "$tmp")
while IFS= read -r line; do
  [ -z "$line" ] && continue
  h_fail BASELINE "baselines/pathref.baseline.txt 的「$line」已不再违规，请删掉该行（反向棘轮）"
done <<< "$stale"

[ "$H_FAILS" -eq 0 ] && h_pass "正文路径全部存在"
[ "$H_FAILS" -eq 0 ]
