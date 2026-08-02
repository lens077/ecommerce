/**
 * 管理后台侧边栏
 */

import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Store,
  ShoppingBag,
  Package,
  Users,
  Tag,
  Settings,
  BarChart3,
} from "lucide-react";
import { useTranslation } from "@ecommerce/i18n";
import { tokens } from "@/styles/tokens";

// 存 key 而不是译文：菜单是模块级常量，只求值一次，存译文会被第一次渲染时的语言钉死
const menuItems = [
  { labelKey: "sidebar.nav.dashboard", icon: LayoutDashboard, path: "/" },
  { labelKey: "sidebar.nav.merchants", icon: Store, path: "/merchants" },
  { labelKey: "sidebar.nav.orders", icon: ShoppingBag, path: "/orders" },
  { labelKey: "sidebar.nav.products", icon: Package, path: "/products" },
  { labelKey: "sidebar.nav.users", icon: Users, path: "/users" },
  { labelKey: "sidebar.nav.categories", icon: Tag, path: "/categories" },
  { labelKey: "sidebar.nav.reports", icon: BarChart3, path: "/reports" },
  { labelKey: "sidebar.nav.settings", icon: Settings, path: "/settings" },
] as const;

export function AdminSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Box
      sx={{
        width: 240,
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        bgcolor: tokens.colors.background.card,
        borderRight: `1px solid ${tokens.colors.border.default}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          p: 3,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            color: tokens.colors.text.primary,
            letterSpacing: "-0.02em",
          }}
        >
          {t("sidebar.brand")}
        </Typography>
      </Box>

      {/* 菜单 */}
      <List sx={{ flex: 1, py: 2 }}>
        {menuItems.map((item) => {
          const active = isActive(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ px: 1.5, mb: 0.5 }}>
              <ListItemButton
                onClick={() => navigate({ to: item.path })}
                sx={{
                  borderRadius: 1.5,
                  py: 1.25,
                  bgcolor: active ? "rgba(17, 24, 39, 0.05)" : "transparent",
                  "&:hover": {
                    bgcolor: active ? "rgba(17, 24, 39, 0.08)" : "rgba(17, 24, 39, 0.04)",
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <item.icon
                    size={20}
                    color={active ? tokens.colors.text.primary : tokens.colors.text.secondary}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={t(item.labelKey)}
                  slotProps={{
                    primary: {
                      variant: "body2",
                      sx: {
                        fontWeight: active ? 600 : 400,
                        color: active ? tokens.colors.text.primary : tokens.colors.text.secondary,
                      },
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* 底部信息 */}
      <Box
        sx={{
          p: 2,
          borderTop: `1px solid ${tokens.colors.border.default}`,
        }}
      >
        <Typography variant="caption" sx={{ color: tokens.colors.text.disabled }}>
          {t("sidebar.version", { version: "1.0.0" })}
        </Typography>
      </Box>
    </Box>
  );
}
