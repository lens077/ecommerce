#!/usr/bin/env bash
# id: index-coverage
# tag: INDEX-COVERAGE
# desc: context 下每篇文档都必须被某个 INDEX.md 收录（防孤儿文件）
# config: HARNESS_LAYERS

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

[ -d "$REPO_ROOT/context" ] || { h_pass "无 context/，跳过"; exit 0; }

# 根 INDEX 必须链接各层 INDEX，否则层入口本身就不可达。
for layer in $HARNESS_LAYERS; do
  [ -d "$REPO_ROOT/context/$layer" ] || continue
  grep -qF "$layer/INDEX.md" "$REPO_ROOT/context/INDEX.md" 2>/dev/null || \
    h_fail INDEX-COVERAGE "context/INDEX.md 未链接 $layer/INDEX.md"
done

while IFS= read -r file; do
  rel=${file#context/}
  base=$(basename "$file")
  layer=${rel%%/*}
  idx="context/$layer/INDEX.md"
  if grep -qF "$base" "$REPO_ROOT/$idx" 2>/dev/null; then
    continue
  fi
  if git -C "$REPO_ROOT" grep -lqF "$base" -- 'context/**/INDEX.md' 2>/dev/null; then
    continue
  fi
  h_fail INDEX-COVERAGE "$file 未被 $idx（或其他层 INDEX）收录"
done < <(find "$REPO_ROOT/context" -name '*.md' -type f ! -name 'INDEX.md' | sed "s#^$REPO_ROOT/##" | LC_ALL=C sort)

[ "$H_FAILS" -eq 0 ] && h_pass "INDEX 覆盖完整"
[ "$H_FAILS" -eq 0 ]
