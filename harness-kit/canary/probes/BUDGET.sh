#!/usr/bin/env bash
# 注错：把入口文档撑过预算。
sb="$1"
python3 - "$sb/AGENTS.md" <<'PY'
import sys
with open(sys.argv[1], "a", encoding="utf-8") as fh:
    fh.write("\n" + "canary-filler " * 2000 + "\n")
PY
