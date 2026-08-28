#!/usr/bin/env bash
# PR 供应链门禁：Gitleaks 差异扫描 + zizmor/Trivy 存量棘轮。
set -Eeuo pipefail

GITLEAKS_VERSION=8.30.0
ZIZMOR_VERSION=1.29.0
TRIVY_VERSION=0.74.0
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
CACHE_ROOT=${XDG_CACHE_HOME:-$HOME/.cache}/ecommerce-supply-chain
BIN_DIR=$CACHE_ROOT/bin
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

log() { printf '[supply-chain] %s\n' "$*"; }
fail() { printf '[supply-chain] 失败：%s\n' "$*" >&2; exit 1; }

platform() {
  local os arch
  case $(uname -s) in Darwin) os=darwin ;; Linux) os=linux ;; *) fail "不支持的系统：$(uname -s)" ;; esac
  case $(uname -m) in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=amd64 ;; *) fail "不支持的架构：$(uname -m)" ;; esac
  printf '%s %s\n' "$os" "$arch"
}

download() {
  local url=$1 out=$2
  curl --fail --silent --show-error --location --retry 3 --retry-all-errors "$url" --output "$out"
}

verify_release_asset() {
  local checksums=$1 asset=$2
  local expected actual
  expected=$(awk -v f="$asset" '$2 == f {print $1}' "$checksums")
  [[ -n $expected ]] || fail "校验清单里找不到 $asset"
  actual=$(shasum -a 256 "$WORK_DIR/$asset" | awk '{print $1}')
  [[ $actual == "$expected" ]] || fail "$asset SHA256 不匹配"
}

install_tools() {
  mkdir -p "$BIN_DIR"
  local os arch
  read -r os arch < <(platform)

  if [[ ! -x $BIN_DIR/gitleaks-$GITLEAKS_VERSION ]]; then
    local gos garch asset
    [[ $os == darwin ]] && gos=darwin || gos=linux
    [[ $arch == arm64 ]] && garch=arm64 || garch=x64
    asset="gitleaks_${GITLEAKS_VERSION}_${gos}_${garch}.tar.gz"
    download "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${asset}" "$WORK_DIR/$asset"
    download "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_checksums.txt" "$WORK_DIR/gitleaks-checksums.txt"
    verify_release_asset "$WORK_DIR/gitleaks-checksums.txt" "$asset"
    tar -xzf "$WORK_DIR/$asset" -C "$WORK_DIR" gitleaks
    install -m 0755 "$WORK_DIR/gitleaks" "$BIN_DIR/gitleaks-$GITLEAKS_VERSION"
  fi

  if [[ ! -x $BIN_DIR/zizmor-$ZIZMOR_VERSION ]]; then
    local zarch ztarget asset
    [[ $arch == arm64 ]] && zarch=aarch64 || zarch=x86_64
    [[ $os == darwin ]] && ztarget=apple-darwin || ztarget=unknown-linux-gnu
    asset="zizmor-${zarch}-${ztarget}.tar.gz"
    download "https://github.com/zizmorcore/zizmor/releases/download/v${ZIZMOR_VERSION}/${asset}" "$WORK_DIR/$asset"
    # zizmor release 未附 checksums 文件，因此直接钉住本项目实际使用的两个发布物摘要。
    local expected actual
    case $asset in
      zizmor-aarch64-apple-darwin.tar.gz) expected=720322fade9e83a9c7953944c438f2ba942636b86b96a8f0e6b15ce94c8a6b6f ;;
      zizmor-x86_64-unknown-linux-gnu.tar.gz) expected=dd96df044a6e8538d5f423790f453bdd03d49e5b2bcc38214acc41a2f1297839 ;;
      *) fail "zizmor 发布物尚未钉 SHA256：$asset" ;;
    esac
    actual=$(shasum -a 256 "$WORK_DIR/$asset" | awk '{print $1}')
    [[ $actual == "$expected" ]] || fail "$asset SHA256 不匹配"
    tar -xzf "$WORK_DIR/$asset" -C "$WORK_DIR" zizmor
    install -m 0755 "$WORK_DIR/zizmor" "$BIN_DIR/zizmor-$ZIZMOR_VERSION"
  fi

  if [[ ! -x $BIN_DIR/trivy-$TRIVY_VERSION ]]; then
    local tos tarch asset
    [[ $os == darwin ]] && tos=macOS || tos=Linux
    [[ $arch == arm64 ]] && tarch=ARM64 || tarch=64bit
    asset="trivy_${TRIVY_VERSION}_${tos}-${tarch}.tar.gz"
    download "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${asset}" "$WORK_DIR/$asset"
    download "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_checksums.txt" "$WORK_DIR/trivy-checksums.txt"
    verify_release_asset "$WORK_DIR/trivy-checksums.txt" "$asset"
    tar -xzf "$WORK_DIR/$asset" -C "$WORK_DIR" trivy
    install -m 0755 "$WORK_DIR/trivy" "$BIN_DIR/trivy-$TRIVY_VERSION"
  fi
}

