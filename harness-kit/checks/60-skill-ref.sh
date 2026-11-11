#!/usr/bin/env bash
# id: skill-ref
# tag: SKILL-REF
# desc: skill 表声明的采用状态必须与入口文档一致；标为不可用的 skill 不得被入口文档要求执行
# config: HARNESS_SKILL_DOC HARNESS_SKILL_SECTION HARNESS_ENTRY_DOCS
#
# 列契约：第 1 列是 skill 名（反引号包裹），第 2 列是状态词。
# 状态命中「缺失 / 不采用 / 未装 / unavailable」即视为不可用。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

doc="$REPO_ROOT/$HARNESS_SKILL_DOC"
[ -f "$doc" ] || { h_pass "无 skill 表（$HARNESS_SKILL_DOC），跳过"; exit 0; }

rows=$(awk -v sec="$HARNESS_SKILL_SECTION" '
  $0 == "## "sec { on=1; next }
  on && /^## / { exit }
  on && /^\|/ { print }
' "$doc")

unavailable=""
while IFS= read -r row; do
  [ -z "$row" ] && continue
  case "$row" in *'---'*) continue ;; esac
  name=$(printf '%s' "$row" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')
  status=$(printf '%s' "$row" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $3); print $3}')
  [ -z "$name" ] && continue
  name=${name//\`/}
  case "$status" in
    *缺失*|*不采用*|*未装*|*unavailable*|*"not installed"*) unavailable="$unavailable $name" ;;
  esac
done <<< "$rows"

for name in $unavailable; do
  for entry in $HARNESS_ENTRY_DOCS; do
    if grep -qF "$name" "$REPO_ROOT/$entry" 2>/dev/null; then
      h_fail SKILL-REF "$entry 提到了不可用的 skill「$name」——入口文件不得要求执行它"
    fi
  done
done

[ "$H_FAILS" -eq 0 ] && h_pass "skill 状态与入口文档一致（不可用：${unavailable:-无}）"
[ "$H_FAILS" -eq 0 ]
