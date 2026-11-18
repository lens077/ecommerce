#!/usr/bin/env bash
# 注错：写入一个公网 IP。
# IP 在运行时拼出来，避免 kit 自己带着一个公网 IP 字面量（它会被本 kit 的 PUBLIC-IP 检查拦）。
sb="$1"
printf '\n调试地址：%s.%s.%s.%s\n' 8 8 8 8 >> "$sb/AGENTS.md"
