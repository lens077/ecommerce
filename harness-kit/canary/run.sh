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
  local sb="$workdir/template" p
  mkdir -p "$sb"
  cp -R "$KIT_ROOT" "$sb/harness"
  [ -f "$REPO_ROOT/harness.config.sh" ] && cp "$REPO_ROOT/harness.config.sh" "$sb/"
  [ -d "$REPO_ROOT/baselines" ] && cp -R "$REPO_ROOT/baselines" "$sb/"
  # gitleaks 的仓库级 allowlist 要一起进沙箱：否则 SECRETS 在沙箱里用默认规则，
  # 宿主已豁免的夹具会变成干净模板必红（palcommerce、Libra）。
  [ -f "$REPO_ROOT/.gitleaks.toml" ] && cp "$REPO_ROOT/.gitleaks.toml" "$sb/"
  for p in $HARNESS_DOC_ROOTS; do
    copy_doc_root "$sb" "$p"
  done
  # 文档会引用扫描根之外的源码路径（如 `backend/x.go`）。只复制文档目录时，
  # 沙箱里这些顶层目录不存在，PATH-REF 退化成「跳过」或按残缺树误报；
  # 镜像已跟踪文件树后，沙箱的存在性判定与宿主一致（Libra）。
  mirror_tracked "$sb"
  copy_external "$sb"
  git -C "$sb" init -q
  git -C "$sb" -c user.name=canary -c user.email=canary@example.invalid add -A
  git -C "$sb" -c user.name=canary -c user.email=canary@example.invalid commit -qm "canary template"
}

copy_doc_root() { # copy_doc_root <sandbox> <扫描根（文件或目录）>
  local sb="$1" p="$2"
  if [ -d "$REPO_ROOT/$p" ]; then
    mkdir -p "$sb/$p"
    cp -R "$REPO_ROOT/$p/." "$sb/$p/"
  elif [ -f "$REPO_ROOT/$p" ]; then
    # 扫描根可以是子目录里的单个文件（如 docs/README.md）。父目录不存在时
    # cp 直接失败，canary 连模板都建不出来（Libra）。
    mkdir -p "$(dirname "$sb/$p")"
    cp "$REPO_ROOT/$p" "$sb/$p"
  fi
}

mirror_tracked() { # mirror_tracked <sandbox>
  local sb="$1"
  git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || return 0
  git -C "$REPO_ROOT" ls-files -z | python3 -c '
import os, shutil, sys
root, sb = sys.argv[1], sys.argv[2]
for raw in sys.stdin.buffer.read().split(b"\0"):
    if not raw:
        continue
    rel = raw.decode("utf-8", "surrogateescape")
    src, dst = os.path.join(root, rel), os.path.join(sb, rel)
    if os.path.islink(src) or not os.path.isfile(src):
        continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
' "$REPO_ROOT" "$sb"
}

copy_external() { # copy_external <sandbox>
  local sb="$1" ext src dst
  [ -n "${HARNESS_CANARY_EXTERNAL:-}" ] || return 0
  for ext in $HARNESS_CANARY_EXTERNAL; do
    src="$REPO_ROOT/$ext"
    [ -e "$src" ] || continue
    # 保持同样的相对位置：沙箱里的 ../x 要和宿主仓库的 ../x 指向同一份资源。
    dst=$(cd "$sb" && python3 -c 'import os,sys; print(os.path.normpath(os.path.join(sys.argv[1], sys.argv[2])))' "$sb" "$ext")
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$dst"
  done
}

clone_dir() { # clone_dir <src> <dst>（macOS 用 APFS 克隆，其余平台退回整拷贝）
  if cp -cR "$1" "$2" 2>/dev/null; then return 0; fi
  rm -rf "$2"
  cp -R "$1" "$2"
}

