/**
 * 根路由组件
 */

import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Box } from "@mui/material";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return <Outlet />;
}
