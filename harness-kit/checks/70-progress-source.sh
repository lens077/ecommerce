#!/usr/bin/env bash
# id: progress-source
# tag: PROGRESS-SRC
# desc: 只有唯一进度源允许出现任务复选框；其他文档出现即红（登记存量后只降不升）
# config: HARNESS_PROGRESS_FILE HARNESS_DOC_ROOTS

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

tmp=$(mktemp "${TMPDIR:-/tmp}/h-progress.XXXXXX")
trap 'rm -f "$tmp"' EXIT

while IFS= read -r file; do
  [ "$file" = "$HARNESS_PROGRESS_FILE" ] && continue
  n=$(h_strip_fences "$file" | grep -cE '^[[:space:]]*- \[[ xX]\]' || true)
  [ "${n:-0}" -gt 0 ] && printf '%s\n' "$file" >> "$tmp"
done < <(h_md_files)

baseline="$REPO_ROOT/baselines/progress.baseline.txt"
hits=$(python3 "$HARNESS_KIT/lib/baseline.py" filter --baseline "$baseline" --hits "$tmp")
while IFS= read -r file; do
  [ -z "$file" ] && continue
  h_fail PROGRESS-SRC "$file 出现任务复选框——进度只写 $HARNESS_PROGRESS_FILE；示例请放进代码围栏"
done <<< "$hits"

stale=$(python3 "$HARNESS_KIT/lib/baseline.py" stale --baseline "$baseline" --hits "$tmp")
while IFS= read -r line; do
  [ -z "$line" ] && continue
  h_fail BASELINE "baselines/progress.baseline.txt 的「$line」已不再违规，请删掉该行（反向棘轮）"
done <<< "$stale"

[ "$H_FAILS" -eq 0 ] && h_pass "进度源唯一（$HARNESS_PROGRESS_FILE）"
[ "$H_FAILS" -eq 0 ]
