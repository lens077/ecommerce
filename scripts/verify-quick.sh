#!/usr/bin/env bash
# verify-quick.sh — 提交前验收锚点的一键并行版。
#
# 动机(2026-08-21,对照腾讯《Multi-Agent 工作流降本》复盘):
#   ① 后端链(go build/vet/test -short)与前端 pnpm ready 无数据依赖,串行跑
#      白白多等一侧;② 全量输出在 AI 修复循环里反复进上下文——绿的部分是纯噪音。
# 因此:两侧并行跑;每侧绿了只打一行摘要,红了只打该侧日志尾部(默认 60 行)。
# 完整日志始终落在临时文件里,路径在摘要中给出,需要时自己看。
#
# 用法:
#   scripts/verify-quick.sh            # 前后端都跑
#   scripts/verify-quick.sh backend    # 只跑后端
#   scripts/verify-quick.sh frontend   # 只跑前端
#
# 注意:这是「最便宜的适用验证」入口,不替代按需锚点——
#   改了 .service-matrix.yaml 仍要单独跑 backend/structcheck(已含在 -short 全量里),
#   改了 context/ 或 AGENTS.md 要跑 scripts/verify-context.sh。
# 凭据扫描与前后端并行执行,只打印 path:line:key,绝不把疑似值带进日志。
set -uo pipefail

root=$(git rev-parse --show-toplevel) || { echo "verify-quick: 不在 git 仓库内" >&2; exit 2; }
cd "$root" || exit 2

want=${1:-all}
case "$want" in all|backend|frontend) ;; *) echo "用法: $0 [backend|frontend]" >&2; exit 2 ;; esac

tail_lines=${VERIFY_QUICK_TAIL:-60}
logdir=$(mktemp -d "${TMPDIR:-/tmp}/verify-quick.XXXXXX")

run_backend() {
  cd backend \
    && go build ./... \
    && go vet ./... \
    && go test -short ./...
}

run_frontend() {
  cd frontend && pnpm ready
}

run_secrets() {
  # 两层:verify-secrets.py 扫工作树(含未跟踪文件,提交前最后一眼);
  # gitleaks 扫全部已提交历史(规则在 .gitleaks.toml,与 pre-commit / CI 同一份)。
  # gitleaks 缺失直接红——2026-09-02 事故后不再允许「没装就跳过」的假门禁。
  python3 scripts/verify-secrets.py || return 1
  command -v gitleaks >/dev/null 2>&1 || { echo "verify-quick: 缺少 gitleaks(brew install gitleaks)" >&2; return 1; }
  gitleaks git . -c .gitleaks.toml --no-banner --redact=80
}

be_pid="" fe_pid="" secrets_pid="" notices_pid=""
start=$SECONDS
if [ "$want" != "frontend" ]; then
  run_backend >"$logdir/backend.log" 2>&1 &
  be_pid=$!
fi
if [ "$want" != "backend" ]; then
  run_frontend >"$logdir/frontend.log" 2>&1 &
  fe_pid=$!
fi
run_secrets >"$logdir/secrets.log" 2>&1 &
secrets_pid=$!
# 许可声明新鲜度:pre-commit 会在依赖变更时自动重生成,这里只兜住绕过钩子的提交。
scripts/gen-third-party-notices.sh --check >"$logdir/notices.log" 2>&1 &
notices_pid=$!

report() { # report <名字> <rc> <log>
  local name=$1 rc=$2 log=$3
  if [ "$rc" = 0 ]; then
    echo "✅ $name 绿($(( SECONDS - start ))s)——输出已省略,完整日志: $log"
  else
    echo "❌ $name 红(rc=$rc)——日志尾部 ${tail_lines} 行(完整日志: $log):"
    tail -n "$tail_lines" "$log" | sed 's/^/  | /'
  fi
}

overall=0
if [ -n "$be_pid" ]; then
  be_rc=0; wait "$be_pid" || be_rc=$?
  report "backend(go build+vet+test -short)" "$be_rc" "$logdir/backend.log"
  [ "$be_rc" = 0 ] || overall=1
fi
if [ -n "$fe_pid" ]; then
  fe_rc=0; wait "$fe_pid" || fe_rc=$?
  report "frontend(pnpm ready)" "$fe_rc" "$logdir/frontend.log"
  [ "$fe_rc" = 0 ] || overall=1
fi
secrets_rc=0; wait "$secrets_pid" || secrets_rc=$?
report "secrets(working-tree tripwire)" "$secrets_rc" "$logdir/secrets.log"
[ "$secrets_rc" = 0 ] || overall=1
notices_rc=0; wait "$notices_pid" || notices_rc=$?
report "notices(THIRD_PARTY_NOTICES.md 新鲜度)" "$notices_rc" "$logdir/notices.log"
[ "$notices_rc" = 0 ] || overall=1

exit "$overall"
