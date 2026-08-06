#!/usr/bin/env bash
# verify-freeze.sh — 校验已冻结的验收集是否被动过(Frozen Node 的守卫)。
#
# 逐份读取 .freeze/*.sha256,把清单里记录的哈希与当前工作区文件内容比对:
#   - 内容变了      → DRIFT(考题被改)  → 退出码 1
#   - 文件被删/移走 → MISSING           → 退出码 1
#   - 全部一致      → OK                → 退出码 0
#
# 两层防线的分工:
#   本脚本(CI 锚点)拦「测试被偷偷改了、但 .freeze 清单没同步刷新」的静默漂移;
#   而「连 .freeze 清单一起改」这种走了 freeze.sh 的正规变更,本脚本会通过 ——
#   它由 CODEOWNERS + 人工/CC 审批 + /adversarial-review「diff 动测试即标红」把关。
#
# 用法:
#   scripts/verify-freeze.sh            # 校验全部(等同 --all)
#   scripts/verify-freeze.sh --all
#   scripts/verify-freeze.sh <feature>  # 只校验某一个
set -euo pipefail

_sha256_of() { # 打印单个文件的 64 位十六进制哈希
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -c1-64
  else shasum -a 256 "$1" | cut -c1-64; fi
}

root=$(git rev-parse --show-toplevel) || { echo "verify-freeze: 不在 git 仓库内" >&2; exit 2; }
cd "$root"

target=${1:---all}

manifests=()
if [ "$target" = "--all" ]; then
  # 没有任何冻结集时不算失败:体系还没冻结东西,门自然是开的。
  if ! compgen -G ".freeze/*.sha256" >/dev/null; then
    echo "verify-freeze: .freeze/ 下暂无冻结集,跳过(OK)"
    exit 0
  fi
  for m in .freeze/*.sha256; do manifests+=("$m"); done
else
  case "$target" in *[!A-Za-z0-9._-]*) echo "verify-freeze: 非法 feature 名: $target" >&2; exit 2 ;; esac
  m=".freeze/${target}.sha256"
  [ -f "$m" ] || { echo "verify-freeze: 找不到冻结集: $m" >&2; exit 2; }
  manifests+=("$m")
fi

rc=0
for manifest in "${manifests[@]}"; do
  feature=$(basename "$manifest" .sha256)
  drift=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    expected="${line:0:64}"
    path="${line:66}"          # 64 位哈希 + 两个空格 = 从第 66 位起是路径
    if [ ! -f "$path" ]; then
      printf '  [MISSING] %s\n' "$path"
      drift=1
      continue
    fi
    actual=$(_sha256_of "$path")
    if [ "$actual" != "$expected" ]; then
      printf '  [DRIFT]   %s\n' "$path"
      drift=1
    fi
  done < "$manifest"

  if [ "$drift" -eq 0 ]; then
    printf 'verify-freeze: [OK]   %s\n' "$feature"
  else
    printf 'verify-freeze: [FAIL] %s — 冻结验收集被改动而未重新 freeze。\n' "$feature"
    printf '              若为正规变更:走审批,重跑 scripts/freeze.sh %s <paths...> 并单独提交;\n' "$feature"
    printf '              否则:还原这些文件(git checkout -- <path>)。\n'
    rc=1
  fi
done

exit "$rc"
