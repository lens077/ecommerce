#!/usr/bin/env bash
# Render the shared zero-trust manifest with runtime-only address values.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
namespace="${NAMESPACE:-ecommerce}"
postgres_egress_cidr="$("${script_dir}/resolve-postgres-egress-cidr.sh")"

command -v helm >/dev/null 2>&1 || {
  echo "缺少 helm，无法渲染 zero-trust 清单" >&2
  exit 1
}

helm template ecommerce "${repo_root}/helm" \
  --namespace "${namespace}" \
  --show-only templates/zero-trust.yaml \
  --set-string "global.postgresEgressCIDR=${postgres_egress_cidr}"
