import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    SERVER_URL: z.string().url().optional(),
  },

  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: "VITE_",

  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
    // 允许两种形态：绝对 URL（prod 直连网关域名），或以 "/" 开头的同源前缀
    // （dev 经 vite proxy 走同源，见 vite.config.ts；BFF 会话 cookie 是
    // SameSite=Lax，跨站不会被带上，所以 dev 必须同源）。
    VITE_GATEWAY_URL: z
      .union([z.url(), z.string().regex(/^\/[^/]/, "同源前缀须以单个 / 开头，如 /api")])
      .optional(),
    // BFF 端点基地址；留空即与前端同源。
    VITE_BFF_BASE_URL: z
      .union([z.url(), z.string().regex(/^\/[^/]/, "同源前缀须以单个 / 开头")])
      .optional(),
    // Umami 网站分析。两个都给齐才注入 tracker，缺任一即完全不加载（见 analytics.ts）。
    // websiteId 是 umami 面板建站点后生成的 UUID；script URL 形如
    // https://umami.apikv.com/s.js（文件名由组件的 TRACKER_SCRIPT_NAME 决定，不是 script.js）。
    VITE_UMAMI_SCRIPT_URL: z.url().optional(),
    VITE_UMAMI_WEBSITE_ID: z.uuid().optional(),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: import.meta.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});
