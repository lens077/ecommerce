/**
 * 与 locale 相关的格式化。全部走 `Intl`，不引第三方日期库。
 *
 * 注意「格式本地化」和「币种转换」是两件事：商品定价是人民币，切到英文界面
 * 只应改变数字/符号的排版（`¥1,299.00` → `CN¥1,299.00`），**不能**换成 `$`，
 * 那是事实错误。所以 currency 默认恒为 CNY。
 */

import type { Locale } from "./detect";

export const DEFAULT_CURRENCY = "CNY";

/** Intl 实例构造有开销，按 (locale, options) 缓存 */
const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
    const key = locale + "|" + JSON.stringify(options);
    let fmt = numberFormatCache.get(key);
    if (!fmt) {
        fmt = new Intl.NumberFormat(locale, options);
        numberFormatCache.set(key, fmt);
    }
    return fmt;
}

function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = locale + "|" + JSON.stringify(options);
    let fmt = dateFormatCache.get(key);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat(locale, options);
        dateFormatCache.set(key, fmt);
    }
    return fmt;
}

/**
 * 金额格式化。
 * zh-CN → `¥1,299.00`；en → `CN¥1,299.00`。
 */
export function formatCurrencyIn(
    locale: Locale,
    amount: number,
    currency: string = DEFAULT_CURRENCY,
): string {
    if (!Number.isFinite(amount)) return "";
    return numberFormat(locale, { style: "currency", currency }).format(amount);
}

/** 纯数字的千分位格式化，不带货币符号。 */
export function formatNumberIn(
    locale: Locale,
    value: number,
    options?: Intl.NumberFormatOptions,
): string {
    if (!Number.isFinite(value)) return "";
    return numberFormat(locale, options ?? {}).format(value);
}

export type DateStyle = "date" | "datetime" | "time";

const DATE_STYLE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
    date: { year: "numeric", month: "2-digit", day: "2-digit" },
    datetime: {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    },
    time: { hour: "2-digit", minute: "2-digit" },
};

/** 日期格式化。入参接受 Date / 时间戳 / ISO 字符串。 */
export function formatDateIn(
    locale: Locale,
    value: Date | number | string | null | undefined,
    style: DateStyle = "datetime",
): string {
    if (value === null || value === undefined || value === "") return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return dateFormat(locale, DATE_STYLE_OPTIONS[style]).format(date);
}
