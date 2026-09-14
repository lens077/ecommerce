/** 管理后台布局：桌面固定侧栏，窄屏使用同一份导航内容。 */
import { useState } from "react";
import { Box, Drawer, IconButton } from "@mui/material";
import { X } from "@ecommerce/icons";
import { useTranslation } from "@ecommerce/i18n";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminHeader } from "@/components/AdminHeader";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useTranslation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const closeNavigation = () => setNavigationOpen(false);
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", minWidth: 0 }}>
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <AdminSidebar />
      </Box>
      <Drawer
        open={navigationOpen}
        onClose={closeNavigation}
        sx={{ display: { xs: "block", md: "none" } }}
        slotProps={{ paper: { sx: { width: 240 } } }}
      >
        <IconButton
          aria-label={t("sidebar.close")}
          onClick={closeNavigation}
          sx={{ position: "absolute", right: 4, top: 20, zIndex: 1 }}
        >
          <X size={18} />
        </IconButton>
        <AdminSidebar onNavigate={closeNavigation} />
      </Drawer>
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          ml: { xs: 0, md: "240px" },
          display: "flex",
          flexDirection: "column",
        }}
      >
        <AdminHeader
          onOpenNavigation={() => setNavigationOpen(true)}
          navigationOpen={navigationOpen}
        />
        <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
