#!/bin/sh
# 安装固定版本的 golangci-lint：节点缓存 → GitHub 代理 → GitHub 直连，每一层都校验钉死的 SHA-256。
#
# 触发事故（2026-09-27/28）：backend-gate 连续三次在编译、vet、测试全部通过之后，卡在
# `curl raw.githubusercontent.com/.../install.sh` 下载二进制，curl 退出码 56。同日从 job 可调度的
# k2、k3 实测：GitHub 直连约 10 KB/s，90 秒下不完 15 MB；gh-proxy.com 约 2.5 秒、gh-proxy.org 约 9 秒、
# ghfast.top 约 15 秒，内容与官方校验和一致；ghproxy.net 同样太慢，gh.llkk.cc、github.moeyy.xyz 不可达。
#
# 代理是第三方服务，只影响「能不能下到」，不影响「下到的对不对」：写死的 SHA-256 不符就丢弃并换下一个。
# 原来的 `curl .../HEAD/install.sh | sh` 执行的是上游 HEAD 上的脚本，本身也是供应链风险，一并去掉。
#
# 用法：scripts/ci-install-golangci-lint.sh <bin-dir>
# 环境变量：
#   CI_TOOLS_CACHE  节点持久目录（runner 的 hostPath 挂载）；不存在或不可写时跳过缓存，照常下载。
#   GITHUB_PROXIES  以空格分隔的代理前缀，按顺序尝试；最后总会再试一次 GitHub 直连。
# 升级版本：同时改 VERSION 与 SHA256（取自官方 golangci-lint-<版本>-checksums.txt 的 linux-amd64.tar.gz 行）。
set -eu

VERSION=2.13.1
SHA256=b17bfbc9d4aaa48be7f4f1ce3240bc3d8200c870c072bacf15c26219e2cfb9cc
ASSET="golangci-lint-${VERSION}-linux-amd64"
URL="https://github.com/golangci/golangci-lint/releases/download/v${VERSION}/${ASSET}.tar.gz"
PROXIES="${GITHUB_PROXIES-https://gh-proxy.com/ https://gh-proxy.org/ https://ghfast.top/}"
CACHE_DIR="${CI_TOOLS_CACHE:-}"
DEST="${1:?用法: $0 <bin-dir>}"

verify() { [ "$(sha256sum "$1" | cut -d' ' -f1)" = "$SHA256" ]; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
archive="$tmp/$ASSET.tar.gz"
cached="$CACHE_DIR/$ASSET.tar.gz"

# 先复制到私有临时目录再校验副本：缓存目录任何 job 都可写，「校验原件后再复制」之间原件可能被
# 替换，解压的就是未校验的内容（2026-09-29 接手审查时发现的检查-使用竞态）。
if [ -n "$CACHE_DIR" ] && [ -f "$cached" ] && cp "$cached" "$archive" 2>/dev/null && verify "$archive"; then
  echo "golangci-lint: 节点缓存命中（$cached）"
else
  ok=0
  # 末尾的空字符串代表 GitHub 直连。
  for prefix in $PROXIES ""; do
    name="${prefix:-GitHub 直连}"
    # 低于 100 KB/s 持续 15 秒即放弃：慢源不该像以前那样一拖 90 秒。
    if curl -fsSL --connect-timeout 10 --max-time 120 --speed-limit 102400 --speed-time 15 \
         -o "$archive" "${prefix}${URL}" && verify "$archive"; then
      echo "golangci-lint: 经 $name 下载，SHA-256 校验通过"
      ok=1
      break
    fi
    echo "golangci-lint: $name 下载失败或 SHA-256 不符，换下一个" >&2
    rm -f "$archive"
  done
  if [ "$ok" != 1 ]; then
    echo "golangci-lint: 所有来源都失败" >&2
    exit 1
  fi
  if [ -n "$CACHE_DIR" ] && [ -d "$CACHE_DIR" ] && [ -w "$CACHE_DIR" ]; then
    # 先写临时文件再改名，避免并发 job 读到半个文件；读的时候还会再校验一次。
    cp "$archive" "$cached.$$" && mv -f "$cached.$$" "$cached" && echo "golangci-lint: 已写入节点缓存"
  fi
fi

tar -xzf "$archive" -C "$tmp" "$ASSET/golangci-lint"
mkdir -p "$DEST"
install -m 0755 "$tmp/$ASSET/golangci-lint" "$DEST/golangci-lint"
"$DEST/golangci-lint" version
