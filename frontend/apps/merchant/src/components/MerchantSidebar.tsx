/**
 * 商家端侧边栏
 *
 * 修复样式问题
 */

import { Box, Typography } from "@mui/material";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Package, FileText, Store, LogOut } from "lucide-react";
import { useTranslation } from "@ecommerce/i18n";

/** 侧边栏菜单。文案 key 显式写死，不用路径拼 key。 */
const menuItems = [
  { labelKey: "sidebar.nav.dashboard", icon: LayoutDashboard, path: "/" },
  { labelKey: "sidebar.nav.orders", icon: FileText, path: "/orders" },
  { labelKey: "sidebar.nav.products", icon: Package, path: "/products" },
  { labelKey: "sidebar.nav.settings", icon: Store, path: "/settings" },
] as const;

export function MerchantSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Logo 区域 */}
      <Box
        sx={{
          p: 3,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Store size={20} color="white" />
          </Box>
          <Typography variant="h6" component="p" sx={{ fontWeight: 700, color: "text.primary" }}>
            {t("sidebar.brand")}
          </Typography>
        </Box>
      </Box>

      {/* 菜单区域 */}
      <Box sx={{ flex: 1, p: 1.5 }}>
        <Box component="nav" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Box
                key={item.path}
                component="button"
                onClick={() => navigate({ to: item.path })}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1.25,
                  border: "none",
                  borderRadius: 1,
                  bgcolor: isActive ? "primary.main" : "transparent",
                  color: isActive ? "primary.contrastText" : "text.secondary",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    bgcolor: isActive ? "primary.main" : "action.hover",
                  },
                }}
              >
                <item.icon size={18} />
                <Typography variant="body2" sx={{ fontWeight: isActive ? 500 : 400 }}>
                  {t(item.labelKey)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* 底部退出 */}
      <Box sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
        <Box
          component="button"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 1.5,
            py: 1.25,
            border: "none",
            borderRadius: 1,
            bgcolor: "transparent",
            color: "text.secondary",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            transition: "all 0.15s ease",
            "&:hover": {
              bgcolor: "action.hover",
              color: "error.main",
            },
          }}
        >
          <LogOut size={18} />
          <Typography variant="body2">{t("common:action.signOut")}</Typography>
        </Box>
      </Box>
    </Box>
  );
}
