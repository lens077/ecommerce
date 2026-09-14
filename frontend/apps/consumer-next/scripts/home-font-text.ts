/**
 * 列出首页里真正以宋体(700 / 900)渲染的字符串,供 subset-home-fonts.sh 采集字形。
 * 只收实际用宋体的槽位——正文、商家名、卡片商品名都是无衬线,不进子集。
 * 新增用 var(--serif) 的元素时在这里补上对应文案,再重跑 subset 脚本。
 *
 * 运行:node --experimental-strip-types scripts/home-font-text.ts
 * 输出两行:第一行 700 字重文本,第二行 900 字重文本。
 */
import { demoCategories, heroProduct } from "@ecommerce/lantern/demo";
import { homeCopy } from "../src/home/copy.ts";

const w700: string[] = [];
const w900: string[] = [];
for (const copy of Object.values(homeCopy)) {
  // 顶栏品牌、朱砂印按钮、主灯徽记、主灯商品名、价格「起」、类目名、页脚栏目标题
  w700.push(
    copy.brand,
    copy.nav.signIn,
    copy.home.enterMarket,
    copy.home.heroToday,
    copy.home.viewLamp,
    copy.home.priceFrom,
    copy.footer.about.title,
    copy.footer.help.title,
    copy.footer.legal.title,
  );
  // 顶栏/页脚品牌名(900)、大标与灯阵标题
  w900.push(copy.brand, copy.home.slogan, copy.home.gridTitle);
}
w700.push(heroProduct.name, ...demoCategories.map((c) => c.name));
// 价格数字与货币符号(700)
w700.push("0123456789¥.");

const uniq = (parts: string[]) => [...new Set(parts.join(""))].join("");
console.log(uniq(w700));
console.log(uniq(w900));
