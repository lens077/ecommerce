/**
 * admin 注册给智能助手的动作（设计 docs/design/copilot/copilot.md §5.3）。
 * 锚点标在 routes/monitor/index.tsx：monitor.health-grid / monitor.health-card。
 */
import { i18next } from "@ecommerce/i18n";
import type { CopilotAction } from "@ecommerce/copilot";

const t = (key: string, opts?: Record<string, unknown>) =>
  i18next.t(`admin:copilot.${key}`, opts) as string;

export const openMonitorAction: CopilotAction = {
  name: "open_monitor",
  roles: ["admin"],
  patterns: [
    // 「帮我查看监控」「打开监控页」「看看服务监控」
    /^(?:帮我|请)?(?:查看|打开|看看|看|进入|去)(?:一下|下)?(?:系统|服务)?监控(?:页|页面|面板)?$/,
    /^(?:show me|open|check|go to)(?: the)?(?: service)? monitoring(?: page)?$/,
  ],
  get examples() {
    return [t("examples.monitor1"), t("examples.monitor2"), t("examples.monitor3")];
  },
  plan: () => [
    { kind: "say", text: t("goto") },
    { kind: "navigate", path: "/monitor" },
    { kind: "waitFor", anchor: "monitor.health-grid" },
    { kind: "moveCursor", anchor: "monitor.health-grid" },
    { kind: "highlight", anchor: "monitor.health-grid", text: t("gridHighlight") },
  ],
  summarize: (_params, ctx) => t("arrived", { count: ctx.count("monitor.health-card") }),
};

export const adminCopilotActions: CopilotAction[] = [openMonitorAction];
