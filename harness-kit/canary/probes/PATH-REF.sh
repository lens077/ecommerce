#!/usr/bin/env bash
# 注错：正文里写一个以真实顶层目录开头、但不存在的路径。
sb="$1"
printf '\n改哪个文件见 `context/no-such-canary.md`。\n' >> "$sb/AGENTS.md"
