#!/usr/bin/env bash
# verify-kyaml.sh — K8s 部署清单必须写成 KYAML。
#
# 背景(2026-09-18):裸 manifest 与 helm 两份部署真相源此前是块式 YAML,踩过两次隐式类型转换:
#   - `defaultMode: 0400` 在 YAML 1.1/1.2 下分别解析成 256 / 400,kustomize 与 yq 各读各的,
#     只能绕道写十进制 256(注释还留在 helm/templates/_ecommerce.tpl 里);
#   - VPA 的 `updateMode: Off` 不加引号会变成布尔 false —— 从「只出推荐值」变成「真去改 Pod」。
# KYAML(KEP-5295,k8s 1.34 alpha / 1.35 beta)是 YAML 的严格子集:结构由 {} [] 决定而不是缩进,
# 字符串值一律双引号。它**不是新格式**,任何 YAML 解析器照读,所以 kubectl/kustomize/helm 全不用改。
#
# 本门禁检查三件事:
#   1. 应转范围内的每个文件都是**规范 KYAML**(与 yamlfmt -o=kyaml 的输出逐字节相同);
#   2. 豁免清单里的文件**确实没被转换**(转了就炸,见下);
#   3. helm 渲染出的每个对象都是 KYAML(模板源码含 Go 模板语法,静态查不了,只能查渲染结果)。
#
# 为什么 helm/files/zero-trust.yaml 必须豁免(实测,不要「顺手修一下」):
#   它经 `tpl` 二次渲染。KYAML 强制双引号并转义内部引号,于是
#       - '{{ required "global.postgresEgressCIDR is required" .Values... }}'
#   变成 "{{ required \"...\" ... }}",Go 模板引擎解析到 \" 直接报
#       template: gotpl:250: unexpected "\" in operand
#   pre/prod 两条渲染路径全红。这不是能靠调参绕过的,是 KYAML 与 tpl 的本质冲突。
#
# ⚠️ yamlfmt 解析失败时**仍然返回 rc=0**,只往 stderr 写 `error decoding: ...`。
#    所以下面一律以「stderr 是否为空」判断成败,不看退出码。
#
# 用法:scripts/verify-kyaml.sh          # 全查,任一红即 rc=1
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
cd "${repo_root}"

for tool in yamlfmt helm; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "verify-kyaml: 缺少 $tool" >&2
    [[ "$tool" == "yamlfmt" ]] && echo "  安装:go install sigs.k8s.io/yaml/yamlfmt@latest" >&2
    exit 2
  }
done

placeholder_cidr="203.0.113.1/32"
rc=0

# ── 豁免清单:这些文件必须保持块式,转成 KYAML 会坏 ─────────────────────
exempt_files=(
  helm/files/zero-trust.yaml
)
is_exempt() {
  local f="$1" e
  for e in "${exempt_files[@]}"; do [[ "$f" == "$e" ]] && return 0; done
  return 1
}

# ── 1. 应转范围:必须是规范 KYAML ──────────────────────────────────────
covered_files() {
  find backend/services/*/deploy frontend/apps/*/deploy \
       \( -name '*.yaml' -o -name '*.yml' \) 2>/dev/null
  ls application-vpa.yml 2>/dev/null
  ls helm/Chart.yaml helm/values.yaml helm/values-prod.yaml 2>/dev/null
  ls helm/charts/*/Chart.yaml helm/charts/*/values.yaml 2>/dev/null
  find helm/files -name '*.yaml' 2>/dev/null
}

bad_static=()
checked=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  is_exempt "$f" && continue
  checked=$((checked + 1))
  err="$(mktemp)"; out="$(mktemp)"
  yamlfmt -o=kyaml "$f" >"$out" 2>"$err"
  if [[ -s "$err" ]]; then
    bad_static+=("$f  ← 解析失败:$(head -1 "$err")")
  elif ! diff -q "$f" "$out" >/dev/null 2>&1; then
    bad_static+=("$f  ← 不是规范 KYAML(跑 yamlfmt -o=kyaml -d 看差异)")
  fi
  rm -f "$err" "$out"
