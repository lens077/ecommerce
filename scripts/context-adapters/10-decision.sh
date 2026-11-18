#!/usr/bin/env bash
# id: decision-records
# tag: DECISION
# desc: 决策记录：路径即状态，小节齐备，「考虑过的替代方案」非空
# config: 无（本仓约定，路径固定）
#
# 本仓专属判定（不进 kit）：小节词表（问题/决策/后果/提案/验收标准/风险/否决理由）、
# 生命周期目录名、旧决策标记的日期分界，都是这套知识分层约定的编辑规则；
# 换一个仓库这些词与规则都得重写，强行通用化只会多出十个无人使用的配置项。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

decisions_dir="context/decisions"
[ -d "$decisions_dir" ] || { h_pass "无 $decisions_dir，跳过"; exit 0; }

while IFS= read -r stray; do
  h_fail DECISION "$stray 不在生命周期目录里（implemented/ | proposed/ | rejected/）"
done < <(find "$decisions_dir" -maxdepth 1 -name '*.md' ! -name INDEX.md -type f | LC_ALL=C sort)

_has_h2() { grep -qE "^## $2([[:space:]]|$)" "$1"; }
_section_nonempty() { # 该小节内是否有「- **」或「### 」开头的条目
  awk -v h="## $2" '
    $0 == h {on=1; next}
    /^## / {if (on) exit}
    on && (/^- \*\*/ || /^### /) {found=1; exit}
    END {exit found ? 0 : 1}' "$1"
}

while IFS= read -r file; do
  rel=${file#"$decisions_dir"/}
  lifecycle=${rel%%/*}
  stem=$(basename "$file" .md)
  case "$lifecycle" in
    implemented|proposed|rejected) ;;
    *) h_fail DECISION "$file 所在目录 $lifecycle 不是生命周期（implemented/proposed/rejected）"; continue ;;
  esac
  printf '%s\n' "$stem" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$' || \
    h_fail DECISION "$file 文件名须为 YYYY-MM-DD-slug（首次提出日期 + 小写 slug）"
  fm=$(awk 'NR==1{next} /^---$/{exit} {print}' "$file")
  status=$(printf '%s\n' "$fm" | sed -n 's/^status:[[:space:]]*//p' | head -1)
  [ "$status" = "$lifecycle" ] || \
    h_fail DECISION "$file frontmatter status: ${status:-<缺>} ≠ 目录 $lifecycle（路径是状态的唯一真相）"
  _has_h2 "$file" "问题" || h_fail DECISION "$file 缺 ## 问题（动机要能脱离方案独立成立）"
  case "$lifecycle" in
    implemented)
      _has_h2 "$file" "决策" || h_fail DECISION "$file 缺 ## 决策（用现在时描述已交付的事实）"
      _has_h2 "$file" "后果" || h_fail DECISION "$file 缺 ## 后果（付出了什么、换来了什么）"
      while IFS= read -r spec; do
        h_fail DECISION "$file 残留提案期标题「${spec}」——implemented 须改写为决策/后果，不能留 spec-speak"
      done < <(grep -oE '^## (提案|计划|迁移计划|验收标准|风险)([[:space:]]|$)' "$file" | sed 's/^## //; s/[[:space:]]*$//')
      ;;
    proposed)
      for h in 提案 验收标准 风险; do
        _has_h2 "$file" "$h" || h_fail DECISION "$file 缺 ## $h（proposed 三段：提案/验收标准/风险）"
      done
      ;;
    rejected)
      _has_h2 "$file" "提案" || h_fail DECISION "$file 缺 ## 提案（被否决的原提案原样冻结）"
      _has_h2 "$file" "否决理由" || h_fail DECISION "$file 缺 ## 否决理由"
      ;;
  esac
  if _has_h2 "$file" "考虑过的替代方案"; then
    _section_nonempty "$file" "考虑过的替代方案" || \
      h_fail DECISION "$file 的「考虑过的替代方案」为空——每个替代方案一条「- **名称** — 为什么输」"
  elif grep -qF '<!-- decision-format: alternatives-not-recorded -->' "$file"; then
    [ "${stem:0:10}" \< "2026-09-03" ] || \
      h_fail DECISION "$file 用了 alternatives-not-recorded 标记，但该标记只放行 2026-09-03 之前迁入的旧决策"
  else
    h_fail DECISION "$file 缺 ## 考虑过的替代方案（没记录打败了谁的决定会被反复重新争论）"
  fi
done < <(find "$decisions_dir" -mindepth 2 -name '*.md' -type f | LC_ALL=C sort)

[ "$H_FAILS" -eq 0 ] && h_pass "决策记录合规"
[ "$H_FAILS" -eq 0 ]
