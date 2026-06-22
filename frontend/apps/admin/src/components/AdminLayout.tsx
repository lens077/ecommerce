/**
 * 管理后台布局
 */

import { Box } from "@mui/material";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminHeader } from "@/components/AdminHeader";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <Box
        component="main"
        sx={{
          flex: 1,
          ml: "240px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <AdminHeader />
        <Box sx={{ flex: 1, p: 4 }}>{children}</Box>
      </Box>
    </Box>
  );
}
