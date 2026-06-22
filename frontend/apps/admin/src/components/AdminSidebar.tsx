/**
 * 管理后台侧边栏
 */

import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
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
import { tokens } from "@/styles/tokens";

const menuItems = [
  { label: "数据看板", icon: LayoutDashboard, path: "/" },
  { label: "商家管理", icon: Store, path: "/merchants" },
  { label: "订单管理", icon: ShoppingBag, path: "/orders" },
  { label: "商品审核", icon: Package, path: "/products" },
  { label: "用户管理", icon: Users, path: "/users" },
  { label: "类目管理", icon: Tag, path: "/categories" },
  { label: "运营报表", icon: BarChart3, path: "/reports" },
  { label: "系统设置", icon: Settings, path: "/settings" },
];

export function AdminSidebar() {
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
          电商管理后台
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
                  primary={item.label}
                  primaryTypographyProps={{
                    variant: "body2",
                    fontWeight: active ? 600 : 400,
                    color: active ? tokens.colors.text.primary : tokens.colors.text.secondary,
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
          平台版本 v1.0.0
        </Typography>
      </Box>
    </Box>
  );
}
