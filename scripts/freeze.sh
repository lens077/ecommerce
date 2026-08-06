#!/usr/bin/env bash
# freeze.sh — 冻结一份验收集(Frozen Node)。
#
# 把「验收标准」= 一组测试/规格文件的内容哈希锁进 .freeze/<feature>.sha256,
# 之后实现方(Codex/任何人)再改动这些文件,verify-freeze.sh 与 CI 会立刻报红。
# 这是 Graph Engineering 三道防线里的 Frozen Nodes:优化器无权修改考题。
#
# 用法:
#   scripts/freeze.sh <feature> <path> [<path> ...]
#     <feature>  冻结集名字,只允许 [A-Za-z0-9._-]
#     <path>     测试/规格文件;传目录则纳入该目录下所有 git 跟踪的文件
#
# 例:
#   scripts/freeze.sh order backend/services/order/internal/biz/order_test.go
#   scripts/freeze.sh order backend/services/order/internal/biz   # 整个目录
#
# 冻结后请「单独一个 commit」提交 .freeze/ 下的产物,并声明为冻结验收集:
#   git add .freeze/order.sha256 .freeze/order.meta
#   git commit -m "test(freeze): 冻结 order 验收集 — 实现方勿改"
#
# 任何对已冻结文件的改动,都必须重跑本脚本刷新 .freeze/,而 .freeze/ 的改动
# 由 CODEOWNERS + 人工审批把关(见 .freeze/README.md)。
set -euo pipefail

die() { printf 'freeze: %s\n' "$*" >&2; exit 2; }

_sha256() { # 打印 "<hash>  <path>";Linux 用 sha256sum,macOS 回退 shasum
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"
  else shasum -a 256 "$@"; fi
}

[ "$#" -ge 2 ] || die "用法: scripts/freeze.sh <feature> <path> [<path> ...]"

feature=$1; shift
case "$feature" in
  *[!A-Za-z0-9._-]*) die "feature 名只允许 [A-Za-z0-9._-]: '$feature'" ;;
esac

root=$(git rev-parse --show-toplevel) || die "不在 git 仓库内"
cd "$root"

# 收集文件:目录 → git 跟踪的文件;普通文件 → 直接纳入。
files=()
for arg in "$@"; do
  case "$arg" in *$'\n'*) die "路径含换行,不支持: $arg" ;; esac
  if [ -d "$arg" ]; then
    while IFS= read -r f; do [ -n "$f" ] && files+=("$f"); done < <(git ls-files -- "$arg")
  elif [ -f "$arg" ]; then
    files+=("$arg")
  else
    die "路径不存在: $arg"
  fi
done
[ "${#files[@]}" -gt 0 ] || die "没有可冻结的文件(目录里没有 git 跟踪的文件?)"

# 去重 + 稳定排序,保证哈希清单可复现(bash 3.2 无 mapfile,用 while-read)。
_sorted=()
while IFS= read -r f; do [ -n "$f" ] && _sorted+=("$f"); done \
  < <(printf '%s\n' "${files[@]}" | LC_ALL=C sort -u)
files=("${_sorted[@]}")

# 未被 git 跟踪的文件冻结起来很脆(CI checkout 后不存在),给出警告但不阻断。
for f in "${files[@]}"; do
  if ! git ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
    printf 'freeze: 警告 — 未被 git 跟踪,CI 里可能查不到: %s\n' "$f" >&2
  fi
done

mkdir -p .freeze
manifest=".freeze/${feature}.sha256"
meta=".freeze/${feature}.meta"

_sha256 "${files[@]}" > "$manifest"

commit=$(git rev-parse HEAD 2>/dev/null || echo "UNCOMMITTED")
frozen_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  echo "feature=${feature}"
  echo "frozen_at=${frozen_at}"
  echo "git_commit=${commit}"
  echo "file_count=${#files[@]}"
  echo "manifest=${manifest}"
} > "$meta"

printf 'freeze: 已冻结 %d 个文件 → %s\n' "${#files[@]}" "$manifest"
printf 'freeze: 下一步 — 单独提交并声明冻结:\n'
printf '  git add %s %s\n' "$manifest" "$meta"
printf '  git commit -m "test(freeze): 冻结 %s 验收集 — 实现方勿改"\n' "$feature"
