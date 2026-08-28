#!/usr/bin/env bash
# 安装固定版本 Cosign，并用官方 checksums 校验发布物。
set -Eeuo pipefail

COSIGN_VERSION=3.1.3
CACHE_ROOT=${XDG_CACHE_HOME:-$HOME/.cache}/ecommerce-supply-chain
BIN_DIR=$CACHE_ROOT/bin
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

case $(uname -s) in Darwin) os=darwin ;; Linux) os=linux ;; *) echo "不支持的系统" >&2; exit 1 ;; esac
case $(uname -m) in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=amd64 ;; *) echo "不支持的架构" >&2; exit 1 ;; esac

mkdir -p "$BIN_DIR"
COSIGN=$BIN_DIR/cosign-$COSIGN_VERSION
if [[ ! -x $COSIGN ]]; then
  asset="cosign-${os}-${arch}"
  base="https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}"
  curl -fsSL --retry 3 --retry-all-errors "$base/$asset" -o "$WORK_DIR/$asset"
  curl -fsSL --retry 3 --retry-all-errors "$base/cosign_checksums.txt" -o "$WORK_DIR/checksums.txt"
  expected=$(awk -v f="$asset" '$2 == f {print $1}' "$WORK_DIR/checksums.txt")
  actual=$(shasum -a 256 "$WORK_DIR/$asset" | awk '{print $1}')
  [[ -n $expected && $actual == "$expected" ]] || { echo "$asset SHA256 不匹配" >&2; exit 1; }
  install -m 0755 "$WORK_DIR/$asset" "$COSIGN"
fi

printf '%s\n' "$COSIGN"
