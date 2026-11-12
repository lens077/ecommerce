#!/usr/bin/env bash
# 注错：skill 表里登记一个「缺失」的 skill，入口文档却要求执行它。
sb="$1"
python3 - "$sb/docs/skills.md" <<'PY'
import sys
path = sys.argv[1]
lines = open(path, encoding="utf-8").read().splitlines()
out, done = [], False
for ln in lines:
    out.append(ln)
    if not done and ln.startswith("|") and "---" not in ln and "采用" in ln:
        out.append("| `canary-ghost` | 缺失 | canary 注错样本 |")
        done = True
open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
PY
printf '\n本仓要求执行 `/canary-ghost`。\n' >> "$sb/AGENTS.md"
