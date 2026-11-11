#!/usr/bin/env bash
# lib/util.sh — 输出与 Markdown 工具。被 bin/harness 与每个 check 共同 source。
# 约定：失败一行一条 `  ✗ [TAG] 说明`，成功只打一行汇总，避免刷屏。

H_FAILS=${H_FAILS:-0}

h_fail() { # h_fail <TAG> <说明...>
  local tag="$1"; shift
  printf '  ✗ [%s] %s\n' "$tag" "$*"
  H_FAILS=$((H_FAILS + 1))
}

h_note() { # 检查内部的补充信息，不算失败
  printf '  · %s\n' "$*"
}

h_pass() { # 通过时的一行说明（可选）
  printf '  ✓ %s\n' "$*"
}

h_die() { # 配置/环境错误：直接退出，不走 fail 计数
  printf 'harness: %s\n' "$*" >&2
  exit 2
}

# 剥掉 ``` 围栏代码块：示例链接、示例路径不该被当真。
h_strip_fences() {
  awk 'BEGIN{f=0} /^```/{f=!f; next} !f{print}' "$1"
}

# 列出参与检查的 Markdown 文件（按 HARNESS_DOC_ROOTS，去重）。
h_md_files() {
  local p
  for p in $HARNESS_DOC_ROOTS; do
    if [ -d "$p" ]; then
      find "$p" -name '*.md' -type f 2>/dev/null
    elif [ -f "$p" ]; then
      printf '%s\n' "$p"
    fi
  done | awk '!seen[$0]++'
}

# 读取 frontmatter 的一个标量键（首行 --- 到下一个 --- 之间）。
h_fm_scalar() { # h_fm_scalar <file> <key>
  awk -v k="$2" '
    NR==1 && $0!="---" { exit }
    NR>1 && $0=="---" { exit }
    NR>1 {
      line=$0
      if (index(line, k":")==1) {
        sub("^"k":[[:space:]]*", "", line)
        gsub(/[[:space:]]+$/, "", line)
        print line; exit
      }
    }
  ' "$1"
}

# 读取 frontmatter 的块列表键（affects: 后每行 "- path"）。
h_fm_list() { # h_fm_list <file> <key>
  awk -v k="$2" '
    NR==1 && $0!="---" { exit }
    NR>1 && $0=="---" { exit }
    NR>1 {
      if (tolower($0) ~ "^"k":[[:space:]]*$") { on=1; next }
      if (on && $0 ~ /^[[:space:]]+-[[:space:]]+/) {
        p=$0; sub(/^[[:space:]]+-[[:space:]]+/, "", p); sub(/[[:space:]]+$/, "", p); print p; next
      }
      if (on) { on=0 }
    }
  ' "$1"
}

# 该文件是否被 gitignore（在 git 仓库内时）；不是仓库就当作未忽略。
h_gitignored() {
  git -C "${REPO_ROOT:-.}" rev-parse --git-dir >/dev/null 2>&1 || return 1
  git -C "${REPO_ROOT:-.}" check-ignore -q "$1" 2>/dev/null
}

# 自本次改动以来变更的文件（DOC-SYNC 用）：优先 HARNESS_CHANGED_FILES，其次 git diff。
h_changed_files() {
  if [ -n "${HARNESS_CHANGED_FILES:-}" ]; then
    printf '%s\n' "$HARNESS_CHANGED_FILES" | tr ' ' '\n' | awk 'NF'
    return 0
  fi
  git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || return 0
  local base="${HARNESS_BASE_REF:-HEAD}"
  { git -C "$REPO_ROOT" diff --name-only "$base" 2>/dev/null
    git -C "$REPO_ROOT" diff --cached --name-only 2>/dev/null
  } | awk 'NF && !seen[$0]++'
}
