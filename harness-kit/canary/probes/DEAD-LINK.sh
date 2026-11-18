#!/usr/bin/env bash
# 注错：入口文档加一个不存在的相对链接。
sb="$1"
printf '\n[canary 坏链](no-such-canary.md)\n' >> "$sb/AGENTS.md"
