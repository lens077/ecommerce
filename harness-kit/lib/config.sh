#!/usr/bin/env bash
# lib/config.sh — 配置加载与校验。默认值必须让「最小仓库」直接可跑。
#
# 配置就是仓库根的 harness.config.sh（bash）。所有键都有默认值，按需覆盖：
# 接进既有仓库时只写与默认不同的项，别把整张表抄一遍。

# 仓库根：优先显式传入，其次 git 顶层，最后用 kit 的上两级。
h_detect_roots() {
  KIT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
  if [ -n "${HARNESS_REPO_ROOT:-}" ]; then
    REPO_ROOT=$HARNESS_REPO_ROOT
  elif REPO_ROOT=$(git -C "$KIT_ROOT" rev-parse --show-toplevel 2>/dev/null); then
    :
  else
    REPO_ROOT=$(cd "$KIT_ROOT/.." && pwd)
  fi
  export KIT_ROOT REPO_ROOT
}

h_load_config() {
  HARNESS_CONFIG=${HARNESS_CONFIG:-$REPO_ROOT/harness.config.sh}
  if [ -f "$HARNESS_CONFIG" ]; then
    # shellcheck disable=SC1090
    . "$HARNESS_CONFIG"
  fi

  # ── 扫描范围 ───────────────────────────────────────────────────
  : "${HARNESS_DOC_ROOTS:=AGENTS.md TODO.md context docs}"
  : "${HARNESS_LAYERS:=team harness-framework decisions project}"
  # project 这类「层 → 项目 → 模块」两级结构；留空表示各层是平的。
  : "${HARNESS_NESTED_LAYER:=}"

  # ── 预算 ───────────────────────────────────────────────────────
  # 每项 `<文件>:<字节数>`，空格分隔。
  : "${HARNESS_BUDGETS:=AGENTS.md:16000}"

  # ── 进度源 ─────────────────────────────────────────────────────
  : "${HARNESS_PROGRESS_FILE:=TODO.md}"
  : "${HARNESS_PROGRESS_SCOPE:=repo}"          # repo | doc-roots
  : "${HARNESS_PROGRESS_ALLOW:=.scratch/* node_modules/*}"
  : "${HARNESS_PROGRESS_BASELINE:=baselines/progress.baseline.txt}"

  # ── Skill 约定 ─────────────────────────────────────────────────
  : "${HARNESS_SKILL_DOC:=docs/skills.md}"
  : "${HARNESS_SKILL_SECTION:=Skills}"
  : "${HARNESS_SKILL_ENTRY_DOCS:=AGENTS.md}"

  # ── 文档责任 ───────────────────────────────────────────────────
  : "${HARNESS_DOC_SYNC:=1}"

  # ── 敏感数据 ───────────────────────────────────────────────────
  # 默认 required：没装 gitleaks 就直接红，避免「工具没装所以这层静默跳过」。
  : "${HARNESS_GITLEAKS:=required}"
  : "${HARNESS_IP_ALLOWLIST:=}"

  # ── 经验文档格式 / 证据 ────────────────────────────────────────
  : "${HARNESS_FORMAT_GLOBS:=}"
  # 分号分组、竖线表示可选写法：`症状;关键陷阱|陷阱`
  : "${HARNESS_FORMAT_SECTIONS:=}"
  : "${HARNESS_FORMAT_BASELINE:=baselines/format.baseline.txt}"
  : "${HARNESS_EVIDENCE_GLOBS:=}"
  : "${HARNESS_EVIDENCE_SECTION:=证据}"
  : "${HARNESS_EVIDENCE_LABELS:=log trace metric alert kubectl code blame db repro}"

  # ── frontmatter affects ────────────────────────────────────────
  : "${HARNESS_AFFECTS_ROOTS:=context}"

  # ── 退役物横幅 ─────────────────────────────────────────────────
  # TERMS 为正则（awk ERE），留空 = 关闭本检查。
  : "${HARNESS_RETIRED_ROOTS:=}"
  : "${HARNESS_RETIRED_TERMS:=}"
  : "${HARNESS_RETIRED_BANNERS:=存量|退役|历史|迁移期|覆盖|已删除|已停用|不再|已改|旧|撤销|uninstall|孤儿|已迁|不存在}"
  : "${HARNESS_RETIRED_WINDOW:=2}"
  : "${HARNESS_RETIRED_HEAD:=10}"

  # ── INDEX 单元格长度 ───────────────────────────────────────────
  # 每项 `<glob>:<字数上限>`，空格分隔。
  : "${HARNESS_INDEX_LINE_LIMITS:=}"

  # ── 实现单完成自检 ─────────────────────────────────────────────
  : "${HARNESS_SELFCHECK_GLOBS:=}"
  : "${HARNESS_SELFCHECK_STATUS:=^Status:[[:space:]]*done[[:space:]]*$}"
  : "${HARNESS_SELFCHECK_SECTION:=完成自检}"
  : "${HARNESS_SELFCHECK_SEPARATOR:=——}"

  # ── 基线 ───────────────────────────────────────────────────────
  : "${HARNESS_PATHREF_BASELINE:=baselines/pathref.baseline.txt}"

  # ── 检查开关 ───────────────────────────────────────────────────
  : "${HARNESS_CHECKS:=}"
  : "${HARNESS_DISABLED_CHECKS:=}"
  # 适配层检查目录（相对仓库根）。这里放不适合进核心的仓库专属判定。
  : "${HARNESS_EXTRA_CHECKS_DIR:=}"
  : "${HARNESS_BASE_REF:=}"

  export HARNESS_DOC_ROOTS HARNESS_LAYERS HARNESS_NESTED_LAYER \
         HARNESS_BUDGETS HARNESS_PROGRESS_FILE HARNESS_PROGRESS_SCOPE \
         HARNESS_PROGRESS_ALLOW HARNESS_PROGRESS_BASELINE \
         HARNESS_SKILL_DOC HARNESS_SKILL_SECTION HARNESS_SKILL_ENTRY_DOCS \
         HARNESS_DOC_SYNC HARNESS_GITLEAKS HARNESS_IP_ALLOWLIST \
         HARNESS_FORMAT_GLOBS HARNESS_FORMAT_SECTIONS HARNESS_FORMAT_BASELINE \
         HARNESS_EVIDENCE_GLOBS HARNESS_EVIDENCE_SECTION HARNESS_EVIDENCE_LABELS \
         HARNESS_AFFECTS_ROOTS HARNESS_RETIRED_ROOTS HARNESS_RETIRED_TERMS \
         HARNESS_RETIRED_BANNERS HARNESS_RETIRED_WINDOW HARNESS_RETIRED_HEAD \
         HARNESS_INDEX_LINE_LIMITS HARNESS_SELFCHECK_GLOBS HARNESS_SELFCHECK_STATUS \
         HARNESS_SELFCHECK_SECTION HARNESS_SELFCHECK_SEPARATOR HARNESS_PATHREF_BASELINE \
         HARNESS_CHECKS HARNESS_DISABLED_CHECKS HARNESS_EXTRA_CHECKS_DIR \
         HARNESS_BASE_REF REPO_ROOT KIT_ROOT HARNESS_CONFIG
}

