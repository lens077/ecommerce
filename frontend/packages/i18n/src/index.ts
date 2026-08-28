/**
 * 前端国际化的统一入口。
 *
 * 选型是 react-i18next：`apps/*` 的构建链是 vite-plus（rolldown + oxc），没有 Babel
 * 也没有 SWC，Lingui 这类需要 macro 转换的方案接不进来。react-i18next 是纯运行时库，
 * 零构建链侵入。
 *
 * 用法（在 app 入口，渲染任何组件之前调用一次）：
 *
 * ```ts
 * await initI18n({ ns: "consumer", resources: { "zh-CN": zhConsumer, en: enConsumer } });
 * await import("./bootstrap");
 * ```
 *
 * 因为初始化在渲染之前完成，组件侧**不需要** Suspense，也不会有文案闪烁。
 */

import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import commonEn from "./locales/en/common.json";
import errorsEn from "./locales/en/errors.json";
import commonZh from "./locales/zh-CN/common.json";
import errorsZh from "./locales/zh-CN/errors.json";
import {
  DEFAULT_LOCALE,
  detectLocale,
  getLocaleStorage,
  normalizeLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from "./detect";
import {
  formatCurrencyCentsIn,
  formatCurrencyIn,
  formatDateIn,
  formatNumberIn,
  type DateStyle,
} from "./format";

export {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  normalizeLocale,
  setLocaleStorage,
  type Locale,
  type LocaleStorage,
} from "./detect";
export { DEFAULT_CURRENCY, formatCurrencyCentsIn, type DateStyle } from "./format";
export { Trans, useTranslation } from "react-i18next";
export { i18next };

/** 每个 app 都会拿到的共享 namespace */
export const SHARED_NAMESPACES = ["common", "errors"] as const;

const SHARED_RESOURCES: Record<Locale, Record<string, unknown>> = {
  "zh-CN": { common: commonZh, errors: errorsZh },
  en: { common: commonEn, errors: errorsEn },
};

export interface InitI18nOptions {
  /** app 自己的 namespace 名，同时作为 defaultNS，例如 "consumer" */
  ns: string;
  /** app 自己的文案，key 是 locale */
  resources: Partial<Record<Locale, Record<string, unknown>>>;
  /** 覆盖探测结果，一般只在测试里用 */
  locale?: Locale;
  /**
   * 标签页标题对应的 key，例如 `"meta.title"`（相对 app 自己的 namespace）。
   *
   * index.html 里的 `<title>` 是构建期写死的，切语言不会变。传了这个就在
   * 初始化和每次切换时改写 document.title，静态标题只当首屏加载时的占位。
   */
  titleKey?: string;
}

/** applyLocale 要用，但它不在 initI18n 的闭包里，只能存一份 */
let documentTitleKey: string | undefined;

/**
 * 初始化 i18next。幂等 —— HMR 下重复调用只会补资源，不会重建实例。
 */
export async function initI18n(options: InitI18nOptions): Promise<Locale> {
  const locale = options.locale ?? (await detectLocale());

  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...SUPPORTED_LOCALES],
      ns: [...SHARED_NAMESPACES, options.ns],
      defaultNS: options.ns,
      fallbackNS: "common",
      resources: {},
      interpolation: {
        // React 自己会转义，i18next 再转一次会把中文引号之类的东西变成实体
        escapeValue: false,
      },
      // 缺 key 时开发期直接在控制台喊，别等上线才发现
      saveMissing: import.meta.env.DEV,
      missingKeyHandler: import.meta.env.DEV
        ? (lngs, ns, key) => {
            console.warn(`[i18n] 缺少翻译: ${lngs.join(",")} / ${ns}:${key}`);
          }
        : undefined,
    });
  }

  for (const lng of SUPPORTED_LOCALES) {
    for (const [namespace, bundle] of Object.entries(SHARED_RESOURCES[lng])) {
      i18next.addResourceBundle(lng, namespace, bundle, true, true);
    }
    const appBundle = options.resources[lng];
    if (appBundle) {
      i18next.addResourceBundle(lng, options.ns, appBundle, true, true);
    }
  }

  documentTitleKey = options.titleKey;
  applyLocale(locale);
  return locale;
}

