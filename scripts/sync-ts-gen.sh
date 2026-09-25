#!/usr/bin/env bash
# 统一入口；Python 负责相对导入闭包及只读漂移检查，兼容 macOS Bash 3.2。
set -euo pipefail
# pre-push 会继承相对 GIT_WORK_TREE，git -C 会把它错解成 scripts/；用脚本位置定位。
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec python3 "$root/scripts/sync-ts-gen.py" "$@"
