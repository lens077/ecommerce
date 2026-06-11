#!/usr/bin/env bash
# 启用 POSIX 模式并设置严格的错误处理机制
set -o posix errexit -o pipefail

# 生成模板
helm template my-release . --debug --values values.yaml

# 更新子chart
helm dependency update
helm dependency build
