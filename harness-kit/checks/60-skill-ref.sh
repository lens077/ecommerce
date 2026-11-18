#!/usr/bin/env bash
# id: skill-ref
# tag: SKILL-REF
# desc: 入口文档不得要求执行登记为不可用的 skill
# config: HARNESS_SKILL_DOC HARNESS_SKILL_SECTION HARNESS_SKILL_ENTRY_DOCS
#
# 登记表里状态命中 缺失|不采用|未装 的 skill，其名字不得以 `/名字` 出现在入口文档（围栏外）。
# 指向不存在的程序记忆比没有更糟：模型会花轮次去找。
#
# 三个已踩过的坑：
#   ① 只扫配置指定的那一张表，不扫全文——否则把普通 CLI（buf/gitleaks）也当成 skill。
#   ② 状态词必须是词表，否则换个说法就绕过去了。
#   ③ 不要用 `strip_fences x | grep -qF`：pipefail 下 grep -q 命中即退出，左侧吃 SIGPIPE
#      让管道退出码 141，if 判假，违规静默漏报。用 case 做字符串匹配。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

reg="$HARNESS_SKILL_DOC"
section="$HARNESS_SKILL_SECTION"

if [ ! -f "$reg" ]; then
  h_pass "无 $reg，跳过"
  exit 0
fi

for entry in $HARNESS_SKILL_ENTRY_DOCS; do
  [ -f "$entry" ] || continue
  entry_text=$(h_strip_fences "$entry")
  while IFS= read -r skill; do
    [ -z "$skill" ] && continue
    case "$entry_text" in
      *"\`/$skill\`"*)
        h_fail SKILL-REF "$entry 要求执行 /$skill，但 $reg 登记它不可用——装上并改登记，或改用本仓能力" ;;
    esac
  done < <(awk -v sec="$section" -F'|' '
    $0 ~ ("^## " sec) { inskills = 1; next }
    /^## / { inskills = 0 }
    inskills && /^\| `/ && $3 ~ /缺失|不采用|未装|unavailable|not installed/ {
      if (match($2, /`[^`]+`/)) print substr($2, RSTART+1, RLENGTH-2)
    }' "$reg")
done

[ "$H_FAILS" -eq 0 ] && h_pass "skill 引用均可执行"
[ "$H_FAILS" -eq 0 ]
