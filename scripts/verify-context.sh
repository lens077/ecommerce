#!/usr/bin/env bash
# verify-context.sh — context/ 知识库与 AGENTS.md 的结构门禁。
#
# 参照 deepseek-harness 的 doc-sync 门禁族(verify-md-links / verify-doc-refs /
# verify-agent-note-format / verify-doc-budgets)移植,落地方式沿用本仓惯例:
# 能判定的约束变成脚本,存量漂移走基线棘轮(见 scripts/lint-baseline.sh 的设计)。
#
# 六项检查(任一违规 → 退出码 1):
#   [DEAD-LINK]    AGENTS.md 与 context/**/*.md 的相对 markdown 链接必须可达
#                  (跳过代码块、http(s)/mailto、纯锚点;带 #fragment 的只查文件部分)
#   [ORPHAN]      context/ 下每个非 INDEX 文件必须被所属层的 INDEX.md 链接;
#                  模块 INDEX 必须被 project/ecommerce/INDEX.md 链接
#   [FRONTMATTER] 非 INDEX 文件必须有 frontmatter 且 name/description 齐全,
#                  name 与文件名一致;layer:/module: 若存在必须与路径一致
#   [FORMAT]      experience/*.md 必须含「症状」与「关键陷阱/陷阱」小节
#                  (格式定义见 context/harness-framework/knowledge-layering.md)
#   [EVOLOG]      evolution-log.md 每条必须四要素齐全(改了什么/为什么/触发事故/怎么验证的)
#   [BUDGET]      AGENTS.md ≤ 14000 字节 —— 它每轮整份注入所有 AI 工具的上下文,
#                  超限先把内容搬进 context/ 对应层,不要先提额度
#
# 基线棘轮(scripts/context-format-baseline.txt):
#   [FORMAT] 的存量违规冻结在基线里放行;新文件必须合规;
#   基线条目已合规或已消失 → [BASELINE] 报错要求删行(防止基线变成永久免罪符)。
#
# 用法: scripts/verify-context.sh
set -euo pipefail

root=$(git rev-parse --show-toplevel) || { echo "verify-context: 不在 git 仓库内" >&2; exit 2; }
cd "$root"

baseline_file="scripts/context-format-baseline.txt"
violations=$(mktemp "${TMPDIR:-/tmp}/verify-context.XXXXXX")   # BSD/GNU/busybox 三方兼容的写法
trap 'rm -f "$violations"' EXIT

fail() { # 记一条违规: fail <TAG> <正文>
  printf '  [%s] %s\n' "$1" "$2" >> "$violations"
}

# 剥掉 ``` 围栏代码块后输出正文(避免把示例里的链接当成真链接)
_strip_fences() {
  awk 'BEGIN{f=0} /^```/{f=!f; next} !f{print}' "$1"
}

in_baseline() { # 路径是否被基线豁免
  [ -f "$baseline_file" ] && grep -q "^$1\([[:space:]]\|\$\)" "$baseline_file"
}

# ── 1. 链接可达性 ─────────────────────────────────────────────
while IFS= read -r file; do
  dir=$(dirname "$file")
  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in
      http://*|https://*|mailto:*|\#*) continue ;;   # 外链与纯锚点不查
      *://*) continue ;;
    esac
    path="${target%%#*}"                              # 去掉 #fragment
    [ -z "$path" ] && continue
    if [ ! -e "$dir/$path" ]; then
      fail "DEAD-LINK" "$file → $target"
    fi
  done < <(_strip_fences "$file" | grep -oE '\]\([^)]+\)' | sed 's/^](//; s/)$//' || true)
done < <(find AGENTS.md context -name "*.md" -type f)

# ── 2. INDEX 覆盖性(孤儿检测)────────────────────────────────
# 层入口: context/INDEX.md 必须链接三个层 INDEX
for layer_index in team/INDEX.md harness-framework/INDEX.md project/ecommerce/INDEX.md; do
  grep -qF "$layer_index" context/INDEX.md || fail "ORPHAN" "context/INDEX.md 未链接 $layer_index"
done

# team / harness-framework: 每个文件都要出现在本层 INDEX 里
for layer in team harness-framework; do
  while IFS= read -r file; do
    base=$(basename "$file")
    grep -qF "$base" "context/$layer/INDEX.md" || \
      fail "ORPHAN" "$file 未登记进 context/$layer/INDEX.md"
  done < <(find "context/$layer" -name "*.md" ! -name "INDEX.md" -type f)
done

# project/ecommerce: 文件 → 模块 INDEX;模块 INDEX → 项目 INDEX
while IFS= read -r file; do
  rel="${file#context/project/ecommerce/}"
  module="${rel%%/*}"
  base=$(basename "$file")
  if [ "$base" = "INDEX.md" ]; then
    grep -qF "$module/INDEX.md" context/project/ecommerce/INDEX.md || \
      fail "ORPHAN" "模块 $module 未登记进 project/ecommerce/INDEX.md"
  else
    grep -qF "$base" "context/project/ecommerce/$module/INDEX.md" || \
      fail "ORPHAN" "$file 未登记进 $module/INDEX.md"
  fi
