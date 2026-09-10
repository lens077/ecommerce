import { useCopilotAction } from "@ecommerce/copilot";
import { openMonitorAction } from "./actions";

/** 挂在 CopilotProvider 里面，把 admin 的动作注册进去；无 UI */
export function CopilotActions() {
  useCopilotAction(openMonitorAction);
  return null;
}
