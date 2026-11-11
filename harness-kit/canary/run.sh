#!/usr/bin/env bash
# canary/run.sh — 门禁的元评测：证明每项检查真的会红，且红得是它该红的 tag。
#
# 为什么需要：门禁的「存在性」不等于「有效性」。脚本在、CI 在，断言却可能恒绿
# （本仓教训：钩子九个月静默失效、探针恒绿十七天）。判据只有一个：它红过吗。
#
# 做法：
#   1. 把宿主仓库参与扫描的文件 + kit 自身复制进临时 git 仓（模板沙箱）；
#   2. 探针 0：干净沙箱必须绿（防恒红、防沙箱腐化）；
#   3. 每个 tag 一个注错探针：注入已知违规，断言 rc=1 且输出含该 tag；
#   4. 元断言：每个启用 tag 都有探针，每个探针都对应一个启用的 tag。
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
KIT_ROOT=${HARNESS_KIT:-$(cd "$HERE/.." && pwd)}
. "$KIT_ROOT/lib/config.sh"
. "$KIT_ROOT/lib/runner.sh"
. "$KIT_ROOT/lib/util.sh"

h_detect_roots
h_load_config

workdir=$(mktemp -d "${TMPDIR:-/tmp}/h-canary.XXXXXX")
trap 'rm -rf "$workdir"' EXIT

fails=0
probes=0

build_template() {
  local sb="$workdir/template"
  mkdir -p "$sb"
  cp -R "$KIT_ROOT" "$sb/harness"
  [ -f "$REPO_ROOT/harness.config.sh" ] && cp "$REPO_ROOT/harness.config.sh" "$sb/"
  [ -d "$REPO_ROOT/baselines" ] && cp -R "$REPO_ROOT/baselines" "$sb/"
  local p
  for p in $HARNESS_DOC_ROOTS; do
    if [ -d "$REPO_ROOT/$p" ]; then
      mkdir -p "$sb/$p"
      cp -R "$REPO_ROOT/$p/." "$sb/$p/"
    elif [ -f "$REPO_ROOT/$p" ]; then
      cp "$REPO_ROOT/$p" "$sb/$p"
    fi
  done
  git -C "$sb" init -q
  git -C "$sb" -c user.name=canary -c user.email=canary@example.invalid add -A
  git -C "$sb" -c user.name=canary -c user.email=canary@example.invalid commit -qm "canary template"
}

run_gate() { # run_gate <sandbox> → 输出，rc 通过全局 RC 返回
  local sb="$1"
  RC=0
  OUT=$(HARNESS_REPO_ROOT="$sb" bash "$sb/harness/bin/harness" check 2>&1) || RC=$?
}

probe() { # probe <名称> <期望rc> <期望tag|空> <注错脚本|空>
  local name="$1" want_rc="$2" want_tag="$3" mutate="${4:-}" sb
  probes=$((probes + 1))
  sb="$workdir/$name"
  cp -R "$workdir/template" "$sb"
  if [ -n "$mutate" ]; then
    bash "$mutate" "$sb" || { printf '  ✗ %s: 注错脚本失败\n' "$name"; fails=$((fails + 1)); return; }
  fi
  run_gate "$sb"
  if [ "$RC" != "$want_rc" ]; then
    printf '  ✗ %s: 期望 rc=%s，实得 rc=%s\n%s\n' "$name" "$want_rc" "$RC" "$OUT"
    fails=$((fails + 1))
  elif [ "$want_rc" = 1 ] && ! printf '%s' "$OUT" | grep -qF "[$want_tag]"; then
    printf '  ✗ %s: rc=1 但输出缺 [%s]\n%s\n' "$name" "$want_tag" "$OUT"
    fails=$((fails + 1))
  else
    printf '  ✓ %s\n' "$name"
  fi
}

echo "canary: 构建模板沙箱"
build_template
probe "clean-template" 0 ""

declared_tags=""
for f in "$KIT_ROOT"/checks/*.sh; do
  [ -f "$f" ] || continue
  id=$(h_check_meta "$f" id)
  tag=$(h_check_meta "$f" tag)
  h_check_enabled "$id" "$tag" || continue
  declared_tags="${declared_tags}${tag}"$'\n'
  if [ -f "$KIT_ROOT/canary/probes/$tag.sh" ]; then
    probe "mut-$tag" 1 "$tag" "$KIT_ROOT/canary/probes/$tag.sh"
  fi
done

# ── 元断言：tag ↔ 探针双向覆盖 ────────────────────────────────────
missing=""
while IFS= read -r tag; do
  [ -z "$tag" ] && continue
  [ -f "$KIT_ROOT/canary/probes/$tag.sh" ] || missing="${missing}${tag}"$'\n'
done <<< "$declared_tags"
if [ -n "$missing" ]; then
  printf '  ✗ 以下启用 tag 没有探针（从未被证明会拦）：\n%s\n' "$(printf '%s' "$missing" | sed 's/^/      /')"
  fails=$((fails + 1))
else
  printf '  ✓ tag 覆盖：%s 个启用 tag 均有探针\n' "$(printf '%s\n' "$declared_tags" | grep -c .)"
fi

stray=""
for p in "$KIT_ROOT"/canary/probes/*.sh; do
  [ -f "$p" ] || continue
  tag=$(basename "$p" .sh)
  printf '%s\n' "$declared_tags" | grep -qxF "$tag" || stray="${stray}${tag}"$'\n'
done
if [ -n "$stray" ]; then
  printf '  ✗ 以下探针没有对应的启用 tag（检查被删/改名后探针没跟着清）：\n%s\n' "$(printf '%s' "$stray" | sed 's/^/      /')"
  fails=$((fails + 1))
fi

echo
if [ "$fails" -gt 0 ]; then
  printf 'verify-canary: FAIL（%d 个问题，%d 个探针）\n' "$fails" "$probes"
  exit 1
fi
printf 'verify-canary: OK（%d 探针全过：干净沙箱绿 + 各类注错被拦且 tag 正确）\n' "$probes"
