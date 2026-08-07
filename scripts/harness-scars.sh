#!/usr/bin/env bash
# harness-scars.sh — 软门禁「伤疤面板」:把所有被放行的存量问题集中显形。
#
# 为什么需要这个脚本:
# 本仓的软门禁都设计得很克制——存量漂移进基线、覆盖缺口进 matrix 例外,
# 都不阻断流程。但「不阻断」不等于「什么都不做」:如果放行之后没人再看见它们,
# 「允许存在」会在几周内变成「没人记得」,基线就退化成一张永久免罪符。
#
# 所以这里把三处放行集中打印成一块显眼的面板:
#   1. .lint-baseline/*.txt              被冻结的静态告警
#   2. .service-matrix.yaml 的 deployment_coverage.exceptions   部署覆盖缺口
#   3. backend/structcheck/homogeneity_baseline.txt             internal/pkg 同构漂移
#
# ⚠️ 本脚本**永远退出 0**:它是显形工具,不是门禁。真正的拦截在
#    scripts/lint-baseline.sh 与 backend/structcheck 里。
#
# 为什么不在 Go 测试里直接打印:实测 `go test` 非 -v 模式下会缓冲包输出,
# 连 fmt.Println 都看不见(t.Logf 更不用说),所以必须走独立的打印通道。
#
# 用法:
#   scripts/harness-scars.sh          # 打印面板
#   scripts/harness-scars.sh --quiet  # 只在有伤疤时打印(适合挂在 make deploy 前)
set -euo pipefail

root=$(git rev-parse --show-toplevel) || { echo "harness-scars: 不在 git 仓库内" >&2; exit 0; }
cd "$root"

quiet=0
[ "${1:-}" = "--quiet" ] && quiet=1

# 数非空且非注释的行,永远退出 0(grep -c 计数为 0 时返回 1,不能直接用)
count_entries() {
  if [ -f "$1" ]; then awk '!/^[[:space:]]*#/ && NF {n++} END{print n+0}' "$1"; else echo 0; fi
}

lint_total=0
lint_detail=""
if [ -d .lint-baseline ]; then
  for f in .lint-baseline/*.txt; do
    [ -e "$f" ] || continue
    n=$(count_entries "$f")
    lint_total=$((lint_total + n))
    if [ "$n" -gt 0 ]; then
      lint_detail="${lint_detail}    $(basename "$f" .txt): ${n} 条\n"
    fi
  done
fi

homo_total=$(count_entries backend/structcheck/homogeneity_baseline.txt)

# matrix 的 deployment_coverage.exceptions:`exceptions: {}` 表示为空;
# 否则统计其下缩进更深的「服务名: 原因」行
exc_total=0
exc_detail=""
if [ -f .service-matrix.yaml ]; then
  exc_raw=$(awk '
    /^[[:space:]]*exceptions:[[:space:]]*\{\}[[:space:]]*$/ { next }
    /^[[:space:]]*exceptions:[[:space:]]*$/ { inblock=1; next }
    inblock && /^[^[:space:]]/ { inblock=0 }
    inblock && /^[[:space:]]*#/ { next }
    inblock && /^[[:space:]]{6,}[a-zA-Z0-9_-]+:/ { print }
  ' .service-matrix.yaml || true)
  if [ -n "$exc_raw" ]; then
    exc_total=$(printf '%s\n' "$exc_raw" | awk 'NF{n++} END{print n+0}')
    exc_detail=$(printf '%s\n' "$exc_raw" | sed 's/^[[:space:]]*/    /')
  fi
fi

total=$((lint_total + homo_total + exc_total))

if [ "$total" -eq 0 ] && [ "$quiet" -eq 1 ]; then
  exit 0
fi

echo
echo "════════════════════ 软门禁伤疤面板 ════════════════════"
if [ "$total" -eq 0 ]; then
  echo " ✅ 没有任何被放行的存量问题 —— 三处基线/例外全空。"
  echo "════════════════════════════════════════════════════════"
  exit 0
fi

printf ' ⚠️  共 %s 处被放行的存量问题。它们不阻断流程,但那是欠的债。\n\n' "$total"

printf ' [1] 静态告警基线 (.lint-baseline/)            %s 条\n' "$lint_total"
[ -n "$lint_detail" ] && printf '%b' "$lint_detail"
[ "$lint_total" -gt 0 ] && echo "     → 收敛: 修掉后跑 scripts/lint-baseline.sh snapshot 刷新"

printf ' [2] 部署覆盖例外 (.service-matrix.yaml)       %s 条\n' "$exc_total"
[ -n "$exc_detail" ] && printf '%s\n' "$exc_detail"
[ "$exc_total" -gt 0 ] && echo "     → 收敛: 补齐缺口后删掉例外,structcheck 会验证例外未过期"

printf ' [3] internal/pkg 同构漂移基线                 %s 条\n' "$homo_total"
[ "$homo_total" -gt 0 ] && echo "     → 收敛: 挑对的版本同步到全部服务,清空后删除基线文件"

echo
echo " 明细: .lint-baseline/  |  backend/structcheck/homogeneity_baseline.txt"
echo "════════════════════════════════════════════════════════"
exit 0
