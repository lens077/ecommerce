import { useCopilotAction } from "@ecommerce/copilot";
import { filterOrdersAction } from "./actions";

/** 挂在 CopilotProvider 里面，把 merchant 的动作注册进去；无 UI */
export function CopilotActions() {
  useCopilotAction(filterOrdersAction);
  return null;
}
