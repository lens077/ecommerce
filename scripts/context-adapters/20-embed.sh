#!/usr/bin/env bash
# id: embed
# tag: EMBED
# desc: 受管代码块与源码一致（scripts/doc-embed.py --check）
# config: 无
#
# 本仓专属：生成器 scripts/doc-embed.py 知道本仓的源码投影约定，判定留在脚本里。
# 退出码即判定：生成器崩溃也必须阻断，不能把「没匹配到错误文案」当作通过。
# 成功时的「跳过」提示保留到 stderr，让检查范围缩小可见（不判失败）。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

if ! embed_output=$(python3 scripts/doc-embed.py --check 2>&1); then
  h_fail EMBED "生成校验失败：$embed_output"
elif embed_skipped=$(printf '%s\n' "$embed_output" | grep '^doc-embed: 跳过'); then
  h_note "$embed_skipped"
fi

[ "$H_FAILS" -eq 0 ] && h_pass "受管代码块与源码一致"
[ "$H_FAILS" -eq 0 ]
