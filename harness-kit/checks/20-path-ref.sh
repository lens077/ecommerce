#!/usr/bin/env bash
# id: path-ref
# tag: PATH-REF
# desc: 正文反引号里写的仓库路径必须存在（链接检查看不到这一类）
# fast: 1
# config: HARNESS_DOC_ROOTS HARNESS_PATHREF_BASELINE

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

tmp=$(mktemp "${TMPDIR:-/tmp}/h-pathref.XXXXXX")
trap 'rm -f "$tmp"' EXIT

while IFS= read -r file; do
  # 剥反引号与剥行号在同一条 sed 里完成（每个文件一次，而不是每个 token 一次）。
  # 旧写法把行号剥离放在 while 循环里，每个 token 起一次 sed：LyraPass 125 个 md、
  # 11,005 个 token 时这一项 39.5s，sys 远大于 user，是 fork 放大而非真实计算。
  # 行号形态：`path:12`、`path:12-34`、`path:12-34,56-78`（逗号多段）。
  h_strip_fences "$file" | grep -oE '`[^`]+`' | sed -E \
    -e 's/^`//' -e 's/`$//' \
    -e 's/:[0-9]+(-[0-9]+)?(,[0-9]+(-[0-9]+)?)*$//' | while IFS= read -r tok; do
    # 只认真实存在的顶层目录开头的路径；其余（命令、口号、占位符）不判定。
    case "$tok" in
      # 含 * 的通配（含中段，如 `e2e/*.spec.ts`）是模式不是具体路径：
      # 旧写法 *'*' 只匹配「以 * 结尾」，中段通配会漏进来当作文件判、误报不存在。
      *' '*|*'*'*) continue ;;
      *'?'*|*'<'*|*'>'*|*'{'*|*'}'*|*'['*|*']'*|*'$'*|*'~'*|*'://'*) continue ;;
      /*|'#'*) continue ;;
    esac
    top="${tok%%/*}"
    [ "$top" = "$tok" ] && continue          # 没有 /，不是路径
    [ -d "$top" ] || continue                # 顶层目录不存在，不当路径看
    [ -e "$tok" ] || printf '%s\t%s\n' "$file" "$tok"
  done
done < <(h_md_files) >> "$tmp"

baseline="$REPO_ROOT/$HARNESS_PATHREF_BASELINE"
hits=$(python3 "$HARNESS_KIT/lib/baseline.py" filter --baseline "$baseline" --hits "$tmp")
while IFS=$'\t' read -r file tok; do
  [ -z "${tok:-}" ] && continue
  h_fail PATH-REF "$file → \`$tok\` 不存在（删了就改文档；确属历史陈述请在同一行写明已删除/已退役）"
done <<< "$hits"

stale=$(python3 "$HARNESS_KIT/lib/baseline.py" stale --baseline "$baseline" --hits "$tmp")
while IFS= read -r line; do
  [ -z "$line" ] && continue
  h_fail BASELINE "$HARNESS_PATHREF_BASELINE 的「$line」已不再违规，请删掉该行（反向棘轮）"
done <<< "$stale"

[ "$H_FAILS" -eq 0 ] && h_pass "正文路径全部存在"
[ "$H_FAILS" -eq 0 ]
