import { LOCALE_STORAGE_KEY, type Locale } from "@ecommerce/i18n";
import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";
const GATEWAY_URL_KEY = "gatewayUrl";

export const DEFAULT_GATEWAY_URL = "http://localhost:8080";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  // autoSave 让写入后不必手动 save()，也避免多处各开一个 Store 句柄
  storePromise ??= load(STORE_FILE, { autoSave: true });
  return storePromise;
}

/**
 * 读取用户配置的网关地址。
 *
 * 桌面端安装包不绑定环境（consumer 的 .env.production 是给 nginx 同源代理用的
 * 相对路径 `/api`，在 tauri://localhost 下必然空转），所以地址放在本地设置里，
 * 由用户在设置面板改。
 */
export async function loadGatewayUrl(): Promise<string> {
  try {
    const store = await getStore();
    const saved = await store.get<string>(GATEWAY_URL_KEY);
    return saved?.trim() || DEFAULT_GATEWAY_URL;
  } catch (err) {
    console.warn("[desktop] 读取本地设置失败，回退到默认网关地址", err);
    return DEFAULT_GATEWAY_URL;
  }
}

export async function saveGatewayUrl(url: string): Promise<void> {
  const store = await getStore();
  await store.set(GATEWAY_URL_KEY, url.trim());
}

/**
 * 读取用户选择的界面语言。
 *
 * 桌面端没有 localStorage 之外更合适的地方，但 webview 的 localStorage 会被
 * 「清除缓存」之类的操作连带清掉，语言偏好和网关地址一样属于装机设置，
 * 放 settings.json 才留得住。key 直接复用 @ecommerce/i18n 的常量，两端不会各写各的。
 *
 * 读不到时返回 null，让 detectLocale 继续往下走系统语言那一档。
 */
export async function loadLocale(): Promise<string | null> {
  try {
    const store = await getStore();
    return (await store.get<string>(LOCALE_STORAGE_KEY)) ?? null;
  } catch (err) {
    console.warn("[desktop] 读取本地语言偏好失败，回退到系统语言", err);
    return null;
  }
}

export async function saveLocale(locale: Locale): Promise<void> {
  try {
    const store = await getStore();
    await store.set(LOCALE_STORAGE_KEY, locale);
  } catch (err) {
    // 存不下不影响本次会话已经切过去的语言，下次启动回到默认而已
    console.warn("[desktop] 保存语言偏好失败", err);
  }
}
