#!/usr/bin/env bash
# lib/config.sh — 配置加载与校验。默认值必须让「最小仓库」直接可跑。

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

  : "${HARNESS_DOC_ROOTS:=AGENTS.md TODO.md context docs}"
  : "${HARNESS_LAYERS:=team harness-framework decisions project}"
  : "${HARNESS_BUDGET_FILES:=AGENTS.md}"
  : "${HARNESS_BUDGET_BYTES:=16000}"
  : "${HARNESS_PROGRESS_FILE:=TODO.md}"
  : "${HARNESS_SKILL_DOC:=docs/skills.md}"
  : "${HARNESS_SKILL_SECTION:=Skills}"
  : "${HARNESS_ENTRY_DOCS:=AGENTS.md}"
  : "${HARNESS_DOC_SYNC:=1}"
  : "${HARNESS_GITLEAKS:=optional}"
  : "${HARNESS_IP_ALLOWLIST:=}"
  : "${HARNESS_CHECKS:=}"
  : "${HARNESS_DISABLED_CHECKS:=}"
  : "${HARNESS_BASE_REF:=}"
  export HARNESS_DOC_ROOTS HARNESS_LAYERS HARNESS_BUDGET_FILES HARNESS_BUDGET_BYTES \
         HARNESS_PROGRESS_FILE HARNESS_SKILL_DOC HARNESS_SKILL_SECTION HARNESS_ENTRY_DOCS \
         HARNESS_DOC_SYNC HARNESS_GITLEAKS HARNESS_IP_ALLOWLIST HARNESS_CHECKS \
         HARNESS_DISABLED_CHECKS HARNESS_BASE_REF REPO_ROOT KIT_ROOT HARNESS_CONFIG
}

h_config_validate() {
  local problems=0 p

  case "$HARNESS_BUDGET_BYTES" in
    ''|*[!0-9]*) printf 'harness: HARNESS_BUDGET_BYTES 必须是整数（当前：%s）\n' "$HARNESS_BUDGET_BYTES" >&2; problems=$((problems+1)) ;;
  esac

  for p in $HARNESS_BUDGET_FILES $HARNESS_PROGRESS_FILE $HARNESS_ENTRY_DOCS; do
    [ -e "$REPO_ROOT/$p" ] || { printf 'harness: 配置引用的文件不存在：%s\n' "$p" >&2; problems=$((problems+1)); }
  done

  if [ -n "$HARNESS_SKILL_DOC" ] && [ ! -f "$REPO_ROOT/$HARNESS_SKILL_DOC" ]; then
    printf 'harness: HARNESS_SKILL_DOC 指向的文件不存在：%s\n' "$HARNESS_SKILL_DOC" >&2
    problems=$((problems+1))
  fi

  for p in $HARNESS_DOC_ROOTS; do
    [ -e "$REPO_ROOT/$p" ] || { printf 'harness: HARNESS_DOC_ROOTS 里的路径不存在：%s\n' "$p" >&2; problems=$((problems+1)); }
  done

  case "$HARNESS_GITLEAKS" in
    off|optional|required) ;;
    *) printf 'harness: HARNESS_GITLEAKS 只能是 off / optional / required（当前：%s）\n' "$HARNESS_GITLEAKS" >&2; problems=$((problems+1)) ;;
  esac

  [ "$problems" -eq 0 ] || exit 2
}
