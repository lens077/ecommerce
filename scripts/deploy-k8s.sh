#!/usr/bin/env bash
# 一条命令把后端交付到集群。形状参照 config-center 的 scripts/deploy-k8s.sh：
# 先把「集群里那些不在 Git 的前置状态」补齐，再交给权威路径去 apply。
#
# 两种模式（DEPLOY_MODE）：
#   helm   默认。渲染 helm/ 并 apply —— 与 ArgoCD 同一份真相源，
#          用于 ArgoCD 不可用、或想在本机先看 diff 时。
#   argocd 只补前置状态，apply argocd-{proj,repo,app}.yml，剩下交给 ArgoCD 拉。
# DEPLOY_ACTION=delete 时，按 helm/ 渲染结果删除全部微服务资源；namespace、
# tcr-pull-secret 与 pg-ca-cert 仍保留。
#
# 前置状态指这些（此前全靠手敲 kubectl，不在 Git 里，换个集群就丢）：
#   - ecommerce 命名空间
#   - tcr-pull-secret：TCR 是私有仓库，没有它所有 Pod 都 ImagePullBackOff
#   - pg-ca-cert：Postgres 走 verify-ca，缺了连不上库
#   - ecommerce-config-source-pre：含机器 token 的 10 份 Config Center selector，
#     必须由操作者在集群创建，不落盘、不进 Git
#
# 用法：
#   scripts/deploy-k8s.sh                      # helm 模式，渲染并 apply
#   DRY_RUN=1 scripts/deploy-k8s.sh            # 只看会动什么（server-side dry-run）
#   DEPLOY_MODE=argocd scripts/deploy-k8s.sh   # 交给 ArgoCD
#   DEPLOY_ACTION=delete scripts/deploy-k8s.sh # 卸载全部微服务
#   SERVICES="cart order" scripts/deploy-k8s.sh  # 只部分服务（helm 模式）
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"

deploy_mode="${DEPLOY_MODE:-helm}"
deploy_action="${DEPLOY_ACTION:-apply}"
namespace="${NAMESPACE:-ecommerce}"
kube_context="${KUBE_CONTEXT:-}"
registry="${TCR_REGISTRY:-ccr.ccs.tencentyun.com}"
pg_ca_file="${PG_CA_FILE:-${repo_root}/backend/services/cart/pg_ca_pem.crt}"
dry_run="${DRY_RUN:-}"
services="${SERVICES:-}"

case "${deploy_mode}" in
  helm | argocd) ;;
  *)
    echo "DEPLOY_MODE 必须是 helm 或 argocd，收到：${deploy_mode}" >&2
    exit 1
    ;;
esac

case "${deploy_action}" in
  apply | delete) ;;
  *)
    echo "DEPLOY_ACTION 必须是 apply 或 delete，收到：${deploy_action}" >&2
    exit 1
    ;;
esac

if [[ "${deploy_action}" == "delete" && "${deploy_mode}" != "helm" ]]; then
  echo "DEPLOY_ACTION=delete 仅支持 helm 模式" >&2
  exit 1
fi

kubectl_cmd=(kubectl)
if [[ -n "${kube_context}" ]]; then
  kubectl_cmd+=(--context "${kube_context}")
fi

kubectl_apply_cmd=(apply)
kubectl_delete_cmd=(delete)
if [[ -n "${dry_run}" ]]; then
  kubectl_apply_cmd+=(--dry-run=server)
  kubectl_delete_cmd+=(--dry-run=server)
  echo "== DRY RUN：只打印将要发生的变更，不落盘"
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "缺少命令：$1" >&2
    exit 1
  }
}
need kubectl
[[ "${deploy_mode}" == "helm" ]] && need helm

if [[ "${deploy_action}" == "delete" ]]; then
  echo "== helm 渲染并删除全部微服务（保留 namespace 与前置 Secret）"
  helm template ecommerce "${repo_root}/helm" --namespace "${namespace}" |
    "${kubectl_cmd[@]}" "${kubectl_delete_cmd[@]}" --ignore-not-found=true \
      --namespace "${namespace}" -f -
  if [[ -z "${dry_run}" ]]; then
    echo "✅ 全部微服务已卸载"
    echo "   注意：若 ArgoCD 自动同步仍开启，它会重新创建这些资源"
  fi
  exit 0
