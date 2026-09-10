#!/usr/bin/env bash
# spec-impact.sh — 规范与实现的双向影响查询(只读、只提示,不阻断)。
#
# 解决的问题:runbook §0.1 回答「动某类代码前读哪份文档」,这是正向;
# 本脚本回答反向的两问——
#   ① 改了 context/ 或 docs/design/ 里的约束,要回头核对哪些实现?跑哪条验证?
#   ② 改了代码,哪些文档声明依赖它,是否要同步回写?
# 数据来自各文档 frontmatter 的 `affects:` 块列表(约定见
# context/harness-framework/knowledge-layering.md;存在性由 verify-context.sh [AFFECTS] 守)。
#
# 用法:
#   scripts/spec-impact.sh                 # 工作树 + 暂存区 相对 HEAD 的改动
#   scripts/spec-impact.sh HEAD~3..HEAD    # 任意 git diff 范围
#   scripts/spec-impact.sh --cached        # 只看暂存区
# 退出码:0 = 跑完(有无命中都是 0);2 = 用法/环境错误。
# 建议时机:改完 context/ 或 docs/design/ 后、提交前跑一次;把命中的验证命令跑绿再提交。
set -euo pipefail

root=$(git rev-parse --show-toplevel) || { echo "spec-impact: 不在 git 仓库内" >&2; exit 2; }
cd "$root"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

# 改动文件清单
if [ $# -eq 0 ]; then
  changed=$(git diff HEAD --name-only; git ls-files --others --exclude-standard)
else
  changed=$(git diff --name-only "$@")
fi
changed=$(printf '%s\n' "$changed" | sed '/^$/d' | sort -u)
if [ -z "$changed" ]; then
  echo "spec-impact: 没有改动文件"
  exit 0
fi

# 建索引:doc<TAB>path(每行一对)
index=$(mktemp "${TMPDIR:-/tmp}/spec-impact.XXXXXX")
trap 'rm -f "$index"' EXIT
while IFS= read -r doc; do
  [ "$(head -1 "$doc")" = "---" ] || continue
  awk 'NR==1{next} /^---$/{exit} {print}' "$doc" | awk -v d="$doc" '
    /^affects:[[:space:]]*$/ { on=1; next }
    on && /^[[:space:]]+-[[:space:]]+/ { sub(/^[[:space:]]+-[[:space:]]+/, ""); gsub(/[[:space:]]+$/, ""); printf "%s\t%s\n", d, $0; next }
    on { on=0 }' >> "$index"
done < <(find context docs/design -name "*.md" ! -name "INDEX.md" -type f 2>/dev/null | sort)

if [ ! -s "$index" ]; then
  echo "spec-impact: 没有任何文档登记 affects:,无从查起(约定见 context/harness-framework/knowledge-layering.md)"
  exit 0
fi

# 给一个受影响路径配一条验证命令(只覆盖能确定的几类,其余留空让人判断)
suggest() { # suggest <path>
  case "$1" in
    backend/structcheck*)         echo "cd backend && go test -count=1 ./structcheck/..." ;;
    backend/api*)                 echo "cd backend && buf lint && go build ./... && go test -count=1 ./structcheck/..." ;;
    backend/*/*.go)               echo "cd backend && go test -short ./$(dirname "${1#backend/}")/..." ;;
    backend/*)                    d="${1#backend/}"; [ -d "$1" ] && echo "cd backend && go test -short ./$d/..." || echo "cd backend && go build ./..." ;;
    helm*|*/deploy/*)             echo "scripts/verify-deploy-parity.sh" ;;
    frontend/*)                   echo "cd frontend && pnpm ready" ;;
    scripts/verify-context*.sh)   echo "scripts/verify-context-canary.sh" ;;
    scripts/*.sh)                 echo "bash -n $1 && $1" ;;
    *)                            echo "" ;;
  esac
}

hits=0

# ① 文档 → 实现
docs_changed=$(printf '%s\n' "$changed" | grep -E '^(context|docs/design)/.*\.md$' || true)
if [ -n "$docs_changed" ]; then
  while IFS= read -r doc; do
    paths=$(awk -F'\t' -v d="$doc" '$1==d {print $2}' "$index")
    [ -n "$paths" ] || continue
    hits=$((hits + 1))
    echo "▶ 改了规范 $doc,登记的实现点:"
    while IFS= read -r p; do
      [ -e "$p" ] && mark="" || mark="  (⚠ 路径不存在,verify-context 会红)"
      cmd=$(suggest "$p")
      if [ -n "$cmd" ]; then printf '    %s%s\n        验证: %s\n' "$p" "$mark" "$cmd"
      else printf '    %s%s\n' "$p" "$mark"; fi
    done <<< "$paths"
  done <<< "$docs_changed"
fi

# ② 实现 → 文档(改动路径等于登记项,或落在登记目录之下)
code_changed=$(printf '%s\n' "$changed" | grep -vE '^(context|docs/design)/.*\.md$' || true)
if [ -n "$code_changed" ]; then
  while IFS= read -r c; do
    docs=$(awk -F'\t' -v c="$c" '
      { p=$2; if (c==p || index(c, p "/")==1) print $1 }' "$index" | sort -u)
    [ -n "$docs" ] || continue
    hits=$((hits + 1))
    echo "◀ 改了实现 $c,以下文档声明依赖它——核对约束是否要同步回写:"
    printf '    %s\n' $docs
  done <<< "$code_changed"
fi

if [ "$hits" -eq 0 ]; then
  echo "spec-impact: 本次改动($(printf '%s\n' "$changed" | wc -l | tr -d ' ') 个文件)没有命中任何 affects: 登记"
fi
exit 0
