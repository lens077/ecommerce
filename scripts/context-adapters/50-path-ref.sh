#!/usr/bin/env bash
# id: path-ref-repo
# tag: PATH-REF
# desc: 正文反引号里的仓库路径必须存在（scripts/path-refs.py）
# config: HARNESS_PATHREF_BASELINE
#
# 本仓专属：判定规则（gitignore 的本机文件、同行写明已删除/退役的历史陈述、
# 「X 仓」同级仓路径、扫描范围）全在 scripts/path-refs.py 里，属于本仓约定。
# kit 自带的通用 path-ref 检查在本仓关闭（HARNESS_DISABLED_CHECKS=path-ref），
# 避免同一 tag 重复判定。
# 基线每行 `<文件>\t<路径>`，反向棘轮：修好必须删行。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

baseline=${HARNESS_PATHREF_BASELINE:-scripts/context-pathref-baseline.txt}
hits=$(python3 scripts/path-refs.py check)

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  if [ -f "$baseline" ] && grep -qxF "$hit" "$baseline"; then
    continue
  fi
  h_fail PATH-REF "${hit%%	*} → \`${hit#*	}\` 不存在（路径已删/已搬就改文档；确属历史陈述就在同一行写明已删除/已退役）"
done <<< "$hits"

if [ -f "$baseline" ]; then
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    printf '%s\n' "$hits" | grep -qxF "$line" || \
      h_fail BASELINE "$baseline 的「${line}」已不再违规，请删除该行（反向棘轮）"
  done < "$baseline"
fi

[ "$H_FAILS" -eq 0 ] && h_pass "正文路径全部存在"
[ "$H_FAILS" -eq 0 ]
