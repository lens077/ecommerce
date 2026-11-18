#!/usr/bin/env bash
# id: index-coverage
# tag: ORPHAN
# desc: 每篇 context 文档都要被所在层的 INDEX 收录；嵌套层还要逐级登记项目与模块
# config: HARNESS_LAYERS HARNESS_NESTED_LAYER
#
# 设计文档失去了索引就没人能找到它。普通层查「层 INDEX 收录本篇」；
# 配了 HARNESS_NESTED_LAYER（如 project）时，额外查 <层>/<项目>/<模块> 三级登记。
# 层 INDEX 不存在时退化为「任意 INDEX 收录」，让最小仓库也能通过。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

[ -f context/INDEX.md ] || { h_pass "无 context/INDEX.md，跳过"; exit 0; }

for layer in $HARNESS_LAYERS; do
  [ -d "context/$layer" ] || continue
  if [ -f "context/$layer/INDEX.md" ]; then
    grep -qF "$layer/INDEX.md" context/INDEX.md || \
      h_fail ORPHAN "context/INDEX.md 未收录 $layer/INDEX.md"
  elif [ -n "$HARNESS_NESTED_LAYER" ] && [ "$layer" = "$HARNESS_NESTED_LAYER" ]; then
    for pidx in "context/$layer"/*/INDEX.md; do
      [ -f "$pidx" ] || continue
      grep -qF "$layer/$(basename "$(dirname "$pidx")")/INDEX.md" context/INDEX.md || \
        h_fail ORPHAN "context/INDEX.md 未收录 ${pidx#context/}"
    done
  fi
done

for layer in $HARNESS_LAYERS; do
  [ -d "context/$layer" ] || continue

  if [ -n "$HARNESS_NESTED_LAYER" ] && [ "$layer" = "$HARNESS_NESTED_LAYER" ]; then
    found_project=0
    for pidx in "context/$layer"/*/INDEX.md; do
      [ -f "$pidx" ] || continue
      found_project=1
      project=$(basename "$(dirname "$pidx")")
      # 有层 INDEX 时项目登记在层 INDEX；没有时（如本仓 project/）由根 INDEX 直接收录。
      if [ -f "context/$layer/INDEX.md" ]; then
        grep -qF "$project/INDEX.md" "context/$layer/INDEX.md" || \
          h_fail ORPHAN "context/$layer/INDEX.md 未收录 $project/INDEX.md"
      fi

      for midx in "context/$layer/$project"/*/INDEX.md; do
        [ -f "$midx" ] || continue
        module=$(basename "$(dirname "$midx")")
        grep -qF "$module/INDEX.md" "$pidx" || \
          h_fail ORPHAN "$pidx 未收录 $module/INDEX.md"

        while IFS= read -r f; do
          grep -qF "$(basename "$f")" "$midx" || \
            h_fail ORPHAN "$f 未登记在 $midx"
        done < <(find "context/$layer/$project/$module" -name '*.md' -type f ! -name INDEX.md | LC_ALL=C sort)
      done
    done
    [ "$found_project" -eq 1 ] && continue
  fi

  idx="context/$layer/INDEX.md"
  while IFS= read -r f; do
    if [ -f "$idx" ]; then
      grep -qF "$(basename "$f")" "$idx" || h_fail ORPHAN "$f 未登记在 $idx"
    elif ! grep -qrF "$(basename "$f")" --include='INDEX.md' context; then
      h_fail ORPHAN "$f 未被任何 INDEX 收录"
    fi
  done < <(find "context/$layer" -name '*.md' -type f ! -name INDEX.md | LC_ALL=C sort)
done

[ "$H_FAILS" -eq 0 ] && h_pass "context 文档均已登记"
[ "$H_FAILS" -eq 0 ]