/**
 * 同步 `<html lang>` 和标签页标题。
 *
 * `<html lang>` 影响浏览器的翻译提示、拼写检查和屏幕阅读器发音；
 * 标题只在 app 传了 titleKey 时才改，没传就保留 index.html 里的静态值。
 */
function applyLocale(locale: Locale): void {
  if (typeof document === "undefined") return;

  document.documentElement.lang = locale;
  if (documentTitleKey) {
    document.title = i18next.t(documentTitleKey);
  }
}

export function getLocale(): Locale {
  return normalizeLocale(i18next.resolvedLanguage ?? i18next.language) ?? DEFAULT_LOCALE;
}

/** 切换语言。会持久化并同步 `<html lang>`，订阅了 useTranslation 的组件自动重渲染。 */
export async function setLocale(locale: Locale): Promise<void> {
  if (getLocale() === locale) return;
  await i18next.changeLanguage(locale);
  await getLocaleStorage().write(locale);
  applyLocale(locale);
}

/** 当前 locale + 切换函数。语言变化时会触发重渲染。 */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => Promise<void> } {
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE;
  return { locale, setLocale };
}

/** 绑定了当前 locale 的格式化函数。语言变化时会触发重渲染。 */
export function useFormat(): {
  formatCurrency: (amount: number, currency?: string) => string;
  formatCurrencyCents: (cents: bigint, currency?: string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number | string | null | undefined, style?: DateStyle) => string;
} {
  const { locale } = useLocale();
  return {
    formatCurrency: (amount, currency) => formatCurrencyIn(locale, amount, currency),
    formatCurrencyCents: (cents, currency) => formatCurrencyCentsIn(locale, cents, currency),
    formatNumber: (value, options) => formatNumberIn(locale, value, options),
    formatDate: (value, style) => formatDateIn(locale, value, style),
  };
}

/** 非组件环境下的格式化（事件回调、store 里），读当前 locale。 */
export function formatCurrency(amount: number, currency?: string): string {
  return formatCurrencyIn(getLocale(), amount, currency);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return formatNumberIn(getLocale(), value, options);
}

export function formatDate(
  value: Date | number | string | null | undefined,
  style?: DateStyle,
): string {
  return formatDateIn(getLocale(), value, style);
}

/**
 * 给 `@ecommerce/api` 用的错误文案解析器，在 app 入口通过
 * `setErrorMessageResolver(createErrorMessageResolver())` 注入。
 *
 * 优先级刻意做成不对称的：
 * - 中文下维持现状 —— 网关返回的 message 更具体（可能带字段名），优先用它。
 * - 非中文下 `errors:reason.*` 的翻译优先，否则界面上会漏出中文。
 *
 * 放在这里而不是让 `@ecommerce/api` 直接依赖 i18next，是为了不把 i18n 强加给
 * 所有 api 使用者（admin 就没接 @ecommerce/api）。
 */
export function createErrorMessageResolver() {
  return (ctx: {
    reason: string;
    codeName: string;
    serverMessage: string;
    isNetworkFailure: boolean;
  }): string | undefined => {
    const locale = getLocale();

    if (ctx.isNetworkFailure) {
      return i18next.t("errors:network");
    }

    const preferTranslation = locale !== DEFAULT_LOCALE;
    if (!preferTranslation && ctx.serverMessage !== "") {
      return undefined; // 交回给 @ecommerce/api 的原有逻辑
    }

    for (const key of [`errors:reason.${ctx.reason}`, `errors:code.${ctx.codeName}`]) {
      if (i18next.exists(key)) return i18next.t(key);
    }
    // 翻译没命中：宁可显示服务端的中文，也别显示一个笼统的兜底
    if (ctx.serverMessage !== "") return ctx.serverMessage;
    return i18next.t("errors:fallback");
  };
}