normalize_zizmor() {
  python3 - "$1" "$ROOT" <<'PY'
import hashlib, json, os, sys
findings = json.load(open(sys.argv[1], encoding="utf-8"))
root = os.path.realpath(sys.argv[2])
out = set()
for finding in findings:
    for loc in finding.get("locations", []):
        symbolic = loc.get("symbolic", {})
        path = symbolic.get("key", {}).get("Local", {}).get("verbatim_path", "")
        if path and os.path.isabs(path):
            path = os.path.relpath(path, root)
        annotation = symbolic.get("annotation", "")
        route = json.dumps(symbolic.get("route", {}), sort_keys=True, separators=(",", ":"))
        raw = "|".join((finding.get("ident", ""), path, annotation, route))
        out.add(f"{hashlib.sha256(raw.encode()).hexdigest()}  {raw}")
print("\n".join(sorted(out)))
PY
}

normalize_trivy() {
  python3 - "$1" <<'PY'
import hashlib, json, sys
report = json.load(open(sys.argv[1], encoding="utf-8"))
out = set()
for result in report.get("Results", []):
    for finding in result.get("Misconfigurations") or []:
        if finding.get("Status") != "FAIL":
            continue
        raw = "|".join((finding.get("ID", ""), result.get("Target", ""), finding.get("Message", "")))
        out.add(f"{hashlib.sha256(raw.encode()).hexdigest()}  {raw}")
print("\n".join(sorted(out)))
PY
}

ratchet() {
  local name=$1 current=$2 baseline=$3
  [[ -f $baseline ]] || fail "$name 基线不存在：$baseline"
  comm -23 <(sort -u "$current") <(sort -u "$baseline") > "$WORK_DIR/$name-new.txt"
  if [[ -s $WORK_DIR/$name-new.txt ]]; then
    cat "$WORK_DIR/$name-new.txt" >&2
    fail "$name 发现新增告警；修复新增项，不要直接扩基线"
  fi
  log "$name 通过（当前 $(wc -l < "$current" | tr -d ' ') 条，未新增）"
}

scan_gitleaks() {
  local base=${BASE_REF:-}
  if [[ -z $base ]]; then
    if [[ -n ${GITHUB_BASE_REF:-} ]]; then
      base="origin/${GITHUB_BASE_REF}"
    elif git rev-parse HEAD~1 >/dev/null 2>&1; then
      base=HEAD~1
    else
      base=HEAD
    fi
  fi
  log "Gitleaks：扫描提交范围 ${base}..HEAD"
  "$BIN_DIR/gitleaks-$GITLEAKS_VERSION" git "$ROOT" --no-banner --redact \
    --log-opts="${base}..HEAD" --report-format sarif --report-path "$WORK_DIR/gitleaks.sarif"
}

scan_zizmor() {
  log "zizmor：扫描 GitHub Actions（medium+/medium+，存量棘轮）"
  set +e
  (cd "$ROOT" && "$BIN_DIR/zizmor-$ZIZMOR_VERSION" .github/workflows --format json \
    --min-severity medium --min-confidence medium --no-progress) > "$WORK_DIR/zizmor.json"
  local rc=$?
  set -e
  [[ $rc == 0 || $rc == 14 ]] || fail "zizmor 工具执行失败（rc=$rc）"
  normalize_zizmor "$WORK_DIR/zizmor.json" > "$WORK_DIR/zizmor.txt"
  ratchet zizmor "$WORK_DIR/zizmor.txt" "$ROOT/.supply-chain-baseline/zizmor.txt"
}

scan_trivy() {
  log "Trivy：扫描 HIGH/CRITICAL 配置误配（存量棘轮）"
  "$BIN_DIR/trivy-$TRIVY_VERSION" fs "$ROOT" --scanners misconfig --severity HIGH,CRITICAL \
    --skip-files '**/*.dockerignore' --exit-code 0 --no-progress --format json --output "$WORK_DIR/trivy.json"
  normalize_trivy "$WORK_DIR/trivy.json" > "$WORK_DIR/trivy.txt"
  ratchet trivy "$WORK_DIR/trivy.txt" "$ROOT/.supply-chain-baseline/trivy.txt"
}

main() {
  install_tools
  scan_gitleaks
  scan_zizmor
  scan_trivy
  log "PR 供应链三件套全部通过"
}

main "$@"
