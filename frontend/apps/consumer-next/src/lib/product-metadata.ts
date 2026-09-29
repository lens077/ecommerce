/**
 * 商品详情页的 TDK（title / description / keywords），以及查不到商品时的 robots。
 *
 * 取词只用页面上真实展示的信息：商品名、规格名、价格。proto 没有类目、品牌和商品描述，
 * 这里不编造，与 product-jsonld.ts 同一条「宁缺毋滥」。约定全文见
 * docs/frontend/semantic-html.md「TDK」一节。
 *
 * - 标题：「商品名价格与规格」，layout 模板再补「 - 灯市」。百度《网页标题规范》的内容页格式是
 *   「内容标题 - 列表/频道名(可省) - 站点名」：proto 没有类目，频道名省略；内容标题写成「主体 + 方面」，
 *   与规范里的示例「红烧肉的做法 - 菜谱 - 香哈网」同一写法。「价格」是商品页最常见的搜索意图词；
 *   没有任何 SKU 带价格时页面不展示价格，标题只留商品名。商品名按显示宽度截断：商家填的长标题
 *   常是堆词，整段放进 <title> 容易被百度按标题堆砌处理。
 * - 描述：商品名 + 规格数与前几个规格名 + 价格。价格只经 lib/money.ts 的 formatMoney 格式化，
 *   与页面展示同源；不写库存：stockLocked 是锁定库存，不是可售库存。
 * - keywords：商品名，页面展示价格时再加「商品名 + 价格」；商品名超长时不输出。它对主流搜索引擎
 *   排序几乎没有作用，按行业习惯填，不堆砌。
 */
import type { Metadata } from "next";
import type { ProductSpuDetail } from "@/gen/api/product/v1/product_pb";
import type { Language } from "@/home/copy";
import { formatMoney, moneyToDecimalString, type Money } from "./money";

/** 标题里商品名的显示宽度上限（汉字记 2）：约 30 个汉字，搜索结果页一行标题的量级 */
const TITLE_NAME_MAX_WIDTH = 60;
/** 描述里商品名的显示宽度上限 */
const DESCRIPTION_NAME_MAX_WIDTH = 100;
/** 单个规格名的显示宽度上限 */
const SKU_NAME_MAX_WIDTH = 24;
/** 描述里最多列出几个规格名 */
const LISTED_SKU_COUNT = 3;

const COPY = {
  zh: {
    titleAspect: "价格与规格",
    // 与页面故障态的 <h1> 一致
    unavailable: "商品暂不可用",
    // 故障分支必须给自己的描述：不给就会继承 layout 的首页描述，让一个错误页在摘要里自称综合商城
    notFoundDescription: "未找到该商品。",
    unavailableDescription: "商品信息暂时无法加载，请稍后再试。",
    priceKeyword: "价格",
  },
  en: {
    titleAspect: "Price & Options",
    unavailable: "Product unavailable",
    notFoundDescription: "This product could not be found.",
    unavailableDescription:
      "Product details could not be loaded right now. Please try again later.",
    priceKeyword: "price",
  },
} satisfies Record<Language, Record<string, string>>;

export type ProductMetadataInput =
  | { lang: Language; status: "success"; product: ProductSpuDetail }
  /**
   * 这个 URL 对应不到商品：product 服务返回 not_found，或 spuCode 本身不合法（invalid_argument，
   * 例如超过 proto 的 max_len）。页面不该被收录。
   */
  | { lang: Language; status: "not-found" }
  /**
   * 网关或服务故障：商品可能只是暂时取不到。这里不能打 noindex——ISR 会把故障页缓存下来，
   * 爬虫恰好在这时抓取，正常商品就会被移出索引。
   */
  | { lang: Language; status: "unavailable" };

export function buildProductMetadata(
  input: ProductMetadataInput,
): Pick<Metadata, "title" | "description" | "keywords" | "robots"> {
  const copy = COPY[input.lang];

  if (input.status === "not-found") {
    return {
      title: copy.unavailable,
      description: copy.notFoundDescription,
      robots: { index: false, follow: true },
    };
  }
  if (input.status === "unavailable") {
    return { title: copy.unavailable, description: copy.unavailableDescription };
  }

  const { lang, product } = input;
  const name = productName(product);
  const titleName = clipByWidth(name, TITLE_NAME_MAX_WIDTH);
  // 页面只展示带价格的 SKU 价格；一个都没有时，标题和关键词都不提价格
  const showsPrice = product.skus.some((sku) => !!sku.price);
  return {
    title: showsPrice ? withAspect(lang, titleName, copy.titleAspect) : titleName,
    description: describeProduct(lang, product),
    // 商品名超长（多是商家堆词）时不输出 keywords：截断会切出半个词，再拼「价格」只会造出不存在的词
    keywords:
      displayWidth(name) <= TITLE_NAME_MAX_WIDTH
        ? showsPrice
          ? [name, withAspect(lang, name, copy.priceKeyword)]
          : [name]
        : undefined,
  };
}

