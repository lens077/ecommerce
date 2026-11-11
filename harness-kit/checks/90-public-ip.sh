#!/usr/bin/env bash
# id: public-ip
# tag: PUBLIC-IP
# desc: 已提交文件里不得出现公网 IP（私网与豁免清单除外）
# fast: 1
# config: HARNESS_IP_ALLOWLIST

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || { h_pass "非 git 仓库，跳过"; exit 0; }

hits=$(cd "$REPO_ROOT" && git grep -InE '(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)' -- . 2>/dev/null || true)
[ -z "$hits" ] && { h_pass "未发现 IP 字面量"; exit 0; }

allow_file=""
[ -n "$HARNESS_IP_ALLOWLIST" ] && [ -f "$REPO_ROOT/$HARNESS_IP_ALLOWLIST" ] && allow_file="$REPO_ROOT/$HARNESS_IP_ALLOWLIST"

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  h_fail PUBLIC-IP "$hit"
done < <(printf '%s\n' "$hits" | python3 -c '
import ipaddress, re, sys
allow = []
path = sys.argv[1] if len(sys.argv) > 1 else ""
if path:
    try:
        allow = [l.strip() for l in open(path, encoding="utf-8") if l.strip() and not l.startswith("#")]
    except OSError:
        allow = []
pat = re.compile(r"(?<![0-9.])((?:[0-9]{1,3}\.){3}[0-9]{1,3})(?![0-9.])")
for line in sys.stdin:
    line = line.rstrip("\n")
    for m in pat.finditer(line):
        raw = m.group(1)
        try:
            ip = ipaddress.ip_address(raw)
        except ValueError:
            continue
        if not ip.is_global:
            continue
        if any(str(ip) == a or (a.endswith(".") and str(ip).startswith(a)) for a in allow):
            continue
        print(line)
        break
' "$allow_file")

[ "$H_FAILS" -eq 0 ] && h_pass "无公网 IP"
[ "$H_FAILS" -eq 0 ]
