#!/usr/bin/env bash
# 统一入口；Python 负责相对导入闭包及只读漂移检查，兼容 macOS Bash 3.2。
set -euo pipefail
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
exec python3 "$root/scripts/sync-ts-gen.py" "$@"
