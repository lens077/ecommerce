#!/usr/bin/env bash
# verify-context-canary.sh — verify-context.sh 的元评测（门禁的门禁）。
#
# 为什么需要这个脚本：
# 本仓已有两次同构事故——commitlint 钩子九个月静默失效、verify-freeze.sh 恒绿十七天
# （见 self-refinement.md「教训存档」）。判据早已定型：**门禁的存在性 ≠ 有效性，
# 要验的是「它红过吗」**。但 verify-context.sh 的注错验证只在 2026-08-18 建立时
# 手工跑过一遍，之后脚本改过两次（gitignore 检测、TODO 预算），红路径没有再被考过。
# 对照腾讯《Agent 自进化飞轮》(2026)「元评测集」方法论固化为本脚本：
# 每类检查注入一个已知违规样本，断言门禁真的变红且违规 tag 正确。
#
# 做法：把门禁的扫描对象复制进临时 git 仓（context/ 与 AGENTS.md/TODO.md 用真身，
# 仓外链接目标只放桩文件——门禁只查存在性），逐一注错后在沙箱里跑真门禁。
# 探针 0 验证干净沙箱必须绿（防「恒红」与沙箱腐化）；其余每类检查各一个红探针。
#
# 用法: scripts/verify-context-canary.sh
#   改动 scripts/verify-context.sh 后必跑；CI（context-gate 两侧）每次 push 都跑。
set -euo pipefail

root=$(git rev-parse --show-toplevel) || { echo "canary: 不在 git 仓库内" >&2; exit 2; }
cd "$root"

workdir=$(mktemp -d "${TMPDIR:-/tmp}/ctx-canary.XXXXXX")
trap 'rm -rf "$workdir"' EXIT
fails=0

# 剥掉 ``` 围栏代码块（与门禁同款,避免把示例链接当真链接）
_strip_fences() {
  awk 'BEGIN{f=0} /^```/{f=!f; next} !f{print}' "$1"
}

# 搭模板沙箱：真身文件 + 仓外链接目标的桩（只建一次,探针各自克隆）
build_template() { # build_template <dir>
  sb="$1"
  mkdir -p "$sb/scripts" "$sb/docs"
  cp AGENTS.md TODO.md README.md STACK.md "$sb/"
  cp -R context "$sb/context"
  cp -R docs/design "$sb/docs/design"   # 2026-08-26 门禁扩围至设计文档,沙箱同步
  cp scripts/verify-context.sh "$sb/scripts/"
  [ -f scripts/context-format-baseline.txt ] && cp scripts/context-format-baseline.txt "$sb/scripts/"
  # [PROGRESS-SRC] 的基线与它登记的文件必须同时进沙箱,否则 pristine-green 会假红,
  # 且 progress-grow 会在一个不存在的文件上「误报成功」——2026-08-29 首跑实测到这两种。
  [ -f scripts/context-progress-baseline.txt ] && cp scripts/context-progress-baseline.txt "$sb/scripts/"
  for f in docs/DEVOPS.md docs/SCAFFOLD.md; do [ -f "$f" ] && cp "$f" "$sb/docs/"; done
  [ -f .gitignore ] && cp .gitignore "$sb/"
  # 仓外链接目标放桩：门禁只查 [ -e ] 与 gitignore,不读内容。
  # 动态提取而非手抄清单——新增链接自动获得桩,漏了会被探针 0 当场暴露。
  while IFS= read -r file; do
    dir=$(dirname "$file")
    while IFS= read -r target; do
      [ -z "$target" ] && continue
      case "$target" in
        http://*|https://*|mailto:*|\#*|*://*) continue ;;
      esac
      path="${target%%#*}"
      [ -z "$path" ] && continue
      real="$dir/$path"
      stub="$sb/$dir/$path"
      [ -e "$stub" ] && continue
      if [ -d "$real" ]; then
        mkdir -p "$stub"
      elif [ -e "$real" ]; then
        mkdir -p "$(dirname "$stub")"
        : > "$stub"
      fi   # 真身里也不存在的目标不补桩——让沙箱里的门禁如实报 DEAD-LINK
    done < <(_strip_fences "$file" | grep -oE '\]\([^)]+\)' | sed 's/^](//; s/)$//' || true)
  done < <(find AGENTS.md README.md STACK.md context docs/design -name "*.md" -type f)
}

