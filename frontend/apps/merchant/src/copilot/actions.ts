/**
 * merchant 注册给智能助手的动作（设计 docs/design/copilot/copilot.md §5.2）。
 * 锚点标在 routes/orders/index.tsx：orders.status-filter / orders.status-option-<value> /
 * orders.table / orders.row。
 *
 * 现状：订单页是 mock 数据，`order.proto` 没有状态字段。接真数据时 STATUS_SYNONYMS
 * 的值要与 order 域的状态机对齐（docs/design/order/checkout.md）。
 */
import { i18next } from "@ecommerce/i18n";
import type { CopilotAction } from "@ecommerce/copilot";

type OrderStatus = "pending" | "shipped" | "completed";

/** 用户说法 → 订单页筛选值 */
const STATUS_SYNONYMS: Record<string, OrderStatus> = {
  没有发货: "pending",
  未发货: "pending",
  待发货: "pending",
  没发的: "pending",
  没发货: "pending",
  还没发货: "pending",
  unshipped: "pending",
  "not yet shipped": "pending",
  "pending shipment": "pending",
  已发货: "shipped",
  shipped: "shipped",
  已完成: "completed",
  completed: "completed",
};

const STATUS_LABEL_KEY: Record<OrderStatus, string> = {
  pending: "common:orderStatus.pending_shipment",
  shipped: "common:orderStatus.shipped",
  completed: "common:orderStatus.completed",
};

const synonymAlternation = Object.keys(STATUS_SYNONYMS)
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const t = (key: string, opts?: Record<string, unknown>) =>
  i18next.t(`merchant:copilot.${key}`, opts) as string;

export const filterOrdersAction: CopilotAction = {
  name: "filter_orders",
  roles: ["merchant"],
  patterns: [
    // 「帮我查看没有发货的订单」「看看未发货订单」「找待发货的订单」
    new RegExp(
      `^(?:帮我|请)?(?:查看|查|看看|看|找|筛选)(?:一下|下)?(?<status>${synonymAlternation})(?:的)?订单$`,
    ),
    // 英文：show me the unshipped orders / find orders pending shipment
    new RegExp(
      `^(?:show me|show|find|look at|list)(?: the)? (?<status>${synonymAlternation}) orders$`,
    ),
    new RegExp(
      `^(?:show me|show|find|look at|list)(?: the)? orders (?<status>${synonymAlternation})$`,
    ),
  ],
  get examples() {
    return [t("examples.unshipped1"), t("examples.unshipped2"), t("examples.unshipped3")];
  },
  plan: ({ status }) => {
    const value = STATUS_SYNONYMS[status] ?? "pending";
    const label = i18next.t(STATUS_LABEL_KEY[value]) as string;
    return [
      { kind: "navigate", path: "/orders" },
      { kind: "waitFor", anchor: "orders.status-filter" },
      { kind: "moveCursor", anchor: "orders.status-filter" },
      { kind: "highlight", anchor: "orders.status-filter", text: t("switchFilter") },
      {
        kind: "select",
        anchor: "orders.status-filter",
        optionAnchor: `orders.status-option-${value}`,
      },
      { kind: "waitFor", anchor: "orders.table" },
      { kind: "highlight", anchor: "orders.table", text: t("tableHighlight", { status: label }) },
    ];
  },
  summarize: ({ status }, ctx) => {
    const value = STATUS_SYNONYMS[status] ?? "pending";
    const label = i18next.t(STATUS_LABEL_KEY[value]) as string;
    return t("count", { count: ctx.count("orders.row"), status: label });
  },
};

export const merchantCopilotActions: CopilotAction[] = [filterOrdersAction];
