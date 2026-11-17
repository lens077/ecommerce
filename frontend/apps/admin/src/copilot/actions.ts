/**
 * admin 注册给智能助手的动作（设计 docs/design/copilot/copilot.md §5.3）。
 * 锚点标在 routes/monitor/index.tsx：monitor.health-grid / monitor.health-card。
 */
import { i18next, type TOptions } from "@ecommerce/i18n";
import type { CopilotAction } from "@ecommerce/copilot";

// i18next 27 起 t() 的 key 受 CustomTypeOptions 严格字面量约束，模板拼接的
// `admin:copilot.${key}` 过不了校验。用 getFixedT 绑定命名空间后只需写相对键，
// 键类型收窄为本 app copilot 段实际存在的项（资源增删即类型报错）。
type CopilotI18nKey =
  | "examples.monitor1"
  | "examples.monitor2"
  | "examples.monitor3"
  | "goto"
  | "gridHighlight"
  | "arrived";

const copilotT = i18next.getFixedT(null, "admin", "copilot");
// opts 只承载插值（count/keyword/names 等）；用插值字典形态，避免与
// i18next 27 严格重载里的 context 约束冲突。
type CopilotReplacements = Record<string, string | number | undefined>;

const t = (key: CopilotI18nKey, opts?: CopilotReplacements) =>
  copilotT(key, opts as TOptions) as string;

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
