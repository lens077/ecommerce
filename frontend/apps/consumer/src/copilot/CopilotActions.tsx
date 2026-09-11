import { useCopilotAction } from "@ecommerce/copilot";
import { searchProductsAction } from "./actions";

/** 挂在 CopilotProvider 里面，把 consumer 的动作注册进去；无 UI */
export function CopilotActions() {
  useCopilotAction(searchProductsAction);
  return null;
}
