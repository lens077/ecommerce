/**
 * locale 探测与持久化。
 *
 * 优先级：`?lang=` > 本地存储 > `navigator.language` > 默认 zh-CN。
 * `?lang=` 放在最前是为了让深链和 QA 能一次性进到指定语言，且命中后会写回存储。
 *
 * 存储在 web 端是 localStorage；桌面端（Tauri）的偏好落在 plugin-store 的
 * `settings.json` 里，由 `packages/tauri` 在入口处注入 —— 这里只留一个可替换的
 * 存储适配器，不反向依赖 @ecommerce/tauri（那会让本包被 Tauri 依赖污染）。
 */

export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh-CN";

/** 各端共用的存储 key，桌面端 settings.json 里也用这个名字 */
export const LOCALE_STORAGE_KEY = "ecommerce.locale";

/** 可替换的持久化后端。默认走 localStorage，桌面端在入口处换成 plugin-store。 */
export interface LocaleStorage {
  read(): string | null | Promise<string | null>;

  write(locale: Locale): void | Promise<void>;
}

const localStorageBackend: LocaleStorage = {
  read() {
    try {
      return globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
    } catch {
      // Safari 隐私模式 / 沙箱环境下 localStorage 会直接抛
      return null;
    }
  },
  write(locale) {
    try {
      globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // 存不下就算了，不影响本次会话的语言
    }
  },
};

let storage: LocaleStorage = localStorageBackend;

/** 替换持久化后端。必须在 initI18n 之前调用。 */
export function setLocaleStorage(impl: LocaleStorage): void {
  storage = impl;
}

export function getLocaleStorage(): LocaleStorage {
  return storage;
}

/** 把任意字符串收敛到受支持的 locale，无法识别时返回 null。 */
export function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  // 精确命中优先：zh-cn / en
  for (const locale of SUPPORTED_LOCALES) {
    if (lower === locale.toLowerCase()) return locale;
  }
  // 再按主语言子标签匹配：zh / zh-Hans / zh-TW 都归 zh-CN，en-US 归 en
  const primary = lower.split("-")[0];
  for (const locale of SUPPORTED_LOCALES) {
    if (primary === locale.toLowerCase().split("-")[0]) return locale;
  }
  return null;
}

function fromQueryString(): Locale | null {
  if (typeof globalThis.location === "undefined") return null;
  try {
    const params = new URLSearchParams(globalThis.location.search);
    return normalizeLocale(params.get("lang"));
  } catch {
    return null;
  }
}

function fromNavigator(): Locale | null {
  const nav = globalThis.navigator;
  if (!nav) return null;
  for (const lang of nav.languages ?? [nav.language]) {
    const hit = normalizeLocale(lang);
    if (hit) return hit;
  }
  return null;
}

/** 按优先级链解析出本次会话应该用的 locale。`?lang=` 命中时顺手写回存储。 */
export async function detectLocale(): Promise<Locale> {
  const fromQuery = fromQueryString();
  if (fromQuery) {
    await storage.write(fromQuery);
    return fromQuery;
  }
  const stored = normalizeLocale(await storage.read());
  if (stored) return stored;
  return fromNavigator() ?? DEFAULT_LOCALE;
}
