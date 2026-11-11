#!/usr/bin/env bash
# 注错：把一段看起来像口令的赋值写进已跟踪文件。
# 关键字与值在运行时拼出来，避免探针自己的源码命中本检查（探针也是被扫描的文件）。
sb="$1"
printf '\n%s = "%s"\n' "pass""word" "canary-""secret-value" >> "$sb/AGENTS.md"
