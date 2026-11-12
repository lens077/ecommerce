#!/usr/bin/env bash
# id: index-line
# tag: INDEX-LINE
# desc: INDEX 表格单元超过字数上限
# config: HARNESS_INDEX_LINE_LIMITS
#
# INDEX 行的职责是「这份文档管什么、什么时候读」，不是「结论是什么」。阈值按 Unicode
# 字计数（macOS awk 按字节会把 CJK 算成 3 倍），所以用 python3 标准库。
# 格式：`<glob>:<字数>`，空格分隔，先匹配先生效。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

[ -n "$HARNESS_INDEX_LINE_LIMITS" ] || { h_pass "未配置 INDEX 字数上限，跳过"; exit 0; }

while IFS='|' read -r loc n lim; do
  [ -n "$loc" ] || continue
  h_fail INDEX-LINE "$loc 单元格 $n 字 > $lim——INDEX 只写「管什么、何时读」，结论搬进文件正文"
done < <(
  HARNESS_INDEX_LINE_LIMITS="$HARNESS_INDEX_LINE_LIMITS" python3 - <<'PYEOF'
import fnmatch, glob, os
rules = []
for item in os.environ.get("HARNESS_INDEX_LINE_LIMITS", "").split():
    pat, _, lim = item.rpartition(":")
    if pat:
        rules.append((pat, int(lim)))

seen = set()
for pat, lim in rules:
    for f in sorted(glob.glob(pat, recursive=True)):
        if not f.endswith(".md") or f in seen:
            continue
        seen.add(f)
        fence = 0
        # 用 chr(96) 拼围栏：heredoc 里直接写三个反引号会让 bash 3.2（macOS 自带）
        # 把它当成命令替换，报 unexpected EOF。
        tick = chr(96)
        for i, l in enumerate(open(f, encoding="utf-8"), 1):
            s = l.lstrip()
            if s.startswith(tick * 3) and s.count(tick) >= 3:
                run = len(s) - len(s.lstrip(tick))
                if fence == 0:
                    fence = run
                elif run >= fence:
                    fence = 0
                continue
            if fence:
                continue
            t = l.rstrip("\n")
            if not t.startswith("|") or "](" not in t:
                continue
            cells = [c.strip() for c in t.strip("|").split("|")]
            for c in cells[1:]:
                if len(c) > lim:
                    print(f"{f}:{i}|{len(c)}|{lim}")
PYEOF
)

[ "$H_FAILS" -eq 0 ] && h_pass "INDEX 单元格长度合规"
[ "$H_FAILS" -eq 0 ]