h_config_validate() {
  local problems=0 p entry file limit

  for entry in $HARNESS_BUDGETS; do
    file=${entry%:*}
    limit=${entry##*:}
    case "$limit" in
      ''|*[!0-9]*)
        printf 'harness: HARNESS_BUDGETS 的「%s」必须是 <文件>:<字节数>（当前：%s）\n' "$entry" "$limit" >&2
        problems=$((problems+1)) ;;
    esac
    [ -e "$REPO_ROOT/$file" ] || { printf 'harness: 预算引用的文件不存在：%s\n' "$file" >&2; problems=$((problems+1)); }
  done

  for p in $HARNESS_PROGRESS_FILE $HARNESS_SKILL_ENTRY_DOCS; do
    [ -e "$REPO_ROOT/$p" ] || { printf 'harness: 配置引用的文件不存在：%s\n' "$p" >&2; problems=$((problems+1)); }
  done

  if [ -n "$HARNESS_SKILL_DOC" ] && [ ! -f "$REPO_ROOT/$HARNESS_SKILL_DOC" ]; then
    printf 'harness: HARNESS_SKILL_DOC 指向的文件不存在：%s\n' "$HARNESS_SKILL_DOC" >&2
    problems=$((problems+1))
  fi

  for p in $HARNESS_DOC_ROOTS $HARNESS_AFFECTS_ROOTS $HARNESS_RETIRED_ROOTS; do
    [ -e "$REPO_ROOT/$p" ] || { printf 'harness: 配置里的路径不存在：%s\n' "$p" >&2; problems=$((problems+1)); }
  done

  case "$HARNESS_PROGRESS_SCOPE" in
    repo|doc-roots) ;;
    *) printf 'harness: HARNESS_PROGRESS_SCOPE 只能是 repo / doc-roots（当前：%s）\n' "$HARNESS_PROGRESS_SCOPE" >&2; problems=$((problems+1)) ;;
  esac

  case "$HARNESS_GITLEAKS" in
    off|optional|required) ;;
    *) printf 'harness: HARNESS_GITLEAKS 只能是 off / optional / required（当前：%s）\n' "$HARNESS_GITLEAKS" >&2; problems=$((problems+1)) ;;
  esac

  if [ -n "$HARNESS_NESTED_LAYER" ]; then
    case " $HARNESS_LAYERS " in
      *" $HARNESS_NESTED_LAYER "*) ;;
      *) printf 'harness: HARNESS_NESTED_LAYER=%s 不在 HARNESS_LAYERS 里\n' "$HARNESS_NESTED_LAYER" >&2; problems=$((problems+1)) ;;
    esac
  fi

  if [ -n "$HARNESS_FORMAT_GLOBS" ] && [ -z "$HARNESS_FORMAT_SECTIONS" ]; then
    printf 'harness: 配了 HARNESS_FORMAT_GLOBS 就必须配 HARNESS_FORMAT_SECTIONS\n' >&2
    problems=$((problems+1))
  fi
  if [ -z "$HARNESS_FORMAT_GLOBS" ] && [ -n "$HARNESS_FORMAT_SECTIONS" ]; then
    printf 'harness: 配了 HARNESS_FORMAT_SECTIONS 就必须配 HARNESS_FORMAT_GLOBS\n' >&2
    problems=$((problems+1))
  fi

  for entry in $HARNESS_INDEX_LINE_LIMITS; do
    case "$entry" in
      *:*[0-9]*) ;;
      *) printf 'harness: HARNESS_INDEX_LINE_LIMITS 的「%s」必须是 <glob>:<字数>（当前：%s）\n' "$entry" "$entry" >&2; problems=$((problems+1)) ;;
    esac
  done

  for p in "$HARNESS_RETIRED_WINDOW" "$HARNESS_RETIRED_HEAD"; do
    case "$p" in
      ''|*[!0-9]*) printf 'harness: 退役横幅窗口必须是整数（当前：%s）\n' "$p" >&2; problems=$((problems+1)) ;;
    esac
  done

  if [ -n "$HARNESS_EXTRA_CHECKS_DIR" ] && [ ! -d "$REPO_ROOT/$HARNESS_EXTRA_CHECKS_DIR" ]; then
    printf 'harness: HARNESS_EXTRA_CHECKS_DIR 指向的目录不存在：%s\n' "$HARNESS_EXTRA_CHECKS_DIR" >&2
    problems=$((problems+1))
  fi

  [ "$problems" -eq 0 ] || exit 2
}
