import localFont from "next/font/local";

/**
 * 首页专用宋体子集(scripts/subset-home-fonts.sh 生成)。
 * next/font/local 负责:自托管 + 首屏 preload + 生成 size-adjust 回退字体(降 CLS)。
 * 缺字由 CSS 字体栈落到 Noto Serif SC / Songti SC / SimSun。
 */
export const lanternSerif = localFont({
  src: [
    { path: "./fonts/lantern-serif-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/lantern-serif-900.woff2", weight: "900", style: "normal" },
  ],
  display: "swap",
  preload: true,
  variable: "--lantern-serif",
  fallback: ["Noto Serif SC", "Songti SC", "SimSun", "serif"],
  adjustFontFallback: false,
});
