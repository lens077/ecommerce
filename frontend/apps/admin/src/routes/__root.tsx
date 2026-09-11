/**
 * 根路由组件。页面各自套 AdminLayout；这里只挂跨页面的智能助手。
 */

import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { CopilotProvider } from "@ecommerce/copilot";
import { CopilotActions } from "@/copilot/CopilotActions";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const navigate = useNavigate();
  return (
    <CopilotProvider copilotRole="admin" navigate={(to) => navigate({ to })}>
      <CopilotActions />
      <Outlet />
    </CopilotProvider>
  );
}
