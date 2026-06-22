/**
 * 商家端侧边栏
 * 
 * 修复样式问题
 */

import { Box, Typography } from "@mui/material";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  FileText,
  Store,
  LogOut,
} from "lucide-react";
import { tokens } from "@/styles/theme";

const menuItems = [
  { label: "数据中心", icon: LayoutDashboard, path: "/" },
  { label: "订单管理", icon: FileText, path: "/orders" },
  { label: "商品管理", icon: Package, path: "/products" },
  { label: "店铺设置", icon: Store, path: "/settings" },
];

export function MerchantSidebar() {
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
          <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
            商家中心
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
                  {item.label}
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
          <Typography variant="body2">退出登录</Typography>
        </Box>
      </Box>
    </Box>
  );
}
