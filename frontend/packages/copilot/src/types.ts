/**
 * 页内智能助手的契约类型。设计见 docs/design/copilot/copilot.md §4.2 / §4.4。
 *
 * 执行器只认 `data-copilot="<anchor>"` 锚点：Step 里没有任何选择器字段，
 * 类型上就不给「用 CSS 选择器操作任意节点」留口子。
 */

export type CopilotRole = "customer" | "merchant" | "admin";

/** 正则命名捕获组 → 动作参数 */
export type CopilotParams = Record<string, string>;

export type Step =
  /** 调 Router navigate，等待路由稳定 */
  | { kind: "navigate"; path: string }
  /** 等锚点出现并进入视口 */
  | { kind: "waitFor"; anchor: string }
  /** 大指针沿贝塞尔路径移到锚点中心 */
  | { kind: "moveCursor"; anchor: string }
  /** 蒙层挖洞聚焦锚点，元素外沿渐变描边，旁边显示步骤文字 */
  | { kind: "highlight"; anchor: string; text: string }
  /** 逐字写入受控输入框（原型 setter + input 事件） */
  | { kind: "type"; anchor: string; value: string }
  /** 在锚点上派发键盘事件（例如 Enter 触发搜索） */
  | { kind: "press"; anchor: string; key: string }
  /** 指针按下动画后派发真实 click */
  | { kind: "click"; anchor: string }
  /** MUI Select：mousedown 打开菜单，再点 optionAnchor 对应的选项 */
  | { kind: "select"; anchor: string; optionAnchor: string }
  /** 面板追加一条助手文本 */
  | { kind: "say"; text: string }
  /** 面板弹出确认，用户点「继续」才往下走 */
  | { kind: "confirm"; text: string };

/** 动作在 plan / summarize 时能拿到的页面读取能力，只读不写 */
export interface ActionContext {
  role: CopilotRole;
  /** 当前路由路径 */
  pathname: string;
  /** 取锚点元素（不存在返回 null） */
  find(anchor: string): HTMLElement | null;
  /** 同名锚点元素的数量，例如列表行数 */
  count(anchor: string): number;
  /** 同名锚点元素的可见文本列表 */
  texts(anchor: string): string[];
}

export interface CopilotAction<P extends CopilotParams = CopilotParams> {
  /** ^[a-z][a-z0-9_]{2,40}$，app 内唯一 */
  name: string;
  roles: CopilotRole[];
  /** 命中即触发；命名捕获组即参数 */
  patterns: RegExp[];
  /** 面板「你可以这样问」展示，也是单测的必命中样例 */
  examples: string[];
  /** true 时执行前插入 confirm 步骤 */
  sensitive?: boolean;
  /** 把参数展开为步骤，纯函数 */
  plan(params: P, ctx: ActionContext): Step[];
  /** 执行完成后给面板的结果文本 */
  summarize?(params: P, ctx: ActionContext): string;
}

export interface IntentMatch {
  action: CopilotAction;
  params: CopilotParams;
}

export interface CopilotMessage {
  id: number;
  from: "user" | "assistant";
  text: string;
  /** 未命中时附带的可点击示例 */
  examples?: string[];
}

export interface CursorState {
  x: number;
  y: number;
  pressed: boolean;
  visible: boolean;
}

export interface OverlayState {
  visible: boolean;
  /** 当前聚焦的锚点，Overlay 自己去量它的矩形并跟随滚动/缩放 */
  anchor: string | null;
  text: string | null;
}

export type CopilotStatus = "idle" | "running" | "awaiting-confirm";

export interface CurrentStep {
  index: number;
  total: number;
  text: string;
}
