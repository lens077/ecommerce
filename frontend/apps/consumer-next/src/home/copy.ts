/**
 * 首页文案(zh / en)。
 *
 * consumer-next 没有接 i18next(公开页在服务端渲染,语言由路径段决定),
 * 文案直接以对象常量表达;键名与 SPA 的 consumer.json 保持一致,便于对照。
 * scripts/subset-home-fonts.sh 会扫描本文件采集字形,新增文案后重跑它。
 */
export const LANGUAGES = ["zh", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: string): value is Language {
  return LANGUAGES.some((lang) => lang === value);
}

/**
 * 首页 TDK 的取词与格式约定见 docs/frontend/semantic-html.md「TDK」一节，要点：
 * - 标题按百度《网页标题规范》首页格式「品牌名 - slogan」，分隔符只用 `-`；
 *   slogan 位用行业词（综合网上购物商城 + 类目），类目必须是首页类目竹架上真实存在的
 *   （@ecommerce/lantern 的 demoCategories），改竹架时同步改这里。
 * - 描述写站点核心内容与服务，百度建议 50 字左右；不写页面兑现不了的承诺（正品、低价、包邮、
 *   下单时效等），也不用「最」「第一」这类广告法绝对化用语。
 * - keywords：Google 官方声明不用它排序，百度站长问答说「不见得会起到预期的排序效果」；
 *   只放少量准确的词，不堆砌。
 */
export interface HomeCopy {
  htmlLang: string;
  /** 首页 `<title>`（absolute，不套 layout 模板） */
  title: string;
  /** 首页 meta description，同时是 layout 给未声明描述的子页面的兜底 */
  description: string;
  keywords: string[];
  brand: string;
  nav: {
    searchPlaceholder: string;
    searchLabel: string;
    searchEmpty: string;
    searchError: string;
    cart: string;
    signIn: string;
    account: string;
    language: string;
    languageHref: string;
  };
  home: {
    slogan: string;
    sloganSub: string;
    enterMarket: string;
    heroToday: string;
    viewLamp: string;
    categoriesTitle: string;
    gridTitle: string;
    demoBadge: string;
    demoNote: string;
    priceFrom: string;
  };
  footer: {
    tagline: string;
    about: { title: string; company: string; contact: string; careers: string };
    help: { title: string; faq: string; guide: string; afterSales: string };
    legal: { title: string; privacy: string; terms: string; cookie: string };
    copyright: (year: number) => string;
    sitemap: string;
    icp: string;
  };
}

const zh: HomeCopy = {
  htmlLang: "zh-CN",
  title: "灯市 - 综合网上购物商城：数码家电、服饰美妆、食品家居",
  description:
    "灯市是综合网上购物商城，设有数码、家电、服饰、美妆、食品、家居、运动、图书等类目，支持站内商品搜索。",
  keywords: [
    "灯市",
    "网上购物商城",
    "综合商城",
    "网购",
    "数码家电",
    "服饰美妆",
    "食品",
    "家居",
    "运动",
    "图书",
  ],
  brand: "灯市",
  nav: {
    searchPlaceholder: "搜索商品...",
    searchLabel: "搜索商品",
    searchEmpty: "未找到相关商品",
    searchError: "搜索暂不可用，请稍后再试",
    cart: "购物车",
    signIn: "登录",
    account: "个人中心",
    language: "English",
    languageHref: "/en",
  },
  home: {
    slogan: "灯市开了。",
    sloganSub: "每件好物是一盏灯——数码、服饰、食百，从街头逛到亮为止。",
    enterMarket: "进灯市",
    heroToday: "本日主灯",
    viewLamp: "看灯去",
    categoriesTitle: "灯市街巷",
    gridTitle: "今日亮灯",
    demoBadge: "演示商品",
    demoNote: "以上为演示商品与虚构商家，商品服务（ListProduct）接通后即替换为真实货架。",
    priceFrom: "起",
  },
  footer: {
    tagline: "每件好物是一盏灯。灯市为你点亮数码、服饰、食百的整条长街。",
    about: { title: "关于我们", company: "公司简介", contact: "联系我们", careers: "加入我们" },
    help: { title: "帮助中心", faq: "常见问题", guide: "购物指南", afterSales: "售后服务" },
    legal: { title: "隐私与条款", privacy: "隐私政策", terms: "服务条款", cookie: "Cookie 政策" },
    copyright: (year) => `© ${year} 灯市. 保留所有权利.`,
    sitemap: "网站地图",
    icp: "备案信息",
  },
};

const en: HomeCopy = {
  htmlLang: "en",
  title: "Lantern Market - Online Mall for Electronics, Fashion & Home",
  description:
    "Lantern Market is an online shopping mall with categories for electronics, home appliances, fashion, beauty, food, home goods, sports and books, plus built-in product search.",
  keywords: [
    "Lantern Market",
    "online shopping",
    "online mall",
    "electronics",
    "home appliances",
    "fashion",
    "beauty",
    "food",
    "home goods",
    "sports",
    "books",
  ],
  brand: "Lantern Market",
  nav: {
    searchPlaceholder: "Search products...",
    searchLabel: "Search products",
    searchEmpty: "No products found",
    searchError: "Search is unavailable right now, please try again later",
    cart: "Cart",
    signIn: "Sign in",
    account: "Account",
    language: "中文",
    languageHref: "/",
  },
  home: {
    slogan: "The lantern market is open.",
    sloganSub:
      "Every good find is a lit lantern — electronics, fashion, food and more, browse until the street glows.",
    enterMarket: "Enter the market",
    heroToday: "Lantern of the day",
    viewLamp: "See this lantern",
    categoriesTitle: "Market lanes",
    gridTitle: "Lit today",
    demoBadge: "Demo products",
    demoNote:
      "Products and merchants above are illustrative demos; they will be replaced by the live catalog once ListProduct is wired up.",
    priceFrom: "and up",
  },
  footer: {
    tagline:
      "Every good find is a lit lantern. Lantern Market lights the whole street of electronics, fashion and daily goods for you.",
    about: { title: "About", company: "Company", contact: "Contact", careers: "Careers" },
    help: { title: "Help", faq: "FAQ", guide: "Shopping guide", afterSales: "After-sales" },
    legal: {
      title: "Privacy & terms",
      privacy: "Privacy policy",
      terms: "Terms",
      cookie: "Cookie policy",
    },
    copyright: (year) => `© ${year} Lantern Market. All rights reserved.`,
    sitemap: "Sitemap",
    icp: "ICP filing",
  },
};

export const homeCopy: Record<Language, HomeCopy> = { zh, en };