# 跑一个探针：克隆模板成新沙箱,执行注错函数,断言门禁退出码与违规 tag
probe() { # probe <名称> <期望rc:0|1> <期望tag(rc=1时)> <注错函数(空=不注错)>
  name="$1"; want_rc="$2"; want_tag="$3"; mutate="${4:-}"
  sb="$workdir/$name"
  cp -R "$workdir/template" "$sb"
  git -C "$sb" init -q
  [ -n "$mutate" ] && "$mutate" "$sb"
  rc=0
  out=$(cd "$sb" && bash scripts/verify-context.sh 2>&1) || rc=$?
  if [ "$rc" != "$want_rc" ]; then
    printf '  ✗ %s: 期望 rc=%s,实得 rc=%s\n%s\n' "$name" "$want_rc" "$rc" "$out"
    fails=$((fails + 1))
  elif [ "$want_rc" = 1 ] && ! printf '%s' "$out" | grep -qF "[$want_tag]"; then
    printf '  ✗ %s: rc=1 但输出缺 [%s] tag\n%s\n' "$name" "$want_tag" "$out"
    fails=$((fails + 1))
  else
    printf '  ✓ %s\n' "$name"
  fi
}

# ── 注错函数（每类检查一个已知坏样本）────────────────────────
mut_dead_link() {
  printf '\n[canary 坏链](tmp-canary-missing.md)\n' >> "$1/context/team/local-env.md"
}
mut_dead_link_ignored() { # 目标存在但被 gitignore ——CI 真实抓到过的形态
  : > "$1/docs/tmp-canary-ignored.md"
  printf 'docs/tmp-canary-ignored.md\n' >> "$1/.gitignore"
  printf '\n[canary 被忽略](../../docs/tmp-canary-ignored.md)\n' >> "$1/context/team/local-env.md"
}
mut_dead_link_design() { # 设计文档死链——2026-08-26 门禁扩围后的新红探针
  printf '\n[canary 设计死链](no-such-design.md)\n' >> "$1/docs/design/README.md"
}
mut_orphan() { # 合规 frontmatter 但没登记进层 INDEX
  cat > "$1/context/team/tmp-canary-orphan.md" <<'EOF'
---
name: tmp-canary-orphan
layer: team
description: canary 注错样本——未登记进 INDEX 的孤儿文件
---
# canary
EOF
}
mut_frontmatter() { # name 与文件名不一致
  f="$1/context/team/local-env.md"
  awk '{ sub(/^name: local-env$/, "name: wrong-canary"); print }' "$f" > "$f.new" && mv "$f.new" "$f"
}
mut_format() { # 新 experience 缺「关键陷阱」段(已登记、frontmatter 合规,只违反 FORMAT)
  cat > "$1/context/project/ecommerce/gateway/experience/tmp-canary-trapless.md" <<'EOF'
---
name: tmp-canary-trapless
module: gateway
description: canary 注错样本——缺「关键陷阱」段的 experience
---
# canary

**症状**：只有症状没有陷阱。
EOF
  printf -- '- [tmp-canary-trapless.md](experience/tmp-canary-trapless.md)\n' \
    >> "$1/context/project/ecommerce/gateway/INDEX.md"
}
mut_baseline() { # 已合规文件塞回基线 → 反向棘轮必须报删行
  printf 'context/project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md\n' \
    >> "$1/scripts/context-format-baseline.txt"
}
mut_evolog() { # 抹掉全部「触发事故」要素
  f="$1/context/harness-framework/evolution-log.md"
  grep -v '\*\*触发事故\*\*' "$f" > "$f.new" && mv "$f.new" "$f"
}
mut_budget_agents() {
  head -c 4000 /dev/zero | tr '\0' 'x' >> "$1/AGENTS.md"
}
mut_budget_todo() { # 无论 TODO 当前多瘦，都精确推过 96KB 门槛
  current=$(wc -c < "$1/TODO.md" | tr -d ' ')
  grow=$((96001 - current))
  [ "$grow" -gt 0 ] || grow=1
  head -c "$grow" /dev/zero | tr '\0' 'x' >> "$1/TODO.md"
}
mut_progress_src() { # 未登记基线的文件长出复选框 → 新的并行进度源
  cat > "$1/docs/tmp-canary-progress.md" <<'EOF'
# canary 注错样本——TODO.md 之外的第二套进度视图

- [ ] 未完成项
- [x] 已完成项
EOF
}
mut_progress_grow() { # 已登记基线的文件继续增长 → 只许减不许增
  printf '\n- [ ] canary 新增的并行进度项\n' >> "$1/docs/DEVOPS.md"
}
mut_progress_ratchet() { # 基线文件已清零却没删行 → 反向棘轮
  f="$1/docs/design/platform/capacity-balancing.md"
  grep -v '^[[:space:]]*- \[[ x]\]' "$f" > "$f.new" && mv "$f.new" "$f"
}
mut_progress_fenced_ok() { # 围栏内的复选框是模板占位符,**不得**误报(假阳性守卫)
  # 用 ````markdown 包一层,内部再嵌 ``` —— 正是 SCAFFOLD.md 的写法,
  # 简单的 f=!f 翻转会在这里把后半段误判成正文。
  cat > "$1/docs/tmp-canary-fenced.md" <<'EOF'
# canary：围栏内复选框不应触发 PROGRESS-SRC

````markdown
## 给新项目用的模板

- [ ] 模板占位项
- [x] 模板已完成项

```bash
echo "嵌套围栏"
```

- [ ] 嵌套围栏之后仍在外层围栏内
````
EOF
}

