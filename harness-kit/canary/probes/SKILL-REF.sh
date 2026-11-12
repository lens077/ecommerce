#!/usr/bin/env bash
# 注错：skill 表里登记一个「缺失」的 skill，入口文档却要求执行它。
# 路径全部读配置（HARNESS_SKILL_DOC / SECTION / ENTRY_DOCS）：硬编码 docs/skills.md
# 只能证明 ecommerce 的布局，换个仓库探针会静默注错到不存在的文件上（Scorpius）。
sb="$1"
skill_doc=${HARNESS_SKILL_DOC:-docs/skills.md}
skill_section=${HARNESS_SKILL_SECTION:-Skills}
entry_docs=${HARNESS_SKILL_ENTRY_DOCS:-AGENTS.md}

python3 - "$sb/$skill_doc" "$skill_section" <<'PY'
import re, sys
path, section = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines()
out, in_table, done = [], False, False
for ln in lines:
    out.append(ln)
    if ln.strip() == "## " + section:
        in_table = True
        continue
    if in_table and ln.startswith("## "):
        in_table = False
    # 插在表头分隔行之后，不依赖状态列用了哪个词；没有分隔行时退回找「采用」。
    if in_table and not done and ln.startswith("|") and re.match(r"^\|[\s:|-]+\|?\s*$", ln):
        out.append("| `canary-ghost` | 缺失 | canary 注错样本 |")
        done = True
    elif in_table and not done and ln.startswith("|") and "采用" in ln:
        out.append("| `canary-ghost` | 缺失 | canary 注错样本 |")
        done = True
open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
if not done:
    sys.exit(1)
PY

entry=""
for e in $entry_docs; do
  [ -f "$sb/$e" ] && { entry="$sb/$e"; break; }
done
[ -n "$entry" ] || { echo "SKILL-REF 探针：入口文档不存在（$entry_docs）" >&2; exit 1; }
printf '\n本仓要求执行 `/canary-ghost`。\n' >> "$entry"