fi

# 命名空间
echo "== 命名空间 ${namespace}"
"${kubectl_cmd[@]}" create namespace "${namespace}" --dry-run=client -o yaml |
  "${kubectl_cmd[@]}" "${kubectl_apply_cmd[@]}" -f -

# TCR 拉取凭据
# 凭据从本机 docker 凭据助手取，不落盘、不进 Git。已存在则跳过，
# 避免每次部署都改写 Secret（改写会让所有 Pod 下次调度时重新拉镜像）。
if "${kubectl_cmd[@]}" get secret tcr-pull-secret -n "${namespace}" >/dev/null 2>&1; then
  echo "== tcr-pull-secret 已存在，跳过（要轮换请先 kubectl delete secret tcr-pull-secret）"
else
  echo "== 创建 tcr-pull-secret（凭据取自本机 docker login ${registry}）"
  cred="$(printf '%s' "${registry}" | docker-credential-desktop get 2>/dev/null || true)"
  if [[ -z "${cred}" ]]; then
    echo "取不到 ${registry} 的 docker 凭据，请先 docker login ${registry}" >&2
    exit 1
  fi
  "${kubectl_cmd[@]}" create secret docker-registry tcr-pull-secret \
    --namespace="${namespace}" \
    --docker-server="${registry}" \
    --docker-username="$(jq -r '.Username' <<<"${cred}")" \
    --docker-password="$(jq -r '.Secret' <<<"${cred}")" \
    --dry-run=client -o yaml |
    "${kubectl_cmd[@]}" "${kubectl_apply_cmd[@]}" -f -
fi

# Postgres CA
# 各服务的 configs/pg_ca_pem.crt 是同一份 CA，取任意一份即可
if [[ -f "${pg_ca_file}" ]]; then
  echo "== pg-ca-cert"
  "${kubectl_cmd[@]}" create secret generic pg-ca-cert \
    --namespace="${namespace}" \
    --from-file="pg_ca.crt=${pg_ca_file}" \
    --dry-run=client -o yaml | "${kubectl_cmd[@]}" "${kubectl_apply_cmd[@]}" -f -
else
  echo "!! 找不到 ${pg_ca_file}，跳过 pg-ca-cert；服务连库会因 verify-ca 失败" >&2
fi

# Config Center selector 含机器 token，不能由仓库内容生成。部署入口只校验它存在，
# 避免先滚掉健康 Pod，才发现新 Pod 因缺 selector 无法启动。
if ! "${kubectl_cmd[@]}" get secret ecommerce-config-source-pre -n "${namespace}" >/dev/null 2>&1; then
  echo "缺少 ${namespace}/ecommerce-config-source-pre；请先创建不入库的 Config Center selector Secret" >&2
  exit 1
fi

# 交付
if [[ "${deploy_mode}" == "argocd" ]]; then
  echo "== apply ArgoCD 清单（AppProject / repo / ApplicationSet）"
  for f in argocd-proj.yml argocd-repo.yml argocd-app.yml; do
    "${kubectl_cmd[@]}" "${kubectl_apply_cmd[@]}" -f "${repo_root}/${f}"
  done
  echo "✅ 已交给 ArgoCD。看状态：kubectl get application -n argocd"
  exit 0
fi

echo "== helm 渲染并 apply（与 ArgoCD 同一份 helm/values.yaml）"
helm_args=(template ecommerce "${repo_root}/helm" --namespace "${namespace}")
if [[ -n "${services}" ]]; then
  # 只开指定的几个：先把全部关掉，再逐个打开
  for s in $(yq -r 'keys | .[] | select(. != "global")' "${repo_root}/helm/values.yaml"); do
    helm_args+=(--set "${s}.enabled=false")
  done
  for s in ${services}; do helm_args+=(--set "${s}.enabled=true"); done
  echo "   只部署：${services}"
fi
helm "${helm_args[@]}" |
  "${kubectl_cmd[@]}" "${kubectl_apply_cmd[@]}" -n "${namespace}" -f -

if [[ -z "${dry_run}" ]]; then
  echo "✅ 已 apply。看状态：kubectl get pods -n ${namespace}"
  echo "   注意：本路径与 ArgoCD 互斥 —— ArgoCD 若在自动同步，它会把手改的部分同步回去"
fi
