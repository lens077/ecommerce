#!/usr/bin/env bash
# 渲染裸 manifest 路径(make k8s-dev-all)与 helm 路径**共用**的那几份清单:
#   - helm/files/zero-trust.yaml               ServiceAccount ×11 + CiliumNetworkPolicy(含运行时注入的 Postgres CIDR)
#   - helm/files/otel-auth-externalsecret.yaml ExternalSecret otel-auth(Vault → Secret)
# 它们只有一份来源(helm/files/),两条部署路径都从这里拿,所以不需要 parity 门禁去比对。
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
namespace="${NAMESPACE:-ecommerce}"
postgres_egress_cidr="$("${script_dir}/resolve-postgres-egress-cidr.sh")"

command -v helm >/dev/null 2>&1 || {
  echo "缺少 helm,无法渲染共享清单" >&2
  exit 1
}

helm template ecommerce "${repo_root}/helm" \
  --namespace "${namespace}" \
  --show-only templates/zero-trust.yaml \
  --show-only templates/otel-auth-externalsecret.yaml \
  --set-string "global.postgresEgressCIDR=${postgres_egress_cidr}"
