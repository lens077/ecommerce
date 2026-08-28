#!/usr/bin/env bash
# 为本地或远端容器镜像生成 SPDX 2.3 JSON SBOM；不签名、不推送 attestations。
set -Eeuo pipefail

SYFT_VERSION=1.51.1
CACHE_ROOT=${XDG_CACHE_HOME:-$HOME/.cache}/ecommerce-supply-chain
BIN_DIR=$CACHE_ROOT/bin
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

[[ $# -eq 2 ]] || { echo "用法：$0 <image-ref> <output.spdx.json>" >&2; exit 2; }
IMAGE=$1
OUTPUT=$2

case $(uname -s) in Darwin) os=darwin ;; Linux) os=linux ;; *) echo "不支持的系统" >&2; exit 1 ;; esac
case $(uname -m) in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=amd64 ;; *) echo "不支持的架构" >&2; exit 1 ;; esac

mkdir -p "$BIN_DIR" "$(dirname "$OUTPUT")"
SYFT=$BIN_DIR/syft-$SYFT_VERSION
if [[ ! -x $SYFT ]]; then
  asset="syft_${SYFT_VERSION}_${os}_${arch}.tar.gz"
  base="https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}"
  curl -fsSL --retry 3 --retry-all-errors "$base/$asset" -o "$WORK_DIR/$asset"
  curl -fsSL --retry 3 --retry-all-errors "$base/syft_${SYFT_VERSION}_checksums.txt" -o "$WORK_DIR/checksums.txt"
  expected=$(awk -v f="$asset" '$2 == f {print $1}' "$WORK_DIR/checksums.txt")
  actual=$(shasum -a 256 "$WORK_DIR/$asset" | awk '{print $1}')
  [[ -n $expected && $actual == "$expected" ]] || { echo "$asset SHA256 不匹配" >&2; exit 1; }
  tar -xzf "$WORK_DIR/$asset" -C "$WORK_DIR" syft
  install -m 0755 "$WORK_DIR/syft" "$SYFT"
fi

syft_args=("$IMAGE" -o "spdx-json=$OUTPUT")
if [[ -n ${SYFT_PLATFORM:-} ]]; then
  syft_args+=(--platform "$SYFT_PLATFORM")
fi
SYFT_CHECK_FOR_APP_UPDATE=false "$SYFT" "${syft_args[@]}"
python3 - "$OUTPUT" <<'PY'
import json, sys
path = sys.argv[1]
report = json.load(open(path, encoding="utf-8"))
if report.get("spdxVersion") != "SPDX-2.3":
    raise SystemExit(f"SBOM 版本异常：{report.get('spdxVersion')}")
packages = report.get("packages", [])
if not packages:
    raise SystemExit("SBOM 没有任何 package")
print(f"SBOM 验证通过：{path}，packages={len(packages)}")
PY
