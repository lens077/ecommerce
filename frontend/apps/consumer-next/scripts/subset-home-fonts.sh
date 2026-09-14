#!/usr/bin/env bash
# 生成首页专用的 Noto Serif SC 子集字体(700 / 900 两个字重)。
#
# 为什么不用 @fontsource 的 unicode-range 切片:那需要 101×3 条 @font-face 进阻塞 CSS
# (实测 gzip 后 162KB,移动端 FCP 4.9s 的主因),而首页文案是构建期常量,字形集合可枚举。
# 字形集合来自 scripts/home-font-text.ts(只收真正以宋体渲染的槽位);
# 缺字(未来 ListProduct 的真实商品名)由 CSS 字体栈落到系统宋体。
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

# 字形集合由 scripts/home-font-text.ts 按「真正用宋体渲染的槽位」列出(两行:700 / 900),
# 而不是扫整个文案文件——1.7.1 那版把两种语言全部文案都塞进 700,单个子集 65KB,
# 线上 LCP 被字体拖到 3.5s;只收实际槽位后两份合计 ~20KB。
TEXT_700="$(mktemp)"; TEXT_900="$(mktemp)"
trap 'rm -f "$TEXT_700" "$TEXT_900"' EXIT
(cd "$APP" && node --experimental-strip-types scripts/home-font-text.ts 2>/dev/null) | {
  IFS= read -r line700; IFS= read -r line900
  printf '%s' "$line700" > "$TEXT_700"
  printf '%s' "$line900" > "$TEXT_900"
}
[ -s "$TEXT_700" ] && [ -s "$TEXT_900" ] || { echo "home-font-text.ts 没有输出字形集合" >&2; exit 1; }

for weight in 700 900; do
  src="$SRC_DIR/noto-serif-sc-chinese-simplified-${weight}-normal.woff2"
  out="$OUT_DIR/lantern-serif-${weight}.woff2"
  uvx --from fonttools --with brotli pyftsubset "$src" \
    --text-file="$(eval echo "\$TEXT_$weight")" \
    --flavor=woff2 \
    --layout-features='*' \
    --no-hinting \
    --desubroutinize \
    --output-file="$out"
  printf '%s  %s bytes\n' "$(basename "$out")" "$(stat -f %z "$out" 2>/dev/null || stat -c %s "$out")"
done
