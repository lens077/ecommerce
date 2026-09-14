#!/usr/bin/env bash
# 生成首页专用的 Noto Serif SC 子集字体(700 / 900 两个字重)。
#
# 为什么不用 @fontsource 的 unicode-range 切片:那需要 101×3 条 @font-face 进阻塞 CSS
# (实测 gzip 后 162KB,移动端 FCP 4.9s 的主因),而首页文案是构建期常量,字形集合可枚举。
# 本脚本扫描 src/home/copy.ts 与 @ecommerce/lantern 的演示数据,把出现过的字符
# 全部塞进子集;缺字(未来 ListProduct 的真实商品名)由 CSS 字体栈落到系统宋体。
#
# 依赖:uvx(fonttools + brotli 由 uvx 临时装);源字体来自 consumer 的 @fontsource 依赖。
# 产物 src/home/fonts/*.woff2 入库(经 next/font/local 引用,自动 preload + size-adjust 回退)——Docker 构建不跑本脚本。改文案/演示数据后重跑。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/.."
FRONTEND="$APP/../.."
SRC_DIR="$FRONTEND/apps/consumer/node_modules/@fontsource/noto-serif-sc/files"
OUT_DIR="$APP/src/home/fonts"
mkdir -p "$OUT_DIR"

TEXT_FILE="$(mktemp)"
trap 'rm -f "$TEXT_FILE"' EXIT
cat "$APP/src/home/copy.ts" "$FRONTEND/packages/lantern/src/demoProducts.ts" > "$TEXT_FILE"
# 价格数字与常用标点必带
printf '0123456789¥.,:;!?()（）—…·「」' >> "$TEXT_FILE"

for weight in 700 900; do
  src="$SRC_DIR/noto-serif-sc-chinese-simplified-${weight}-normal.woff2"
  out="$OUT_DIR/lantern-serif-${weight}.woff2"
  uvx --from fonttools --with brotli pyftsubset "$src" \
    --text-file="$TEXT_FILE" \
    --flavor=woff2 \
    --layout-features='*' \
    --no-hinting \
    --desubroutinize \
    --output-file="$out"
  printf '%s  %s bytes\n' "$(basename "$out")" "$(stat -f %z "$out" 2>/dev/null || stat -c %s "$out")"
done
