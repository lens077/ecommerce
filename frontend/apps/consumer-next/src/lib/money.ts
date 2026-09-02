/**
 * google.type.Money 的唯一格式化入口。
 *
 * 页面展示与 schema.org JSON-LD 都从这里取值——两处各自格式化一次是
 * docs/frontend/semantic-html.md §四.3 明确禁止的漂移源：搜索结果里的价格
 * 与页面显示不一致，比没有结构化数据更糟（Google 会按「误导性标记」降权）。
 */
export interface Money {
  currencyCode: string;
  units: bigint;
  nanos: number;
}

/** 小数部分：nanos 补到 9 位再去掉尾随 0，得到最短精确表示。 */
function fractionOf(money: Money): string {
  return Math.abs(money.nanos).toString().padStart(9, "0").replace(/0+$/, "");
}

/**
 * 纯数值字符串，形如 "199" / "19.99"。这是 schema.org `offers.price` 要的形态
 * （规范要求数字或数字串，不带货币符号；货币走 `priceCurrency`）。
 */
export function moneyToDecimalString(money: Money): string {
  const fraction = fractionOf(money);
  return `${money.units.toString()}${fraction ? `.${fraction}` : ""}`;
}

/** 页面展示形态，形如 "CNY 19.99"；缺失时显示破折号。 */
export function formatMoney(money: Money | undefined): string {
  if (!money) {
    return "—";
  }
  return `${money.currencyCode} ${moneyToDecimalString(money)}`;
}