run_gate() { # run_gate <sandbox> → 输出，rc 通过全局 RC 返回
  local sb="$1" v
  local scrub=()
  # 父进程 h_load_config 导出的 HARNESS_* 会被子进程继承：沙箱配置没写的项
  # 会拿到宿主仓库的值（例如 HARNESS_SKILL_DOC 指向宿主路径），判定的不是沙箱。
  # 只保留显式传入的 HARNESS_REPO_ROOT / HARNESS_CONFIG。
  while IFS= read -r v; do scrub+=(-u "$v"); done < <(env | sed -n 's/^\(HARNESS_[A-Za-z0-9_]*\)=.*/\1/p')
  RC=0
  OUT=$(env "${scrub[@]}" HARNESS_REPO_ROOT="$sb" HARNESS_CONFIG="$sb/harness.config.sh" \
        bash "$sb/harness/bin/harness" check 2>&1) || RC=$?
}

probe() { # probe <名称> <期望rc> <期望tag|空> <注错脚本|空>
  local name="$1" want_rc="$2" want_tag="$3" mutate="${4:-}" sb
  probes=$((probes + 1))
  sb="$workdir/$name"
  clone_dir "$workdir/template" "$sb"
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

# ── canary 自身回归：这些修法在沙箱构建阶段，探针（模板之后注错）覆盖不到 ──
# 每条都对应一次「修前会红」的事故；不写就只能靠下次接入再撞一遍。

write_min_config() { # write_min_config <仓库> <启用的检查 id> [额外配置行]
  local repo="$1" checks="$2" extra="${3:-}"
  cat > "$repo/harness.config.sh" <<EOF
HARNESS_DOC_ROOTS="AGENTS.md"
HARNESS_BUDGETS=""
HARNESS_PROGRESS_FILE="AGENTS.md"
HARNESS_SKILL_DOC="AGENTS.md"
HARNESS_SKILL_SECTION="Skills"
HARNESS_SKILL_ENTRY_DOCS="AGENTS.md"
HARNESS_AFFECTS_ROOTS="AGENTS.md"
HARNESS_RETIRED_ROOTS="AGENTS.md"
HARNESS_CHECKS="$checks"
HARNESS_GITLEAKS="off"
$extra
EOF
}

check_hook_git_dir() {
  local sb="$workdir/template" want got
  want=$(cd "$sb" && pwd -P)
  got=$(cd "$sb/harness" && env -u HARNESS_REPO_ROOT -u HARNESS_CONFIG GIT_DIR="$sb/.git" \
        bash -c '. "$1/lib/config.sh"; h_detect_roots; printf "%s" "$REPO_ROOT"' _ "$PWD" 2>/dev/null)
  if [ "$got" != "$want" ]; then
    printf '  ✗ selfcheck hook-git-dir: GIT_DIR 污染后 REPO_ROOT=%s（期望 %s）\n' "$got" "$want"
    fails=$((fails + 1)); return
  fi
  printf '  ✓ selfcheck hook-git-dir: GIT_DIR 存在时仍解析到仓库根\n'
}

check_template_mirror() {
  local missing f
  git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || return 0
  missing=$(git -C "$REPO_ROOT" ls-files | while IFS= read -r f; do
    [ -f "$REPO_ROOT/$f" ] || continue
    [ -e "$workdir/template/$f" ] || printf '%s\n' "$f"
  done | awk 'NR<=3')
  if [ -n "$missing" ]; then
    printf '  ✗ selfcheck template-mirror: 沙箱缺已跟踪文件：\n%s\n' "$(printf '%s' "$missing" | sed 's/^/      /')"
    fails=$((fails + 1)); return
  fi
  printf '  ✓ selfcheck template-mirror: 已跟踪文件树完整\n'
}

check_gitleaks_copy() {
  if [ ! -f "$REPO_ROOT/.gitleaks.toml" ]; then
    printf '  · selfcheck gitleaks-copy: 宿主无 .gitleaks.toml，跳过\n'; return
  fi
  if [ ! -f "$workdir/template/.gitleaks.toml" ]; then
    printf '  ✗ selfcheck gitleaks-copy: .gitleaks.toml 未复制进沙箱\n'
    fails=$((fails + 1)); return
  fi
  printf '  ✓ selfcheck gitleaks-copy: .gitleaks.toml 已复制\n'
}

check_single_file_doc_root() {
  local src="$workdir/aux-docroot/src" out="$workdir/aux-docroot/out"
  mkdir -p "$src/docs" "$out"
  printf '# readme\n' > "$src/docs/README.md"
  ( REPO_ROOT="$src"; copy_doc_root "$out" "docs/README.md" )
  if [ ! -f "$out/docs/README.md" ]; then
    printf '  ✗ selfcheck doc-root-single-file: 子目录单文件扫描根未复制\n'
    fails=$((fails + 1)); return
  fi
  printf '  ✓ selfcheck doc-root-single-file: 子目录单文件扫描根可复制\n'
}

check_external_paths() {
  local base="$workdir/aux-external" src="$workdir/aux-external/repo" out="$workdir/aux-external/sandbox/template"
  mkdir -p "$src" "$base/shared" "$out"
  printf 'asset\n' > "$base/shared/asset.txt"
  ( REPO_ROOT="$src"; HARNESS_CANARY_EXTERNAL="../shared"; copy_external "$out" )
  if [ ! -f "$base/sandbox/shared/asset.txt" ]; then
    printf '  ✗ selfcheck external-paths: 仓库外资源未按相对位置铺设\n'
    fails=$((fails + 1)); return
  fi
  printf '  ✓ selfcheck external-paths: 仓库外资源按相对位置铺设\n'
}

check_path_ref_patterns() {
  local aux="$workdir/aux-pathref"
  mkdir -p "$aux/harness" "$aux/docs"
  cp -R "$KIT_ROOT/." "$aux/harness/"
  write_min_config "$aux" "path-ref"
  printf '# 文档\n\n见 `docs/README.md:3`（行号）与 `docs/*.spec.ts`（通配）。\n' > "$aux/AGENTS.md"
  printf '# readme\n\n正文\n' > "$aux/docs/README.md"
  run_gate "$aux"
  if [ "$RC" -ne 0 ]; then
    printf '  ✗ selfcheck path-ref-patterns: 通配/path:line 被误报 rc=%s\n%s\n' "$RC" "$OUT"
    fails=$((fails + 1)); return
  fi
  printf '\n缺失 `docs/no-such-file.md`。\n' >> "$aux/AGENTS.md"
  run_gate "$aux"
  if [ "$RC" -ne 1 ] || ! printf '%s' "$OUT" | grep -qF "[PATH-REF]"; then
    printf '  ✗ selfcheck path-ref-patterns: 真缺失未拦住 rc=%s\n%s\n' "$RC" "$OUT"
    fails=$((fails + 1)); return
  fi
  printf '  ✓ selfcheck path-ref-patterns: 通配与 path:line 放行、真缺失仍红\n'
}

check_secrets_allowlist() {
  local aux="$workdir/aux-secrets"
  mkdir -p "$aux/harness" "$aux/fixtures"
  cp -R "$KIT_ROOT/." "$aux/harness/"
  write_min_config "$aux" "secrets" 'HARNESS_SECRETS_ALLOW="fixtures/*"'
  printf '# 文档\n' > "$aux/AGENTS.md"
  # 关键字拆开拼：这段源码本身也在扫描范围内，写全会被自己的 SECRETS 命中。
  printf 'pass%s = "%s"\n' 'word' 'canary-not-a-real-secret' > "$aux/fixtures/fake.env"
  git -C "$aux" init -q
  git -C "$aux" -c user.name=canary -c user.email=canary@example.invalid add -A
  run_gate "$aux"
  if [ "$RC" -ne 0 ]; then
    printf '  ✗ selfcheck secrets-allowlist: 豁免路径仍报 SECRETS rc=%s\n%s\n' "$RC" "$OUT"
    fails=$((fails + 1)); return
  fi
  write_min_config "$aux" "secrets" 'HARNESS_SECRETS_ALLOW=""'
  run_gate "$aux"
  if [ "$RC" -ne 1 ] || ! printf '%s' "$OUT" | grep -qF "[SECRETS]"; then
    printf '  ✗ selfcheck secrets-allowlist: 去掉豁免后未报 SECRETS rc=%s\n%s\n' "$RC" "$OUT"
    fails=$((fails + 1)); return
  fi
  printf '  ✓ selfcheck secrets-allowlist: 豁免生效、去掉豁免即红\n'
}

check_skill_ref_probe_config() {
  local aux="$workdir/aux-skillprobe"
  mkdir -p "$aux/meta"
  printf '## Skills\n\n| skill | 状态 | 说明 |\n| --- | --- | --- |\n| `real-skill` | 采用 | x |\n' > "$aux/meta/skills.md"
  printf '# 入口\n' > "$aux/ENTRY.md"
  if ! ( HARNESS_SKILL_DOC="meta/skills.md" HARNESS_SKILL_SECTION="Skills" \
         HARNESS_SKILL_ENTRY_DOCS="ENTRY.md" bash "$KIT_ROOT/canary/probes/SKILL-REF.sh" "$aux" ); then
    printf '  ✗ selfcheck skill-ref-probe: 探针未按配置路径注错\n'
    fails=$((fails + 1)); return
  fi
  if ! grep -qF 'canary-ghost' "$aux/meta/skills.md" || ! grep -qF 'canary-ghost' "$aux/ENTRY.md"; then
    printf '  ✗ selfcheck skill-ref-probe: 注错落点不是配置指定的文件\n'
    fails=$((fails + 1)); return
  fi
  printf '  ✓ selfcheck skill-ref-probe: 探针读取配置路径\n'
}

echo "canary: 构建模板沙箱"
build_template
probe "clean-template" 0 ""
check_hook_git_dir
check_template_mirror
check_gitleaks_copy
check_single_file_doc_root
check_external_paths
check_path_ref_patterns
check_secrets_allowlist
check_skill_ref_probe_config

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

# ── 正样本：新增检查必须同时证明「不误杀」 ──────────────────────────
# 只证明会红不够：判定写宽了（例如把合规文档也算违规）同样会让门禁失效——
# 受害者会去改基线或关检查，而不是修判定。新增判定一律补一正一反。
POSITIVE_TAGS="AFFECTS INDEX-LINE FORMAT EVIDENCE RETIRED SELFCHECK"
for tag in $POSITIVE_TAGS; do
  [ -f "$KIT_ROOT/canary/positives/$tag.sh" ] && \
    probe "ok-$tag" 0 "" "$KIT_ROOT/canary/positives/$tag.sh"
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

missing_pos=""
for tag in $POSITIVE_TAGS; do
  [ -f "$KIT_ROOT/canary/positives/$tag.sh" ] || missing_pos="${missing_pos}${tag}"$'\n'
done
if [ -n "$missing_pos" ]; then
  printf '  ✗ 以下 tag 要求正样本但没有（只证会红、没证不误杀）：\n%s\n' "$(printf '%s' "$missing_pos" | sed 's/^/      /')"
  fails=$((fails + 1))
fi

# 检查可能被 HARNESS_DISABLED_CHECKS 关掉——这类探针不算孤儿；
# 只有「检查已被删除/改名」才要报。
all_tags=""
for f in "$KIT_ROOT"/checks/*.sh; do
  [ -f "$f" ] || continue
  all_tags="${all_tags}$(h_check_meta "$f" tag)"$'\n'
done
stray=""
for p in "$KIT_ROOT"/canary/probes/*.sh; do
  [ -f "$p" ] || continue
  tag=$(basename "$p" .sh)
  printf '%s\n' "$all_tags" | grep -qxF "$tag" || stray="${stray}${tag}"$'\n'
done
if [ -n "$stray" ]; then
  printf '  ✗ 以下探针没有对应的检查（检查被删/改名后探针没跟着清）：\n%s\n' "$(printf '%s' "$stray" | sed 's/^/      /')"
  fails=$((fails + 1))
fi

echo
if [ "$fails" -gt 0 ]; then
  printf 'verify-canary: FAIL（%d 个问题，%d 个探针）\n' "$fails" "$probes"
  exit 1
fi
printf 'verify-canary: OK（%d 探针全过：干净沙箱绿 + 各类注错被拦且 tag 正确）\n' "$probes"
