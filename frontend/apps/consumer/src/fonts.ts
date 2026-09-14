/**
 * 字体:首次 render 之后才动态 import 本模块。
 *
 * @fontsource 的 CSS 是按 unicode-range 切片的 @font-face 声明——Noto Serif SC 一个字重 101 条,
 * 三个字重 303 条,gzip 后 162KB。它们 import 在入口里就会进阻塞 CSS,首屏什么都没画就先等它
 * (2026-09-15 实测:这是 PageSpeed 移动端 61 分的头号原因)。挪到这里后 Vite 把它打成独立 CSS,
 * 由 preload helper 非阻塞加载;`font-display: swap` 保证文字先用后备字体画出来。
 *
 * 400 字重已去掉(全站只用一处,由后备字体承担);Roboto 保留、同样延后。
 */
import "@fontsource/noto-serif-sc/700.css";
import "@fontsource/noto-serif-sc/900.css";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
