#!/usr/bin/env bash
# verify-deploy-parity.sh — 两份部署真相源必须渲染出同一套集群对象。
#
# 背景(2026-09-06):helm/ 与 backend/services/*/deploy/ 曾是两套互不相干的描述——
# helm 建 `cart`(default ns、LoadBalancer、pre 模式、tag 1.6.3),裸 manifest 建
# `ecommerce-cart-deploy`(ecommerce ns、ClusterIP、dev、digest 钉死)。CI 发版只回写 helm,
# 集群只 apply 裸 manifest,于是「发版 tag 永远到不了集群」而没有任何门禁报警。
# 两份都要保留(面向 helm/ArgoCD 与 kubectl 两类使用者),那就必须让它们逐字段等价。
#
# 做法:两侧都渲染成 K8s 对象,去注释、按键排序、按 kind/namespace/name 建索引,逐对象 diff。
# **按环境逐个比**(2026-09-15 起只有 pre / prod;dev 集群已删除,dev 层与局域网直连一并移除):
#   helm 侧:helm template umbrella chart,-f values.yaml(=pre 基线)[-f values-prod.yaml]
#   裸侧:  pre  = kubectl kustomize backend/services/*/deploy/base
#                 + application-vpa.yml + frontend/apps/consumer/deploy/pre/*.yaml
#                 + frontend/apps/consumer-next/deploy/base
#           prod = kubectl kustomize backend/services/*/deploy/overlays/prod
#                 + application-vpa.yml + frontend/apps/{consumer,consumer-next}/deploy/overlays/prod
#           + helm/files/ 里两条路径共用的 zero-trust / otel-auth(经同一条 helm 命令渲染,
#             用来保证「共享清单确实在 helm 里被渲染出来」)
# 任一侧多一个对象、少一个对象、任何字段不同 → 红。
#
# Postgres CIDR 是运行时注入值(scripts/resolve-postgres-egress-cidr.sh),两侧统一喂一个
# 文档用途的占位地址(RFC 5737),不需要 ssh 到集群。
#
# 用法:scripts/verify-deploy-parity.sh              # 依次比 pre 与 prod;任一红即 rc=1
#       scripts/verify-deploy-parity.sh pre          # 只比一个环境
#       KEEP=1 scripts/verify-deploy-parity.sh       # 保留临时目录便于人工看
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
cd "${repo_root}"

for tool in helm kubectl yq python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "verify-deploy-parity: 缺少 $tool" >&2; exit 2; }
done