# ── 执行 ─────────────────────────────────────────────────────
# ${workdir} 必须带花括号:后面紧跟全角「）」时,bash 3.2 在 UTF-8 locale 下会把
# 多字节字符的首字节并进变量名,报 workdir? unbound(2026-08-26 实测:LC_ALL=C 绿、
# en_US.UTF-8 红,间歇性取决于调用方环境)。变量紧邻非 ASCII 字符一律加花括号。
echo "verify-context-canary: 元评测开始（沙箱: ${workdir}）"
build_template "$workdir/template"
probe pristine-green      0 ""            ""
probe dead-link           1 "DEAD-LINK"   mut_dead_link
probe dead-link-ignored   1 "DEAD-LINK"   mut_dead_link_ignored
probe dead-link-design    1 "DEAD-LINK"   mut_dead_link_design
probe orphan              1 "ORPHAN"      mut_orphan
probe frontmatter         1 "FRONTMATTER" mut_frontmatter
probe format              1 "FORMAT"      mut_format
probe baseline-ratchet    1 "BASELINE"    mut_baseline
probe evolog              1 "EVOLOG"      mut_evolog
probe budget-agents       1 "BUDGET"      mut_budget_agents
probe budget-todo         1 "BUDGET"      mut_budget_todo
probe progress-src        1 "PROGRESS-SRC" mut_progress_src
probe progress-grow       1 "PROGRESS-SRC" mut_progress_grow
probe progress-ratchet    1 "BASELINE"     mut_progress_ratchet
# 假阳性守卫:围栏内的模板占位符必须**不**触发,否则 SCAFFOLD.md 这类文件会被误杀
probe progress-fenced-ok  0 ""             mut_progress_fenced_ok

if [ "$fails" -gt 0 ]; then
  echo "verify-context-canary: $fails 个探针失败——门禁可能已静默失效,先修门禁再改内容"
  exit 1
fi
echo "verify-context-canary: OK（15 探针全过:干净沙箱绿 + 十三类注错被拦且 tag 正确 + 围栏假阳性守卫）"
