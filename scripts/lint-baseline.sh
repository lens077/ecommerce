#!/usr/bin/env bash
# lint-baseline.sh — 静态检查的「基线对比」棘轮:冻结存量,只拦新增。
#
# 解决的死结:存量告警多 → 不敢把 lint 设成门禁 → 告警继续涨。
# 做法与 backend/structcheck 的 homogeneity_baseline.txt 同源(棘轮):
#     基线里的失败集合 = A
#     当前的失败集合   = B
#     只有 B - A(新增)才阻断流程
# 它真正的价值不在技术,而在**剥夺「这是历史问题」这句万能解释**——
# 是不是历史问题由基线文件说了算,不由跑的人(或 AI)说了算。
#
# 反向棘轮:基线里的条目一旦被修好,check 会要求刷新基线并失败,
# 防止基线只增不减、慢慢变成一张永久免罪符。
#
# 用法:
#   scripts/lint-baseline.sh check       # 默认。有新增告警则退出码 1
#   scripts/lint-baseline.sh snapshot    # 冻结当前状态为新基线(提交前请 git diff 逐条确认)
#   scripts/lint-baseline.sh list        # 只看基线条目数,不跑检查
#   CHECKERS="go-vet" scripts/lint-baseline.sh check    # 只跑指定 checker
#
# 归一化:finding 只保留「checker + 文件 + 规则 + 摘要」,**丢掉行号列号**。
# 否则在文件顶部加一行注释就会让下方所有告警变成「新增」,基线立刻失效。
#
# ⚠️ 四个陷阱(都实测踩过,改本文件前先读):
#   1. 干净时 lint 无输出,管道里的 grep 拿到空输入会返回 1,在 `set -o pipefail`
#      下会直接掐掉整个脚本 —— 所以每条采集管道末尾都有 `|| true`。
#   2. `grep -c` 计数为 0 时同样返回 1,不能直接用在 `$(...)` 里。
#   3. 采集用 `2>&1` 合流,而 CI 冷模块缓存时 go 会把 `go: downloading …` 打到
#      stderr —— 不滤掉就全变成「新增告警」。本机缓存热永远复现不了,只在 CI 红
#      (2026-08-13/08-18 两轮 10 服务全红均为此因,不是真告警)。
#   4. 采集正则与上游输出格式**耦合**,格式一变就恒绿(解析 0 条 ≠ 0 条告警)。
#      vp lint 从单行格式改 miette 画框后 vp-lint 采集器静默失效,2026-08-26
#      注错红测才暴露 —— 修复后 run_vp-lint 加了「汇总行报 N 条 vs 解析 0 条」
#      失聪自检,脱钩时产出 PARSE-FAILURE 哨兵行强制 check 变红。改采集器后
#      必须注错复测(注入 debugger → check 必须 rc=1,还原 → rc=0)。
set -euo pipefail

root=$(git rev-parse --show-toplevel) || { echo "lint-baseline: 不在 git 仓库内" >&2; exit 2; }
cd "$root"

BASELINE_DIR=".lint-baseline"
# macOS bash 3.2:用空格分隔字符串而不是数组,避免 set -u 下空数组展开直接退出
CHECKERS=${CHECKERS:-"go-vet vp-lint"}
mode=${1:-check}

# 数非空行数,永远退出 0(见文件头陷阱 2)
count_lines() {
  if [ -f "$1" ]; then awk 'NF{n++} END{print n+0}' "$1"; else echo 0; fi
}

# ── 各 checker 的采集与归一化 ──────────────────────────────────────
# 约定:每个 run_<name> 把「一行一条 finding」打到 stdout,自身永远退出 0。

run_go-vet() {
  { ( cd backend && go vet ./... 2>&1 || true ) \
    | grep -v '^#' \
    | grep -vE '^go: (downloading|extracting|finding) ' \
    | sed -E 's/^([^:]+):[0-9]+:[0-9]+:[[:space:]]*/\1	/' \
    | grep -v '^[[:space:]]*$' \
    | sed 's|^|go-vet	|' ; } || true
}

run_vp-lint() {
  if [ ! -x frontend/node_modules/.bin/vp ]; then
    echo "lint-baseline: 前端依赖未安装,跳过 vp-lint(先 cd frontend && pnpm install)" >&2
    return 0
  fi
  # vp lint(oxlint)现输出 miette 画框格式(2026-08-26 从旧单行格式适配,见陷阱 4):
  #     ! eslint(no-debugger): `debugger` statement is not allowed
  #       ,-[apps/consumer/src/main.tsx:35:1]
  # 消息行(!/x 前缀)与其后最近的 ,-[path:line:col] 定位行配对成一条 finding;
  # 行号列号照旧丢弃(见「归一化」)。路径补 frontend/ 前缀,与仓库根相对路径一致。
  out=$( ( cd frontend && ./node_modules/.bin/vp lint 2>&1 ) || true )
  rows=$(printf '%s\n' "$out" | awk '
    /^[[:space:]]*[!x][[:space:]]/ { msg=$0; sub(/^[[:space:]]*/,"",msg); next }
    match($0, /,-\[[^]]+:[0-9]+:[0-9]+\]/) && msg != "" {
      loc=substr($0, RSTART+3, RLENGTH-4)
      sub(/:[0-9]+:[0-9]+$/, "", loc)
      printf "vp-lint\tfrontend/%s\t%s\n", loc, msg
      msg=""
    }')
  # 失聪自检:vp 的汇总行报了 N 条而上面解析出 0 条 → 采集器与上游格式脱钩。
  # 2026-08-26 实测就是这么静默失效的(格式从单行改画框后恒绿了一段时间),
  # 用哨兵行强制 check 变红,决不静默换绿(见陷阱 4)。
  reported=$(printf '%s\n' "$out" \
    | sed -n -E 's/^Found ([0-9]+) warnings? and ([0-9]+) errors?.*$/\1 \2/p' | head -1)
  if [ -n "$reported" ]; then
    total=$(( $(echo "$reported" | cut -d' ' -f1) + $(echo "$reported" | cut -d' ' -f2) ))
    parsed=$(printf '%s' "$rows" | awk 'NF{n++} END{print n+0}')
    if [ "$total" -gt 0 ] && [ "$parsed" -eq 0 ]; then
      echo "lint-baseline: vp lint 报告 $total 条但采集为 0——采集器与输出格式脱钩,先修 run_vp-lint" >&2
      printf 'vp-lint\t__collector__\tPARSE-FAILURE: 上游报 %s 条而解析为 0,采集器失聪\n' "$total"
    fi
  fi
  [ -n "$rows" ] && printf '%s\n' "$rows"
  return 0
}

