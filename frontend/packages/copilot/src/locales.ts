/**
 * 助手自己的文案，namespace = "copilot"。写成 TS 而不是 JSON：包没有自己的 tsconfig，
 * 不想依赖 resolveJsonModule。Provider 挂载时注册进 i18next（initI18n 已在 app 入口跑完）。
 */
import { i18next } from "@ecommerce/i18n";

export const COPILOT_NS = "copilot";

const zhCN = {
  title: "智能助手",
  open: "打开智能助手",
  close: "关闭智能助手",
  uiMode: "界面模式",
  placeholder: "想让我做什么？",
  send: "发送",
  stop: "停止",
  continue: "继续",
  cancel: "取消",
  hint: "你可以这样问：",
  unmatched: "我还不会这个。你可以这样问：",
  uiModeOff: "界面模式已关闭，我不会操作页面。打开后我会这样做：",
  done: "完成。",
  interrupted: "已停止。",
  failed: "在第 {{index}} 步停下了：{{text}}",
  stepProgress: "第 {{index}}/{{total}} 步",
  step: {
    navigate: "跳转到 {{path}}",
    waitFor: "等待页面就绪",
    moveCursor: "移动到目标",
    highlight: "{{text}}",
    type: "输入「{{value}}」",
    press: "按下 {{key}}",
    click: "点击",
    select: "选择选项",
    say: "说明",
    confirm: "等待确认",
  },
};

const en: typeof zhCN = {
  title: "Assistant",
  open: "Open assistant",
  close: "Close assistant",
  uiMode: "UI mode",
  placeholder: "What should I do?",
  send: "Send",
  stop: "Stop",
  continue: "Continue",
  cancel: "Cancel",
  hint: "Try asking:",
  unmatched: "I can't do that yet. Try asking:",
  uiModeOff: "UI mode is off, so I won't touch the page. With it on I would:",
  done: "Done.",
  interrupted: "Stopped.",
  failed: "Stopped at step {{index}}: {{text}}",
  stepProgress: "Step {{index}}/{{total}}",
  step: {
    navigate: "Go to {{path}}",
    waitFor: "Waiting for the page",
    moveCursor: "Moving to the target",
    highlight: "{{text}}",
    type: "Type “{{value}}”",
    press: "Press {{key}}",
    click: "Click",
    select: "Pick an option",
    say: "Note",
    confirm: "Waiting for confirmation",
  },
};

export const COPILOT_RESOURCES = { "zh-CN": zhCN, en } as const;

/** 幂等：多个 Provider（或热更新）重复调用不会重复注册 */
export function ensureCopilotBundle(): void {
  if (!i18next.isInitialized) return;
  for (const [lng, res] of Object.entries(COPILOT_RESOURCES)) {
    if (!i18next.hasResourceBundle(lng, COPILOT_NS)) {
      i18next.addResourceBundle(lng, COPILOT_NS, res, true, true);
    }
  }
}
