#!/usr/bin/env bash
# id: retired
# tag: RETIRED
# desc: 提到已退役组件时必须同时写明它已退役
# config: HARNESS_RETIRED_ROOTS HARNESS_RETIRED_TERMS HARNESS_RETIRED_BANNERS
#         HARNESS_RETIRED_WINDOW HARNESS_RETIRED_HEAD
#
# 不禁止提及退役组件——历史教训必须能写。要求的是：提到它时同时说清它已退役，
# 否则读者和 AI 会照着一份已死的链路去操作，失败方式还往往是「查不到」而非报错。
# 判定：命中行的 ±WINDOW 行窗口内、或文件前 HEAD 行（整篇免责横幅）内出现横幅词即放行。
# TERMS 留空 = 关闭本检查（组件退役事实属于仓库配置，不写进 kit）。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

if [ -z "$HARNESS_RETIRED_TERMS" ] || [ -z "$HARNESS_RETIRED_ROOTS" ]; then
  h_pass "未配置退役组件清单，跳过"
  exit 0
fi

while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  h_fail RETIRED "$hit 提到已退役组件却无「存量/已退役/历史」等横幅——读者会照着死链路操作"
done < <(
  for root in $HARNESS_RETIRED_ROOTS; do
    [ -d "$root" ] || continue
    while IFS= read -r file; do
      awk -v F="$file" -v RET="$HARNESS_RETIRED_TERMS" -v BAN="$HARNESS_RETIRED_BANNERS" \
          -v W="$HARNESS_RETIRED_WINDOW" -v H="$HARNESS_RETIRED_HEAD" '
        { n++; L[n]=$0; if (n<=H) head = head "\n" $0 }
        END{
          for (i=1;i<=n;i++) {
            if (L[i] !~ RET) continue
            win=""
            lo=(i-W<1?1:i-W); hi=(i+W>n?n:i+W)
            for (j=lo;j<=hi;j++) win = win "\n" L[j]
            if (win !~ BAN && head !~ BAN) printf "%s:%d\n", F, i
          }
        }' "$file"
    done < <(find "$root" -name '*.md' -type f | LC_ALL=C sort)
  done
)

[ "$H_FAILS" -eq 0 ] && h_pass "退役组件横幅合规"
[ "$H_FAILS" -eq 0 ]