done < <(find context/project/ecommerce -mindepth 2 -name "*.md" -type f)

# ── 3. frontmatter ───────────────────────────────────────────
while IFS= read -r file; do
  if [ "$(head -1 "$file")" != "---" ]; then
    fail "FRONTMATTER" "$file 缺少 frontmatter"
    continue
  fi
  fm=$(awk 'NR==1{next} /^---$/{exit} {print}' "$file")
  name=$(printf '%s\n' "$fm" | sed -n 's/^name:[[:space:]]*//p' | head -1)
  stem=$(basename "$file" .md)
  [ -n "$name" ] || fail "FRONTMATTER" "$file 缺 name:"
  printf '%s\n' "$fm" | grep -q '^description:' || fail "FRONTMATTER" "$file 缺 description:"
  if [ -n "$name" ] && [ "$name" != "$stem" ]; then
    fail "FRONTMATTER" "$file name: $name ≠ 文件名 $stem"
  fi
  # layer:/module: 若声明了,必须与真实路径一致(抓复制粘贴漂移)
  layer_val=$(printf '%s\n' "$fm" | sed -n 's/^layer:[[:space:]]*//p' | head -1)
  module_val=$(printf '%s\n' "$fm" | sed -n 's/^module:[[:space:]]*//p' | head -1)
  case "$file" in
    context/team/*)              expect_layer="team" ;;
    context/harness-framework/*) expect_layer="harness-framework" ;;
    context/project/ecommerce/*)
      rel="${file#context/project/ecommerce/}"
      expect_layer="project/ecommerce/${rel%%/*}" ;;
    *) expect_layer="" ;;
  esac
  if [ -n "$layer_val" ] && [ "$layer_val" != "$expect_layer" ]; then
    fail "FRONTMATTER" "$file layer: $layer_val ≠ 路径推导 $expect_layer"
  fi
  if [ -n "$module_val" ] && [ "project/ecommerce/$module_val" != "$expect_layer" ]; then
    fail "FRONTMATTER" "$file module: $module_val 与路径不符"
  fi
done < <(find context -name "*.md" ! -name "INDEX.md" -type f)

# ── 4. experience 四段格式(症状 + 关键陷阱是硬要求)──────────
has_section() { # has_section <file> <标题>: **X** / **X：副标题** / ## X 任一形式
  grep -qE "^\*\*$2([：:][^*]*)?\*\*|^#{2,3} $2" "$1"
}
while IFS= read -r file; do
  ok=1
  has_section "$file" "症状" || ok=0
  { has_section "$file" "关键陷阱" || has_section "$file" "陷阱"; } || ok=0
  if [ "$ok" = 0 ]; then
    if in_baseline "$file"; then
      : # 存量冻结放行
    else
      fail "FORMAT" "$file 缺「症状」或「关键陷阱」小节(写法见 knowledge-layering.md)"
    fi
  else
    if in_baseline "$file"; then
      fail "BASELINE" "$file 已合规,请从 $baseline_file 删除该行(反向棘轮)"
    fi
  fi
done < <(find context -path "*/experience/*.md" -type f)

# 基线里指向不存在文件的行必须删(防陈旧)
if [ -f "$baseline_file" ]; then
  while IFS= read -r line; do
    entry="${line%%[[:space:]]*}"
    case "$entry" in ""|\#*) continue ;; esac
    [ -f "$entry" ] || fail "BASELINE" "基线条目已不存在: $entry,请从 $baseline_file 删除"
  done < "$baseline_file"
fi

# ── 5. evolution-log 四要素 ──────────────────────────────────
evolog="context/harness-framework/evolution-log.md"
while IFS= read -r title; do
  block=$(awk -v t="$title" '
    $0 == t {on=1; next}
    /^### / {if (on) exit}
    on {print}' "$evolog")
  for req in "改了什么" "为什么" "触发事故" "怎么验证的"; do
    printf '%s\n' "$block" | grep -q "\*\*$req\*\*" || \
      fail "EVOLOG" "「${title#\#\#\# }」缺 **$req**(四要素缺一不可)"
  done
done < <(grep '^### ' "$evolog")

# ── 6. AGENTS.md 预算 ────────────────────────────────────────
budget=14000
size=$(wc -c < AGENTS.md | tr -d ' ')
if [ "$size" -gt "$budget" ]; then
  fail "BUDGET" "AGENTS.md ${size}B > ${budget}B——它每轮整份注入,先把内容搬进 context/,别先提额度"
fi

# ── 汇总 ─────────────────────────────────────────────────────
if [ -s "$violations" ]; then
  echo "verify-context: 发现 $(wc -l < "$violations" | tr -d ' ') 处违规"
  cat "$violations"
  exit 1
fi
echo "verify-context: OK(链接/INDEX 覆盖/frontmatter/experience 格式/evolution-log/预算 全部通过)"
