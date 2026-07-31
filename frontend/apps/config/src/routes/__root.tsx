import { createRootRouteWithContext, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppBar, Box, Button, Chip, Toolbar, Typography } from "@mui/material";
import { SlidersHorizontal } from "lucide-react";
import { useAuthActions, useAuthState } from "@/providers/AuthProvider";
import { sp } from "@/styles/glass";

interface MyRouterContext {
  auth: {
    isAuthenticated: boolean;
    setIsAuthenticated: (v: boolean) => void;
    login: () => void;
    logout: () => void;
  };
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { isAuthenticated } = useAuthState();
  const { login, logout } = useAuthActions();
  const isCallback = useRouterState({
    select: (s) => s.location.pathname.startsWith("/callback"),
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: sp[3] }}>
          <SlidersHorizontal size={22} />
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{ fontWeight: 700, color: "inherit", textDecoration: "none" }}
          >
            配置中心
          </Typography>
          <Chip label="Config Center" size="small" variant="outlined" sx={{ ml: sp[1] }} />
          <Box sx={{ flex: 1 }} />
          {isAuthenticated ? (
            <Button variant="outlined" color="inherit" onClick={logout}>
              登出
            </Button>
          ) : (
            <Button variant="contained" onClick={login}>
              登录
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, p: sp[4] }}>
        {!isAuthenticated && !isCallback ? (
          <Typography color="text.secondary">请先登录以管理配置。</Typography>
        ) : (
          <Outlet />
        )}
      </Box>
    </Box>
  );
}
