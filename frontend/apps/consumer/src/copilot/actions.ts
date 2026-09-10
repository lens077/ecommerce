/**
 * consumer 注册给智能助手的动作（设计 docs/design/copilot/copilot.md §5.1）。
 * 锚点标在 components/AppBar.tsx：appbar.search-input / appbar.search-results /
 * appbar.search-result-item / appbar.search-result-name。
 */
import { i18next } from "@ecommerce/i18n";
import type { CopilotAction } from "@ecommerce/copilot";

const t = (key: string, opts?: Record<string, unknown>) =>
  i18next.t(`consumer:copilot.${key}`, opts) as string;

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

export const consumerCopilotActions: CopilotAction[] = [searchProductsAction];