/** 「主体 + 方面」：中文按排版约定直接相连（中英文之间补空格），英文用空格隔开 */
function withAspect(lang: Language, subject: string, aspect: string): string {
  return lang === "zh" ? joinZh(subject, aspect) : `${subject} ${aspect}`;
}

/**
 * 商品名为空白时退回商品编码。proto 的 min_len 挡不住纯空格，而页面的 `<p className="code">`
 * 同样展示编码，用它不算编造。
 */
function productName(product: ProductSpuDetail): string {
  return product.spuName.trim() || product.spuCode.trim();
}

function describeProduct(lang: Language, product: ProductSpuDetail): string {
  const name = clipByWidth(productName(product), DESCRIPTION_NAME_MAX_WIDTH);
  const skuNames = [
    ...new Set(
      product.skus
        .map((sku) => clipByWidth(sku.skuName.trim(), SKU_NAME_MAX_WIDTH))
        .filter((skuName) => skuName.length > 0),
    ),
  ];
  const listed = skuNames.slice(0, LISTED_SKU_COUNT);
  const count = product.skus.length;
  // 列出的规格名没覆盖全部 SKU（超出条数、名字为空或重名）时，列表只是举例
  const partial = count > listed.length;
  const range = priceRange(product);

  if (lang === "zh") {
    const list = listed.length > 0 ? `：${joinZh(listed.join("、"), partial ? "等" : "")}` : "";
    const specs =
      count > 1
        ? `，共 ${count} 款规格可选${list}`
        : listed.length > 0
          ? `，规格：${listed[0]}`
          : "";
    const price = range ? `，价格 ${formatMoney(range.min)}${range.isSingle ? "" : " 起"}` : "";
    return `${name}${specs}${price}。`;
  }

  const list =
    listed.length > 0
      ? partial
        ? ` including ${listed.join(", ")}`
        : ` (${listed.join(", ")})`
      : "";
  const specs = count > 1 ? `: ${count} options${list}` : listed.length > 0 ? `: ${listed[0]}` : "";
  const price = range ? `, priced ${range.isSingle ? "at" : "from"} ${formatMoney(range.min)}` : "";
  return `${name}${specs}${price}.`;
}

/**
 * 最低价与是否全部同价。混币种没有可比较的区间，宁可不写价格（与 JSON-LD 省略
 * priceCurrency 同一处理）；数值比较与 JSON-LD 的 lowPrice 取法一致。
 */
function priceRange(product: ProductSpuDetail): { min: Money; isSingle: boolean } | undefined {
  const prices = product.skus
    .map((sku) => sku.price)
    .filter((price): price is NonNullable<typeof price> => !!price);
  if (prices.length === 0) return undefined;
  if (new Set(prices.map((price) => price.currencyCode)).size !== 1) return undefined;

  const decimals = prices.map((price) => moneyToDecimalString(price));
  const numeric = decimals.map(Number);
  return {
    min: prices[numeric.indexOf(Math.min(...numeric))],
    isSingle: new Set(decimals).size === 1,
  };
}

/**
 * 按字素（用户看到的一个字符）切分：国旗、ZWJ 组合 emoji、带组合符的字母都算一个，
 * 截断时不会被拆成半个区域指示符或悬空的 ZWJ。
 */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * 宽字素：全角与中日韩字符、emoji（含国旗）。搜索结果页按像素截断标题，
 * 这类字素约占两个拉丁字符宽。
 */
const WIDE_GRAPHEME =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]|\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function graphemeWidth(grapheme: string): number {
  return WIDE_GRAPHEME.test(grapheme) ? 2 : 1;
}

function displayWidth(text: string): number {
  let width = 0;
  for (const { segment } of GRAPHEMES.segment(text)) width += graphemeWidth(segment);
  return width;
}

/** 按显示宽度截断，以字素为单位，超出时补省略号 */
function clipByWidth(text: string, maxWidth: number): string {
  if (displayWidth(text) <= maxWidth) return text;
  let width = 0;
  let clipped = "";
  for (const { segment } of GRAPHEMES.segment(text)) {
    width += graphemeWidth(segment);
    if (width > maxWidth) break;
    clipped += segment;
  }
  return `${clipped.trimEnd()}…`;
}

const HAN = /\p{Script=Han}/u;
const ASCII_ALNUM = /[A-Za-z0-9]/;

/** 拼接两段中文文案：汉字与英文、数字相邻时补一个空格（项目中文排版约定），否则直接相连 */
function joinZh(left: string, right: string): string {
  const last = Array.from(left).at(-1);
  const first = Array.from(right).at(0);
  if (!last || !first) return `${left}${right}`;
  const needsSpace =
    (ASCII_ALNUM.test(last) && HAN.test(first)) || (HAN.test(last) && ASCII_ALNUM.test(first));
  return needsSpace ? `${left} ${right}` : `${left}${right}`;
}
