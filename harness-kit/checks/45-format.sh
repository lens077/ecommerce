#!/usr/bin/env bash
# id: format
# tag: FORMAT
# desc: 经验文档必须包含约定的若干小节
# config: HARNESS_FORMAT_GLOBS HARNESS_FORMAT_SECTIONS HARNESS_FORMAT_BASELINE
#
# 小节写法接受 **标题** / **标题：副标题** / ## 标题 / ### 标题。
# 基线只冻结存量；已合规、文件消失都属于基线陈旧，按反向棘轮报 BASELINE。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

in_baseline() {
  [ -f "$HARNESS_FORMAT_BASELINE" ] || return 1
  h_baseline_paths "$HARNESS_FORMAT_BASELINE" | grep -qxF "$1"
}

has_section() { # has_section <file> <标题>
  grep -qE "^\*\*$2([：:][^*]*)?\*\*|^#{2,3} $2" "$1"
}

if [ -z "$HARNESS_FORMAT_GLOBS" ]; then
  h_pass "未配置经验文档格式，跳过"
  exit 0
fi

matched=""
while IFS= read -r file; do
  matched="$matched$file
"
  ok=1
  IFS=';' read -r -a groups <<< "$HARNESS_FORMAT_SECTIONS"
  for group in "${groups[@]}"; do
    found=0
    IFS='|' read -r -a alts <<< "$group"
    for alt in "${alts[@]}"; do
      [ -n "$alt" ] || continue
      has_section "$file" "$alt" && { found=1; break; }
    done
    [ "$found" -eq 1 ] || ok=0
  done

  if [ "$ok" -eq 0 ]; then
    in_baseline "$file" || h_fail FORMAT "$file 缺约定小节（$HARNESS_FORMAT_SECTIONS）"
  elif in_baseline "$file"; then
    h_fail BASELINE "$file 已合规，请从 $HARNESS_FORMAT_BASELINE 删除该行（反向棘轮）"
  fi
done < <(h_glob_files "$HARNESS_FORMAT_GLOBS")

if [ -f "$HARNESS_FORMAT_BASELINE" ]; then
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    case "$matched" in
      *"$entry"$'\n'*) ;;
      *) h_fail BASELINE "基线条目已不存在或不再受检：$entry，请从 $HARNESS_FORMAT_BASELINE 删除" ;;
    esac
  done < <(h_baseline_paths "$HARNESS_FORMAT_BASELINE")
fi

[ "$H_FAILS" -eq 0 ] && h_pass "经验文档格式合规"
[ "$H_FAILS" -eq 0 ]
