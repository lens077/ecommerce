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
# **按环境逐个比**(2026-09-06 起 dev / pre):
#   helm 侧:helm template umbrella chart,-f values.yaml [-f values-<env>.yaml]
#   裸侧:  kubectl kustomize backend/services/*/deploy/overlays/<env>(base + 该环境的补丁/附加资源)
#           + application-vpa.yml
#           + frontend/apps/consumer/deploy/pre/*.yaml + frontend/apps/consumer-next/deploy/dev.yaml(环境无关)
#           + helm/files/ 里两条路径共用的 zero-trust / otel-auth(经同一条 helm 命令渲染,
#             用来保证「共享清单确实在 helm 里被渲染出来」)
# 任一侧多一个对象、少一个对象、任何字段不同 → 红。dev 独有的本地直连(HTTPRoute + cnp-direct)
# 只会出现在 dev 那次比对里;它若混进 pre,pre 那次会以「只有裸侧有 / 只有 helm 有」报出来。
#
# Postgres CIDR 是运行时注入值(scripts/resolve-postgres-egress-cidr.sh),两侧统一喂一个
# 文档用途的占位地址(RFC 5737),不需要 ssh 到集群。
#
# 用法:scripts/verify-deploy-parity.sh              # 依次比 dev 与 pre;任一红即 rc=1
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
envs=("$@"); [[ ${#envs[@]} -eq 0 ]] && envs=(dev pre)
workdir="$(mktemp -d "${TMPDIR:-/tmp}/deploy-parity.XXXXXX")"
if [[ -z "${KEEP:-}" ]]; then trap 'rm -rf "${workdir}"' EXIT; else echo "临时目录:${workdir}"; fi

helm_render() { # helm_render <env> [extra helm args...]
  local env="$1"; shift
  local values=(-f "${repo_root}/helm/values.yaml")
  [[ "${env}" != "dev" ]] && values+=(-f "${repo_root}/helm/values-${env}.yaml")
  helm template ecommerce "${repo_root}/helm" --namespace "${namespace}" "${values[@]}" \
    --set-string "global.postgresEgressCIDR=${placeholder_cidr}" "$@"
}

# 环境无关的裸 manifest(VPA 与两个前端);后端服务走各自的 kustomize overlay
raw_common=(
  application-vpa.yml
  frontend/apps/consumer/deploy/pre/*.yaml
  frontend/apps/consumer-next/deploy/dev.yaml
)

render_env() { # render_env <env>  → ${workdir}/<env>/{helm,raw}.yaml
  local env="$1" out="${workdir}/$1"
  mkdir -p "${out}/helm" "${out}/raw"
  helm_render "${env}" >"${out}/helm.yaml"
  {
    for d in backend/services/*/deploy/overlays/"${env}"; do
      [[ -f "$d/kustomization.yaml" ]] || { echo "verify-deploy-parity: 缺 overlay:$d" >&2; exit 2; }
      printf -- '---\n# source: %s\n' "$d"
      kubectl kustomize "$d"
      printf '\n'
    done
    for f in "${raw_common[@]}"; do
      [[ -f "$f" ]] || { echo "verify-deploy-parity: 裸 manifest 不存在:$f" >&2; exit 2; }
      printf -- '---\n# source: %s\n' "$f"
      cat "$f"
      printf '\n'
    done
    # 两条路径共用的清单:与 scripts/render-zero-trust.sh 同一条命令
    printf -- '---\n'
    helm_render "${env}" --show-only templates/zero-trust.yaml --show-only templates/otel-auth-externalsecret.yaml
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
  echo "     dev 独有的本地直连(httproute + cnp-direct)只能在 overlays/dev 与 values.yaml(directAccess.enabled=true);pre 两边都不能有。"
fi
exit $rc
