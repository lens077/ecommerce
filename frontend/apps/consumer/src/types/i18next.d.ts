/**
 * 给 t() 的 key 补类型安全。
 *
 * 用中文那份 JSON 推导 key 结构 —— 中文是源语言，英文那份可能暂时缺 key，
 * 拿英文推导会让「已经写好中文、还没翻英文」的 key 变成类型错误。
 */

import type common from "@ecommerce/i18n/src/locales/zh-CN/common.json";
import type errors from "@ecommerce/i18n/src/locales/zh-CN/errors.json";
import type consumer from "../locales/zh-CN/consumer.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "consumer";
    resources: {
      consumer: typeof consumer;
      common: typeof common;
      errors: typeof errors;
    };
  }
}
