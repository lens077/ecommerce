#!/usr/bin/env bash
# 打发布 tag 之前在本机把「只有 CI 才会跑」的那几步先跑一遍。
#
# 为什么有这个脚本(2026-09-14/15 三次返工,每次一轮 CI 12–40 分钟):
#   1.7.0  consumer-next Dockerfile 漏拷 packages/lantern/node_modules —— 本地 `pnpm build` 绿,镜像构建红。
#          本地目录本来就有 node_modules,只有 docker build 走 COPY 才会暴露。
#   1.7.6  promote-release.py 只认清单里一处 image: —— parity 绿,CI detect 阶段红。
#          已并入 verify-quick.sh(test-promote-release.py)。
#   1.7.7  init 容器 `cp -a` 在属 root 的 emptyDir 根目录上失败 —— 本地模拟时把挂载点属主设成了运行用户。
# 规律:本地验证跑的不是 CI 那条路,「绿」是假的。本脚本只做一件事——按 tag 以来改了什么,
# 用 CI 同样的 Dockerfile / 同样的 context 真的 docker build 一次。
#
# 用法:scripts/verify-release-local.sh            # 与最近一个发布 tag 比较
#       scripts/verify-release-local.sh 1.7.5      # 与指定 tag 比较
#       FORCE=1 scripts/verify-release-local.sh    # 不看 diff,全部构建
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"
command -v docker >/dev/null || { echo "缺 docker" >&2; exit 2; }

base="${1:-$(git tag --list '[0-9]*' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)}"
[[ -n "$base" ]] || { echo "找不到发布 tag 作基线" >&2; exit 2; }
changed="$(git diff --name-only "$base"..HEAD; git status --porcelain | awk '{print $2}')"
echo "== 基线 $base,改动 $(echo "$changed" | grep -c .) 个文件"

hit() { echo "$changed" | grep -qE "$1"; }
todo=()
if [[ -n "${FORCE:-}" ]] || hit '^frontend/(apps/consumer/|packages/|pnpm-lock|pnpm-workspace|package.json)'; then todo+=(consumer); fi
if [[ -n "${FORCE:-}" ]] || hit '^frontend/(apps/consumer-next/|packages/lantern/|pnpm-lock|pnpm-workspace|package.json)'; then todo+=(consumer-next); fi
# 十份后端 Dockerfile 逐字一致,构建一个代表即可;go.mod / api / pkg / constants 是共享输入
if [[ -n "${FORCE:-}" ]] || hit '^backend/(services/[^/]+/Dockerfile|go\.(mod|sum)|api/|pkg/|constants/)'; then todo+=(backend:cart); fi

if [[ ${#todo[@]} -eq 0 ]]; then echo "✅ 没有触及任何镜像输入,不用构建"; exit 0; fi
echo "== 要构建:${todo[*]}"
rc=0
for t in "${todo[@]}"; do
  case "$t" in
    consumer)      cmd=(docker build -q -f frontend/apps/consumer/Dockerfile -t verify-local/consumer frontend) ;;
    consumer-next) cmd=(docker build -q -f frontend/apps/consumer-next/Dockerfile -t verify-local/consumer-next frontend) ;;
    backend:cart)  cmd=(docker build -q --build-arg SERVICE=cart -f backend/services/cart/Dockerfile -t verify-local/cart backend) ;;
  esac
  printf -- '-- %s: ' "$t"
  if out="$("${cmd[@]}" 2>&1)"; then echo "✅ ${out##*:}" | cut -c1-24; else echo "❌"; echo "$out" | tail -15; rc=1; fi
done
[[ $rc -eq 0 ]] && echo "✅ 镜像本地构建全绿,可以打 tag" || echo "❌ 修好再打 tag——CI 会在同一处红,但要多等一轮" >&2
exit $rc