collect() { "run_$1" | LC_ALL=C sort -u; }
baseline_file() { echo "$BASELINE_DIR/$1.txt"; }

# ── list ───────────────────────────────────────────────────────────
if [ "$mode" = "list" ]; then
  total=0
  for c in $CHECKERS; do
    f=$(baseline_file "$c")
    n=$(count_lines "$f")
    # 减掉注释行
    if [ -f "$f" ]; then
      hdr=$(awk '/^#/{n++} END{print n+0}' "$f")
      n=$((n - hdr))
    fi
    printf '%-10s 基线条目: %s\n' "$c" "$n"
    total=$((total + n))
  done
  echo "合计: $total"
  exit 0
fi

mkdir -p "$BASELINE_DIR"

# ── snapshot ───────────────────────────────────────────────────────
if [ "$mode" = "snapshot" ]; then
  for c in $CHECKERS; do
    f=$(baseline_file "$c")
    tmp=$(mktemp)
    {
      echo "# $c 基线(棘轮:只许变少)。由 scripts/lint-baseline.sh snapshot 生成,勿手工编辑。"
      echo "# 每行 = 一条被冻结的存量告警(已去掉行号列号,便于在无关改动后保持稳定)。"
      echo "# 新增告警会被 check 阻断;基线条目被修好后 check 会要求刷新本文件。"
      collect "$c"
    } > "$tmp"
    mv "$tmp" "$f"
    n=$(count_lines "$f")
    hdr=$(awk '/^#/{n++} END{print n+0}' "$f")
    printf 'snapshot %-10s → %s (%s 条)\n' "$c" "$f" "$((n - hdr))"
  done
  echo
  echo "⚠️  基线是一份「允许存在的问题清单」,提交前请 git diff 逐条确认没把真问题冻进去。"
  exit 0
fi

# ── check ──────────────────────────────────────────────────────────
[ "$mode" = "check" ] || { echo "lint-baseline: 未知模式: $mode(支持 check|snapshot|list)" >&2; exit 2; }

rc=0
scar_total=0
for c in $CHECKERS; do
  f=$(baseline_file "$c")
  cur=$(mktemp); base=$(mktemp)
  collect "$c" > "$cur"
  if [ -f "$f" ]; then { grep -v '^#' "$f" || true; } > "$base"; else : > "$base"; fi

  new_findings=$(LC_ALL=C comm -23 "$cur" "$base" || true)   # B - A
  fixed=$(LC_ALL=C comm -13 "$cur" "$base" || true)          # A - B
  remaining=$(count_lines "$base")

  if [ -n "$new_findings" ]; then
    n=$(printf '%s\n' "$new_findings" | awk 'NF{c++} END{print c+0}')
    printf '\n❌ [%s] 新增 %s 条告警(不在基线里 ——「这是历史问题」这条路已经堵死):\n' "$c" "$n"
    printf '%s\n' "$new_findings" | sed 's/^/    /'
    rc=1
  fi

  if [ -n "$fixed" ]; then
    n=$(printf '%s\n' "$fixed" | awk 'NF{c++} END{print c+0}')
    printf '\n❌ [%s] 基线里有 %s 条已修好,请跑 snapshot 刷新(棘轮只许变少,不留免罪符):\n' "$c" "$n"
    printf '%s\n' "$fixed" | sed 's/^/    /'
    rc=1
  fi

  scar_total=$((scar_total + remaining))
  rm -f "$cur" "$base"
done

# ── 伤疤:基线残留必须显眼,否则「允许存在」会慢慢变成「没人记得」 ──
echo
if [ "$scar_total" -gt 0 ]; then
  echo "┌──────────────────────────────────────────────────────────┐"
  printf '│ ⚠️  软门禁伤疤:仍有 %-4s 条存量告警被基线放行            │\n' "$scar_total"
  echo "│    它们不阻断流程,但那是欠的债,不是「没问题」            │"
  echo "│    明细: scripts/lint-baseline.sh list  或  .lint-baseline/ │"
  echo "└──────────────────────────────────────────────────────────┘"
elif [ "$rc" -eq 0 ]; then
  echo "✅ 无新增告警且基线为空 —— 当前 lint 零存量债务,门禁可以一直保持硬的。"
fi

exit $rc