done < <(covered_files | sort -u)

if [[ ${#bad_static[@]} -eq 0 ]]; then
  echo "✅ kyaml[静态] 绿:${checked} 个部署清单都是规范 KYAML"
else
  rc=1
  echo "❌ kyaml[静态] 红:${#bad_static[@]} 个文件不是 KYAML(共查 ${checked} 个):"
  printf '   %s\n' "${bad_static[@]}"
  echo "   修法:yamlfmt -o=kyaml <文件> > <文件>.tmp && mv <文件>.tmp <文件>"
  echo "         转完必须跑 scripts/verify-deploy-parity.sh 确认语义没变。"
fi

# ── 2. 豁免清单:必须没被转换 ─────────────────────────────────────────
bad_exempt=()
for f in "${exempt_files[@]}"; do
  [[ -f "$f" ]] || { bad_exempt+=("$f  ← 豁免清单里的文件不存在,清单该更新了"); continue; }
  # 已转成 KYAML 的文件第一个非注释行会是 `{`。
  first="$(grep -vE '^\s*(#|$)' "$f" | head -1)"
  [[ "$first" == "{"* || "$first" == "---" ]] && \
    bad_exempt+=("$f  ← 被转成了 KYAML,但它经 tpl 渲染,转了会让 helm 渲染直接失败(见本文件头注释)")
done
if [[ ${#bad_exempt[@]} -eq 0 ]]; then
  echo "✅ kyaml[豁免] 绿:${#exempt_files[@]} 个必须保持块式的文件未被转换"
else
  rc=1
  echo "❌ kyaml[豁免] 红:"
  printf '   %s\n' "${bad_exempt[@]}"
fi

# ── 3. helm 渲染结果:除豁免来源外每个对象都必须是 KYAML ────────────────
# 模板源码含 Go 模板语法,YAML 解析器读不了,所以只能查渲染后的产物。
rendered="$(mktemp)"
if ! helm template ecommerce ./helm --namespace ecommerce -f helm/values.yaml \
      --set-string "global.postgresEgressCIDR=${placeholder_cidr}" >"$rendered" 2>/dev/null; then
  echo "❌ kyaml[渲染] 红:helm template 失败,先修渲染再谈格式"
  rc=1
else
  report="$(EXEMPT="${exempt_files[*]}" python3 - "$rendered" <<'PY'
import os, re, sys
exempt = {os.path.basename(p) for p in os.environ.get("EXEMPT", "").split()}
text = open(sys.argv[1]).read()
total = flow = 0
offenders = {}
for doc in re.split(r'(?m)^---$', text):
    lines = [l for l in doc.split('\n') if l.strip() and not l.strip().startswith('#')]
    if not lines:
        continue
    total += 1
    m = re.search(r'#\s*Source:\s*(\S+)', doc)
    src = m.group(1) if m else '<unknown>'
    if lines[0].lstrip().startswith('{'):
        flow += 1
    elif os.path.basename(src) not in exempt:
        offenders[src] = offenders.get(src, 0) + 1
print(f"{total}\t{flow}\t" + ";".join(f"{k}={v}" for k, v in sorted(offenders.items())))
PY
)"
  total="$(cut -f1 <<<"$report")"; flow="$(cut -f2 <<<"$report")"; offenders="$(cut -f3 <<<"$report")"
  if [[ -z "$offenders" ]]; then
    echo "✅ kyaml[渲染] 绿:helm 渲染出 ${total} 个对象,${flow} 个 KYAML,其余全部来自豁免清单"
  else
    rc=1
    echo "❌ kyaml[渲染] 红:以下模板渲染出了块式 YAML 而不在豁免清单里:"
    tr ';' '\n' <<<"$offenders" | sed 's/^/   /'
    echo "   修法:把模板体改写成 KYAML flow 风格({} 包对象、[] 包数组、值加双引号),"
    echo "         并把 toYaml|nindent 换成逐字段展开——那是从 YAML 之外操纵缩进,正是 KYAML 要消除的写法。"
  fi
fi
rm -f "$rendered"

exit $rc
