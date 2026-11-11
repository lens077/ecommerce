#!/usr/bin/env bash
# lib/runner.sh — 检查的发现、过滤与执行。
#
# 契约（check 文件头部注释，缺一即视为无效检查）：
#   # id: dead-link        # 稳定标识，用于 HARNESS_CHECKS 开关
#   # tag: DEAD-LINK       # 失败输出里的 tag，canary 探针按它匹配
#   # desc: 相对链接必须可达
#   # fast: 1              # 可选，pre-commit 快检集合
#   # config: HARNESS_DOC_ROOTS HARNESS_PROGRESS_FILE   # 可选，声明依赖的配置项（doctor 用）
#
# 执行方式：bash checks/NN-id.sh，环境里带 HARNESS_* 与 REPO_ROOT/KIT_ROOT。
# 退出码 0 = 通过，1 = 有失败，2 = 环境/配置错误。

h_check_meta() { # h_check_meta <file> <key>
  sed -n "s/^# $2: *//p" "$1" | head -1
}

h_check_enabled() { # h_check_enabled <id> <tag>
  local id="$1" tag="$2" item
  for item in $HARNESS_DISABLED_CHECKS; do
    [ "$item" = "$id" ] || [ "$item" = "$tag" ] && return 1
  done
  [ -z "$HARNESS_CHECKS" ] && return 0
  for item in $HARNESS_CHECKS; do
    [ "$item" = "$id" ] || [ "$item" = "$tag" ] && return 0
  done
  return 1
}

h_run_checks() { # h_run_checks [fast|all]
  local mode="${1:-all}" f id tag desc rc start dur out total=0 failed=0
  local -a ran=()

  for f in "$KIT_ROOT"/checks/*.sh; do
    [ -f "$f" ] || continue
    id=$(h_check_meta "$f" id)
    tag=$(h_check_meta "$f" tag)
    desc=$(h_check_meta "$f" desc)
    [ -n "$id" ] && [ -n "$tag" ] || { printf 'harness: %s 缺少 # id / # tag 元数据\n' "$f" >&2; return 2; }
    h_check_enabled "$id" "$tag" || continue
    if [ "$mode" = fast ] && [ "$(h_check_meta "$f" fast)" != 1 ]; then continue; fi

    total=$((total + 1))
    start=$(date +%s)
    rc=0
    out=$(cd "$REPO_ROOT" && HARNESS_REPO_ROOT="$REPO_ROOT" HARNESS_KIT="$KIT_ROOT" \
          bash "$f" 2>&1) || rc=$?
    dur=$(( $(date +%s) - start ))

    if [ "$rc" -eq 0 ]; then
      printf '✅ [%s] %s (%ss)\n' "$tag" "$desc" "$dur"
    else
      printf '❌ [%s] %s (%ss)\n%s\n' "$tag" "$desc" "$dur" "$out"
      failed=$((failed + 1))
    fi
    ran+=("$tag")
  done

  if [ "$total" -eq 0 ]; then
    printf 'harness: 没有启用的检查（检查 HARNESS_CHECKS / HARNESS_DISABLED_CHECKS）\n' >&2
    return 2
  fi

  printf '\nharness: %s/%s 项通过（%s）\n' "$((total - failed))" "$total" \
    "$([ "$failed" -eq 0 ] && echo OK || echo FAIL)"
  [ "$failed" -eq 0 ]
}
