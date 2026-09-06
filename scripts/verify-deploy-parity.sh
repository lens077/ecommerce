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
#   helm 侧:helm template 整个 umbrella chart
#   裸侧:  backend/services/*/deploy/dev/*.yaml + application-vpa.yml
#           + frontend/apps/consumer/deploy/pre/*.yaml + frontend/apps/consumer-next/deploy/dev.yaml
#           + helm/files/ 里两条路径共用的 zero-trust / otel-auth(经同一条 helm 命令渲染,
#             用来保证「共享清单确实在 helm 里被渲染出来」)
# 任一侧多一个对象、少一个对象、任何字段不同 → 红。
#
# Postgres CIDR 是运行时注入值(scripts/resolve-postgres-egress-cidr.sh),两侧统一喂一个
# 文档用途的占位地址(RFC 5737),不需要 ssh 到集群。
#
# 用法:scripts/verify-deploy-parity.sh          # rc=0 等价;rc=1 有差异并打印 diff
#       KEEP=1 scripts/verify-deploy-parity.sh   # 保留临时目录便于人工看
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
cd "${repo_root}"

for tool in helm yq python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "verify-deploy-parity: 缺少 $tool" >&2; exit 2; }
done

namespace="${NAMESPACE:-ecommerce}"
placeholder_cidr="203.0.113.1/32"
workdir="$(mktemp -d "${TMPDIR:-/tmp}/deploy-parity.XXXXXX")"
if [[ -z "${KEEP:-}" ]]; then trap 'rm -rf "${workdir}"' EXIT; else echo "临时目录:${workdir}"; fi
mkdir -p "${workdir}/helm" "${workdir}/raw"

helm_render() { # helm_render [extra helm args...]
  helm template ecommerce "${repo_root}/helm" --namespace "${namespace}" \
    --set-string "global.postgresEgressCIDR=${placeholder_cidr}" "$@"
}

# ── helm 侧 ─────────────────────────────────────────────────────────
helm_render >"${workdir}/helm.yaml"

# ── 裸 manifest 侧 ──────────────────────────────────────────────────
raw_sources=(
  backend/services/*/deploy/dev/*.yaml
  application-vpa.yml
  frontend/apps/consumer/deploy/pre/*.yaml
  frontend/apps/consumer-next/deploy/dev.yaml
)
{
  for f in "${raw_sources[@]}"; do
    [[ -f "$f" ]] || { echo "verify-deploy-parity: 裸 manifest 不存在:$f" >&2; exit 2; }
    printf -- '---\n# source: %s\n' "$f"
    cat "$f"
    printf '\n'
  done
  # 两条路径共用的清单:与 scripts/render-zero-trust.sh 同一条命令
  printf -- '---\n'
  helm_render --show-only templates/zero-trust.yaml --show-only templates/otel-auth-externalsecret.yaml
} >"${workdir}/raw.yaml"

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
normalize "${workdir}/helm.yaml" "${workdir}/helm"
normalize "${workdir}/raw.yaml" "${workdir}/raw"

# ── 比对 ────────────────────────────────────────────────────────────
helm_count=$(ls "${workdir}/helm" | wc -l | tr -d ' ')
raw_count=$(ls "${workdir}/raw" | wc -l | tr -d ' ')
if diff -r -u "${workdir}/raw" "${workdir}/helm" >"${workdir}/diff.txt"; then
  echo "✅ deploy-parity 绿:helm 与裸 manifest 渲染出同一套 ${helm_count} 个对象"
  exit 0
fi
echo "❌ deploy-parity 红:helm 侧 ${helm_count} 个对象,裸 manifest 侧 ${raw_count} 个对象,差异如下(- 裸 manifest / + helm):"
sed -e 's/^Only in .*\/raw: /  只有裸 manifest 有: /' -e 's/^Only in .*\/helm: /  只有 helm 有: /' "${workdir}/diff.txt"
echo
echo "修法:哪边是你有意改的,就把另一边改成一样;两份都是真相源,不能只改一份。"
exit 1
