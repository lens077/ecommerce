#!/usr/bin/env bash
# id: evidence
# tag: EVIDENCE
# desc: 经验文档「证据」段里每条都要带来源标签
# config: HARNESS_EVIDENCE_GLOBS HARNESS_EVIDENCE_SECTION HARNESS_EVIDENCE_LABELS
#
# 只管「写了就合规」，不管「必须写」：设计类经验硬加证据段只会凑数。
# 触发它的问题：事故记录只写「查了日志发现 X」，半个月后既不知道查的是哪条日志、也没法复跑。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

if [ -z "$HARNESS_EVIDENCE_GLOBS" ]; then
  h_pass "未配置证据段约定，跳过"
  exit 0
fi

labels=$(printf '%s' "$HARNESS_EVIDENCE_LABELS" | tr -s ' ' '|')
sec="$HARNESS_EVIDENCE_SECTION"

while IFS= read -r file; do
  untagged=$(awk -v sec="$sec" -v labs="$labels" '
    /^```/ { fence = !fence; next }
    fence { next }
    # 不要用 {2,3}：Debian/Ubuntu 默认 awk 是 mawk，不支持区间量词，
    # 会把 `## 证据` 当成不匹配，导致整个段落静默不判（非 COW 容器实测发现）。
    index($0, "**" sec) == 1 || $0 ~ ("^##? " sec) { insec = 1; next }
    insec && (/^\*\*[^*]+\*\*/ || /^#+ /) { insec = 0 }
    insec && /^[-*] / && $0 !~ ("^[-*] \\[(" labs ")\\] ") { print NR }
  ' "$file" | head -3 | tr '\n' ' ')
  if [ -n "$untagged" ]; then
    h_fail EVIDENCE "$file「$sec」段第 ${untagged}行缺来源标签（[$HARNESS_EVIDENCE_LABELS]）"
  fi
done < <(h_glob_files "$HARNESS_EVIDENCE_GLOBS")

[ "$H_FAILS" -eq 0 ] && h_pass "证据段标签合规"
[ "$H_FAILS" -eq 0 ]
