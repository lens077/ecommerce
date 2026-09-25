#!/usr/bin/env bash
# 2026-09-24: 服务 readiness 全绿但缺业务表；后续临时 Job 又超时。
# 两条部署入口复用 Helm hook，且必须观察 Complete，不能只凭 create 成功。
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
env="${DEPLOY_ENV:-pre}"
namespace="${NAMESPACE:-ecommerce}"
case "$env" in pre|prod) ;; *) echo 'DEPLOY_ENV must be pre or prod' >&2; exit 2 ;; esac
if [[ "$env" == prod && -z "${KUBE_CONTEXT:-}" ]]; then
  echo 'prod requires explicit KUBE_CONTEXT' >&2; exit 2
fi
values=(-f "$root/helm/values.yaml")
[[ "$env" != prod ]] || values+=(-f "$root/helm/values-prod.yaml")
kube=(kubectl)
[[ -z "${KUBE_CONTEXT:-}" ]] || kube+=(--context "$KUBE_CONTEXT")
kube+=(-n "$namespace" --request-timeout=30s)
work="$(mktemp -d "${TMPDIR:-/tmp}/ecommerce-db-migrate.XXXXXX")"
trap 'rm -rf "$work"' EXIT
render() {
  helm template ecommerce "$root/helm" --namespace "$namespace" "${values[@]}" \
    --set-string global.postgresEgressCIDR=203.0.113.1/32 --show-only "templates/$1"
}
render db-migrate.yaml | yq -o=json '.' >"$work/job.json"
render db-migrate-network.yaml | yq -o=json '.' >"$work/network.json"
# CLI runs retain separate audit Jobs rather than deleting the preceding run.
# Argo/Helm use the fixed hook name; never remove their active Job from this path.
python3 - "$work/job.json" "$work/network.json" <<'PY'
import json,sys
for name in sys.argv[1:]:
    with open(name) as f: obj=json.load(f)
    obj['metadata'].pop('annotations',None)
    if obj['kind']=='Job':
        obj['metadata']['generateName']=obj['metadata'].pop('name')+'-'
    with open(name,'w') as f: json.dump(obj,f)
PY
secret="$(yq -r '.spec.template.spec.containers[0].env[0].valueFrom.secretKeyRef.name' "$work/job.json")"
if ! "${kube[@]}" get secret "$secret" -o 'jsonpath={.data.DB_URI}' | python3 -c 'import base64,sys; sys.exit(0 if base64.b64decode(sys.stdin.read().strip()).strip() else 1)'; then
  echo "Missing migration DB_URI Secret: $namespace/$secret" >&2; exit 2
fi
ca="$(yq -r '.spec.template.spec.volumes[0].secret.secretName' "$work/job.json")"
if ! "${kube[@]}" get secret "$ca" -o 'jsonpath={.data.ca\.crt}' |
  python3 -c 'import base64,sys; sys.exit(0 if base64.b64decode(sys.stdin.read().strip()).strip() else 1)'; then
  echo "Missing migration ca.crt: $namespace/$ca" >&2; exit 2
fi
if ! "${kube[@]}" get secret tcr-pull-secret -o name >/dev/null; then
  echo "Missing migration image pull Secret: $namespace/tcr-pull-secret" >&2; exit 2
fi
apply=(apply)
create=(create)
if [[ -n "${DRY_RUN:-}" ]]; then
  apply+=(--dry-run=server)
  create+=(--dry-run=server)
fi
"${kube[@]}" "${apply[@]}" -f - <"$work/network.json"
job="$("${kube[@]}" "${create[@]}" -f - -o 'jsonpath={.metadata.name}' <"$work/job.json")"
if [[ -n "${DRY_RUN:-}" ]]; then
  echo 'Migration dry-run only; database execution was not verified'; exit 0
fi
echo "Migration audit Job: $namespace/$job"
end=$((SECONDS + 630))
while (( SECONDS < end )); do
  if ! state="$("${kube[@]}" get job "$job" -o json | python3 -c '
import json,sys
conditions={c["type"] for c in json.load(sys.stdin).get("status",{}).get("conditions",[]) if c.get("status")=="True"}
print("failed" if conditions & {"Failed","FailureTarget"} else "complete" if "Complete" in conditions else "pending")')"; then
    echo "Cannot observe migration Job $namespace/$job; workload release stopped, SQL may still be running" >&2
    exit 1
  fi
  case "$state" in
    complete) "${kube[@]}" logs "job/$job"; echo 'Migration gate passed'; exit 0 ;;
    failed) break ;;
  esac
  sleep 3
done
"${kube[@]}" logs "job/$job" --all-containers=true >&2 || true
echo "Migration failed or timed out: $namespace/$job; workloads NOT released. Job retained for audit." >&2
exit 1
