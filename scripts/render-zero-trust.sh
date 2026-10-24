#!/usr/bin/env bash
# 渲染裸 manifest 路径(make k8s-pre-all)与 helm 路径**共用**的那几份清单:
#   - helm/files/zero-trust.yaml  ServiceAccount ×11 + CiliumNetworkPolicy(含运行时注入的 Postgres CIDR)
# 它只有一份来源(helm/files/),两条部署路径都从这里拿,所以不需要 parity 门禁去比对。
# otel-auth 不在共享清单里:2026-10-07 起是仓外静态 Secret(scripts/deploy-k8s.sh 建),不经 helm。
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
namespace="${NAMESPACE:-ecommerce}"
postgres_egress_cidr="$("${script_dir}/resolve-postgres-egress-cidr.sh")"

command -v helm >/dev/null 2>&1 || {
  echo "缺少 helm,无法渲染共享清单" >&2
  exit 1
}

deploy_env="${DEPLOY_ENV:-pre}"
value_files=("${repo_root}/helm/values.yaml")
if [[ "${deploy_env}" != pre ]]; then
  value_files+=("${repo_root}/helm/values-${deploy_env}.yaml")
fi
values=()
for f in "${value_files[@]}"; do values+=(-f "$f"); done
show_only=(--show-only templates/zero-trust.yaml)
helm template ecommerce "${repo_root}/helm" "${values[@]}" \
  --namespace "${namespace}" \
  "${show_only[@]}" \
  --set-string "global.postgresEgressCIDR=${postgres_egress_cidr}"
