#!/usr/bin/env bash
# Resolve an SSH inventory alias to a single-host IPv4 CIDR.
set -euo pipefail

ssh_alias="${1:-}"
if [[ -z "${ssh_alias}" ]]; then
  echo "用法：$0 <ssh-alias>" >&2
  exit 2
fi

command -v ssh >/dev/null 2>&1 || {
  echo "缺少 ssh，无法解析 ${ssh_alias}" >&2
  exit 1
}
ssh_host="$(ssh -G "${ssh_alias}" 2>/dev/null | awk '$1 == "hostname" { print $2; exit }')"
if [[ -z "${ssh_host}" ]]; then
  echo "~/.ssh/config 中找不到 ${ssh_alias} 的 HostName" >&2
  exit 1
fi

python3 - "${ssh_host}" <<'PY'
import ipaddress
import sys

try:
    address = ipaddress.ip_address(sys.argv[1])
except ValueError as error:
    raise SystemExit(f"SSH HostName 不是 IP 地址：{error}")
if address.version != 4:
    raise SystemExit("当前运行配置只接受 IPv4 SSH HostName")
print(f"{address}/32")
PY
