#!/usr/bin/env bash
# Resolve the runtime-only PostgreSQL egress CIDR without storing it in Git.
set -euo pipefail

runtime_cidr="${POSTGRES_EGRESS_CIDR:-}"
ssh_alias="${POSTGRES_SSH_ALIAS:-node1}"

if [[ -z "${runtime_cidr}" ]]; then
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  runtime_cidr="$("${script_dir}/resolve-ssh-alias-cidr.sh" "${ssh_alias}")"
fi

python3 - "${runtime_cidr}" <<'PY'
import ipaddress
import sys

try:
    network = ipaddress.ip_network(sys.argv[1], strict=True)
except ValueError as error:
    raise SystemExit(f"POSTGRES_EGRESS_CIDR 无效：{error}")
if network.version != 4 or network.prefixlen != 32:
    raise SystemExit("POSTGRES_EGRESS_CIDR 必须是单个 IPv4 地址的 /32 CIDR")
print(network)
PY
