/**
 * consumer 注册给智能助手的动作（设计 docs/design/copilot/copilot.md §5.1）。
 * 锚点标在 components/AppBar.tsx：appbar.search-input / appbar.search-results /
 * appbar.search-result-item / appbar.search-result-name。
 */
import { i18next, type TOptions } from "@ecommerce/i18n";
import type { CopilotAction } from "@ecommerce/copilot";

// i18next 27 起 t() 的 key 受 CustomTypeOptions 严格字面量约束，模板拼接的
// `consumer:copilot.${key}` 过不了校验。用 getFixedT 绑定命名空间后只需写相对键，
// 键类型收窄为本 app copilot 段实际存在的项（资源增删即类型报错）。
type CopilotI18nKey =
  | "examples.search1"
  | "examples.search2"
  | "examples.search3"
  | "typeKeyword"
  | "resultsHighlight"
  | "found"
  | "foundMore"
  | "none";

const copilotT = i18next.getFixedT(null, "consumer", "copilot");
// opts 只承载插值（count/keyword/names 等）；用插值字典形态，避免与
// i18next 27 严格重载里的 context 约束冲突。
type CopilotReplacements = Record<string, string | number | undefined>;

const t = (key: CopilotI18nKey, opts?: CopilotReplacements) =>
  copilotT(key, opts as TOptions) as string;

export const searchProductsAction: CopilotAction = {
  name: "search_products",
  roles: ["customer"],
  patterns: [
    // 「帮我查保温杯」「搜一下保温杯商品」「找保温杯」「查找 iphone 15 这个商品」
    /^(?:帮我|请|麻烦)?(?:查找|搜索|查|搜|找)(?:一下|下)?(?:商品)?(?<keyword>.+?)(?:这个商品|的商品|商品)?$/,
  ],
  get examples() {
    return [t("examples.search1"), t("examples.search2"), t("examples.search3")];
  },
  plan: ({ keyword }) => [
    { kind: "moveCursor", anchor: "appbar.search-input" },
    { kind: "highlight", anchor: "appbar.search-input", text: t("typeKeyword", { keyword }) },
    { kind: "type", anchor: "appbar.search-input", value: keyword },
    { kind: "press", anchor: "appbar.search-input", key: "Enter" },
    { kind: "waitFor", anchor: "appbar.search-results" },
    { kind: "highlight", anchor: "appbar.search-results", text: t("resultsHighlight") },
  ],
  summarize: ({ keyword }, ctx) => {
    const count = ctx.count("appbar.search-result-item");
    if (count === 0) return t("none", { keyword });
    const names = ctx.texts("appbar.search-result-name");
    const shown = names.slice(0, 5).join("、");
    return count > 5
      ? t("foundMore", { count, names: shown })
      : t("found", { count, names: shown });
  },
};
