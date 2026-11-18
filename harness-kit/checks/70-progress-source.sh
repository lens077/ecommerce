#!/usr/bin/env bash
# id: progress-source
# tag: PROGRESS-SRC
# desc: 复选框只允许长在唯一进度源（及其豁免目录）
# config: HARNESS_PROGRESS_FILE HARNESS_PROGRESS_SCOPE HARNESS_PROGRESS_ALLOW
#         HARNESS_PROGRESS_BASELINE
#
# 别处出现复选框 = 第二套进度视图，与进度文件必然漂移。
# 基线按「文件 → 计数」冻结存量：新增必须合规，计数增加报 PROGRESS-SRC；
# 计数下降/归零/文件消失都是基线陈旧，报 BASELINE 要求收紧（反向棘轮）。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

allowed() {
  case "$1" in
    "$HARNESS_PROGRESS_FILE") return 0 ;;
  esac
  h_glob_match_any "$1" "$HARNESS_PROGRESS_ALLOW"
}

if [ "$HARNESS_PROGRESS_SCOPE" = "doc-roots" ]; then
  files=$(h_md_files)
else
  files=$(find . -name '*.md' -type f ! -path './.git/*' ! -path '*/node_modules/*' | LC_ALL=C sort)
fi

while IFS= read -r file; do
  [ -n "$file" ] || continue
  rel=${file#./}
  allowed "$rel" && continue
  n=$(h_count_checkboxes "$file")
  base=$(awk -v p="$rel" '$1==p {print $2; exit}' "$HARNESS_PROGRESS_BASELINE" 2>/dev/null || true)
  if [ -z "$base" ]; then
    [ "$n" -gt 0 ] && h_fail PROGRESS-SRC \
      "$rel 有 ${n} 个复选框——进度真相源只有 $HARNESS_PROGRESS_FILE（存量请登记 $HARNESS_PROGRESS_BASELINE）"
  elif [ "$n" -gt "$base" ]; then
    h_fail PROGRESS-SRC "$rel 复选框由基线 ${base} 增至 ${n}——并行进度源只许减不许增"
  elif [ "$n" -eq 0 ]; then
    h_fail BASELINE "$rel 已无复选框，请从 $HARNESS_PROGRESS_BASELINE 删除该行（反向棘轮）"
  elif [ "$n" -lt "$base" ]; then
    h_fail BASELINE "$rel 复选框已降至 $n（基线记 $base），请更新 $HARNESS_PROGRESS_BASELINE 收紧棘轮"
  fi
done <<< "$files"

if [ -f "$HARNESS_PROGRESS_BASELINE" ]; then
  while IFS= read -r line; do
    entry=${line%%[[:space:]]*}
    case "$entry" in ''|\#*) continue ;; esac
    [ -f "$entry" ] || h_fail BASELINE "进度基线条目已不存在：$entry，请从 $HARNESS_PROGRESS_BASELINE 删除"
  done < "$HARNESS_PROGRESS_BASELINE"
fi

[ "$H_FAILS" -eq 0 ] && h_pass "进度源唯一"
[ "$H_FAILS" -eq 0 ]