namespace="${NAMESPACE:-ecommerce}"
placeholder_cidr="203.0.113.1/32"
envs=("$@"); [[ ${#envs[@]} -eq 0 ]] && envs=(pre prod)
workdir="$(mktemp -d "${TMPDIR:-/tmp}/deploy-parity.XXXXXX")"
if [[ -z "${KEEP:-}" ]]; then trap 'rm -rf "${workdir}"' EXIT; else echo "临时目录:${workdir}"; fi

helm_render() { # helm_render <env> [extra helm args...]
  local env="$1"; shift
  local values=(-f "${repo_root}/helm/values.yaml")
  [[ "${env}" != "pre" ]] && values+=(-f "${repo_root}/helm/values-${env}.yaml")
  helm template ecommerce "${repo_root}/helm" --namespace "${namespace}" "${values[@]}" \
    --set-string "global.postgresEgressCIDR=${placeholder_cidr}" "$@"
}

helm_value() { # helm_value <env> <yq-path> → 合并 values.yaml + values-<env>.yaml 后的值
  local env="$1" path="$2" files=("${repo_root}/helm/values.yaml")
  [[ "${env}" != "pre" ]] && files+=("${repo_root}/helm/values-${env}.yaml")
  yq eval-all ". as \$item ireduce ({}; . * \$item) | ${path}" "${files[@]}"
}

# 环境无关的裸 manifest(VPA 与两个前端);后端服务走各自的 kustomize overlay
raw_common=(
  application-vpa.yml
  frontend/apps/consumer/deploy/base/configMap.yaml
  frontend/apps/consumer/deploy/base/service.yaml
  frontend/apps/consumer/deploy/base/httproute.yaml
  frontend/apps/consumer-next/deploy/base/consumer-next.yaml
)

render_env() { # render_env <env>  → ${workdir}/<env>/{helm,raw}.yaml
  local env="$1" out="${workdir}/$1"
  mkdir -p "${out}/helm" "${out}/raw"
  helm_render "${env}" >"${out}/helm.yaml"
  {
    for svc in backend/services/*/; do
      d="${svc}deploy/base"; [[ "${env}" == "prod" ]] && d="${svc}deploy/overlays/prod"
      [[ -f "$d/kustomization.yaml" ]] || { echo "verify-deploy-parity: 缺 kustomization:$d" >&2; exit 2; }
      printf -- '---\n# source: %s\n' "$d"
      kubectl kustomize "$d"
      printf '\n'
    done
    if [[ "${env}" == "prod" ]]; then
      printf -- '---\n'
      cat application-vpa.yml
      for app in consumer consumer-next; do
        printf -- '\n---\n'
        kubectl kustomize "frontend/apps/${app}/deploy/overlays/prod"
      done
    else
      printf -- '---\n'
      kubectl kustomize frontend/apps/consumer/deploy/pre
      printf '\n---\n'
      # Pre frontend Rollout disables its VPA until controller compatibility is verified.
      yq eval-all 'select(.metadata.name != "ecommerce-frontend-vpa")' application-vpa.yml
    fi
    for f in "${raw_common[@]}"; do
      [[ "${env}" == "prod" ]] && continue
      [[ "$f" == application-vpa.yml ]] && continue
      # 2026-09-24 consumer 拆成 base/pre/overlays: pre 的 kustomization 已引用 ../base, 上面整体渲染过,
      # 这里再 cat 一遍 base 会让同名对象出现两次、parity 永远红。base 仍留在 raw_common 里作为清单索引。
      [[ "$f" == frontend/apps/consumer/deploy/base/* ]] && continue
      [[ -f "$f" ]] || { echo "verify-deploy-parity: 裸 manifest 不存在:$f" >&2; exit 2; }
      printf -- '---\n# source: %s\n' "$f"
      cat "$f"
      printf '\n'
    done
    # 两条路径共用的清单:与 scripts/render-zero-trust.sh 同一条命令。
    # otel-auth ExternalSecret 由 global.otelAuthExternalSecret.enabled 门控(prod 关):模板渲染为空时
    # --show-only 会报 "could not find template",所以先按合并后的 values 判断再决定要不要 show-only。
    printf -- '---\n'
    helm_render "${env}" --show-only templates/zero-trust.yaml
    if [[ "$(helm_value "${env}" .global.otelAuthExternalSecret.enabled)" == "true" ]]; then
      printf -- '\n---\n'
      helm_render "${env}" --show-only templates/otel-auth-externalsecret.yaml
    fi
  } >"${out}/raw.yaml"
}

# ── 归一化:每个对象一个 JSON 文件,文件名 = kind__namespace__name ───────
# python 脚本先读进变量再 -c 执行:`python3 - <<EOF` 会让 heredoc 抢走 stdin,管道里的 JSON 就丢了。
read -r -d '' normalize_py <<'PY' || true
import json, sys, os, collections
outdir = sys.argv[1]
seen = collections.Counter()
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    obj = json.loads(line)
    kind = obj.get("kind"); meta = obj.get("metadata") or {}
    name = meta.get("name"); ns = meta.get("namespace", "<cluster>")
    if not kind or not name:
        sys.exit(f"对象缺 kind/metadata.name:{line[:120]}")
    key = f"{kind}__{ns}__{name}"
    seen[key] += 1
    if seen[key] > 1:
        sys.exit(f"同一侧出现了两次:{key}")
    with open(os.path.join(outdir, key + ".json"), "w") as fh:
        json.dump(obj, fh, indent=2, sort_keys=True, ensure_ascii=False)
        fh.write("\n")
PY
normalize() { # normalize <in.yaml> <outdir>
  yq -o=json -I=0 'select(. != null) | sort_keys(..)' "$1" | python3 -c "${normalize_py}" "$2"
}

# ── 逐环境比对 ──────────────────────────────────────────────────────
rc=0
for env in "${envs[@]}"; do
  render_env "${env}"
  out="${workdir}/${env}"
  normalize "${out}/helm.yaml" "${out}/helm"
  normalize "${out}/raw.yaml" "${out}/raw"
  helm_count=$(ls "${out}/helm" | wc -l | tr -d ' ')
  raw_count=$(ls "${out}/raw" | wc -l | tr -d ' ')
  if diff -r -u "${out}/raw" "${out}/helm" >"${out}/diff.txt"; then
    echo "✅ deploy-parity[${env}] 绿:helm 与裸 manifest 渲染出同一套 ${helm_count} 个对象"
    continue
  fi
  rc=1
  echo "❌ deploy-parity[${env}] 红:helm 侧 ${helm_count} 个对象,裸 manifest 侧 ${raw_count} 个对象,差异如下(- 裸 manifest / + helm):"
  sed -e 's/^Only in .*\/raw: /  只有裸 manifest 有: /' -e 's/^Only in .*\/helm: /  只有 helm 有: /' "${out}/diff.txt"
  echo
done
if [[ $rc -ne 0 ]]; then
  echo "修法:哪边是你有意改的,就把另一边改成一样;两份都是真相源,不能只改一份。"
fi
exit $rc
