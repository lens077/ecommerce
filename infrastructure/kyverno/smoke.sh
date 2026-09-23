#!/usr/bin/env bash
# ecommerce-image-provenance 正反向冒烟（Audit 阶段）。
#
# 断言：(1) 已签名 digest 与未签名镜像的 Pod 都被放行（Audit 语义）
#       (2) PolicyReport 里已签名 → pass、未签名 → fail
# 前置：Policy 已在 ecommerce 命名空间 Ready；TCR 上存在一个未签名的 user 镜像 tag（默认
#       kyverno-unsigned-probe，见 README「未签名反例怎么来」）。
# 用法：SIGNED_REF=<repo@sha256:...> UNSIGNED_REF=<repo:tag> bash infrastructure/kyverno/smoke.sh
set -Eeuo pipefail
ns=ecommerce
policy=ecommerce-image-provenance
SIGNED_REF=${SIGNED_REF:-$(grep -o 'ccr.ccs.tencentyun.com/sumery/user:[^"]*' \
  "$(dirname "$0")/../../backend/services/user/deploy/base/deployment.yaml" | head -1)}
UNSIGNED_REF=${UNSIGNED_REF:-ccr.ccs.tencentyun.com/sumery/user:kyverno-unsigned-probe}
[[ -n $SIGNED_REF ]] || { echo "FAIL: 找不到已签名 user digest（SIGNED_REF）" >&2; exit 1; }

cleanup() { kubectl -n "$ns" delete pod provenance-signed provenance-unsigned --ignore-not-found --wait=false >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

[[ $(kubectl -n "$ns" get policy "$policy" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}') == True ]] \
  || { echo "FAIL: policy $ns/$policy 未 Ready" >&2; exit 1; }

kubectl -n "$ns" run provenance-signed --image="$SIGNED_REF" --restart=Never --command -- sleep 300 >/dev/null 2>&1 \
  || { echo "FAIL: 已签名镜像的 Pod 被拒" >&2; exit 1; }
kubectl -n "$ns" run provenance-unsigned --image="$UNSIGNED_REF" --restart=Never --command -- sleep 300 >/dev/null 2>&1 \
  || { echo "FAIL: 未签名镜像的 Pod 被拒 —— Audit 阶段不应阻断，检查 failureAction" >&2; exit 1; }

# reports-controller 异步；命名空间级 Policy 在报告里带 ns 前缀
results=""
for _ in $(seq 1 40); do
  results=$(kubectl -n "$ns" get policyreport -o json 2>/dev/null \
    | jq -r --arg p "$ns/$policy" '.items[] | .scope.name as $pod | .results[] | select(.policy==$p) | "\($pod)=\(.result)"' | sort -u | tr '\n' ' ')
  [[ $results == *provenance-signed=* && $results == *provenance-unsigned=* ]] && break
  sleep 3
done
[[ $results == *"provenance-signed=pass"* ]]   || { echo "FAIL: 已签名镜像未判 pass: [$results]" >&2; exit 1; }
[[ $results == *"provenance-unsigned=fail"* ]] || { echo "FAIL: 未签名镜像未判 fail: [$results]" >&2; exit 1; }
printf 'PASS: Audit 放行两者；PolicyReport %s\n' "$results"
