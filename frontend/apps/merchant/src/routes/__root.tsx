/**
 * 商家端根路由
 *
 * 修复布局问题
 */

import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Box } from "@mui/material";
import { CopilotProvider } from "@ecommerce/copilot";
import { MerchantSidebar } from "@/components/MerchantSidebar";
import { MerchantHeader } from "@/components/MerchantHeader";
import { CopilotActions } from "@/copilot/CopilotActions";

export const Route = createRootRoute({
  component: RootRouteComponent,
});

function RootRouteComponent() {
  const navigate = useNavigate();
  return (
    <CopilotProvider copilotRole="merchant" navigate={(to) => navigate({ to })}>
      <CopilotActions />
      <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
        {/* 侧边栏 - 固定定位 */}
        <Box
          sx={{
            width: 240,
            flexShrink: 0,
            bgcolor: "background.paper",
            borderRight: "1px solid",
            borderColor: "divider",
            position: "fixed",
            top: 0,
            left: 0,
            height: "100vh",
            overflowY: "auto",
          }}
        >
          <MerchantSidebar />
        </Box>

        {/* 主内容区 - 右侧偏移侧边栏宽度 */}
        <Box
          sx={{
            flex: 1,
            ml: "240px",
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
          }}
        >
          {/* 顶部导航 */}
          <MerchantHeader />

          {/* 页面内容 */}
          <Box
            component="main"
            sx={{
              flex: 1,
              p: 3,
              bgcolor: "background.default",
            }}
          >
            <Outlet />
          </Box>
        </Box>
      </Box>
    </CopilotProvider>
  );
}
