import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { setAccount } from "@/store/users";
import { useEffect } from "react";
import { useGetUserProfile } from "@/hooks/useProfile";
import {
  Avatar,
  Box,
  CircularProgress,
  Container,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import {
  LocationOn,
  ChevronRight,
  Person,
  Email,
  Badge as BadgeIcon,
  Tag,
} from "@mui/icons-material";
import { addNotification } from "@ecommerce/utils";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/profile/")({
  component: RouteComponent,
  // 校验token是否过期，过期则重定向到首页
  beforeLoad: ({ context }) => {
    // 同时检查 React 状态和 localStorage token，防止状态传播时序问题
    const token = localStorage.getItem("token");
    if (!context.auth.isAuthenticated && !token) {
      console.warn("Token已过期或未登录，请重新登录。");

      addNotification({
        message: "请先登录以访问个人中心",
        severity: "warning",
      });

      setAccount({});
      localStorage.removeItem("token");

      if (context?.auth?.login) {
        context.auth.login();
      }
    }
  },
});

/** 个人中心导航项 */
const NAV_ITEMS = [
  { label: "地址管理", desc: "管理收货地址", icon: LocationOn, path: "/profile/addresses" },
] as const;

function RouteComponent() {
  const navigate = useNavigate();
  const { data: userProfile, error } = useGetUserProfile();

  useEffect(() => {
    if (userProfile) {
      setAccount(userProfile);
    }
  }, [userProfile]);

  if (!userProfile) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error" sx={{ textAlign: "center", py: 4 }}>
        无法加载用户信息，请刷新重试。
      </Typography>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.colors.background.primary, py: tokens.spacing[6] }}>
      <Container maxWidth="md">
        {/* 用户信息卡片 */}
        <Paper
          elevation={0}
          sx={{
            p: tokens.spacing[6],
            mb: tokens.spacing[4],
            borderRadius: tokens.radius.xl,
            border: `1px solid ${tokens.colors.border.default}`,
            display: "flex",
            alignItems: "center",
            gap: tokens.spacing[4],
          }}
        >
          <Avatar
            src={userProfile.avatar}
            alt={userProfile.name}
            sx={{ width: 72, height: 72, border: `2px solid ${tokens.colors.border.default}` }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: tokens.colors.text.primary, mb: 0.5 }}>
              {userProfile.displayName || userProfile.name}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              {userProfile.email}
            </Typography>
            {userProfile.tag && (
              <Typography variant="caption" sx={{ color: tokens.colors.text.secondary, mt: 0.5, display: "block" }}>
                标签：{userProfile.tag}
              </Typography>
            )}
          </Box>
        </Paper>

        {/* 账号信息 */}
        <Paper
          elevation={0}
          sx={{
            mb: tokens.spacing[4],
            borderRadius: tokens.radius.xl,
            border: `1px solid ${tokens.colors.border.default}`,
            overflow: "hidden",
          }}
        >
          <Box sx={{ p: tokens.spacing[4], borderBottom: `1px solid ${tokens.colors.border.default}` }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
              账号信息
            </Typography>
          </Box>
          <List dense>
            <InfoRow icon={<BadgeIcon fontSize="small" />} label="用户ID" value={userProfile.id} />
            <InfoRow icon={<Person fontSize="small" />} label="用户名" value={userProfile.name} />
            <InfoRow icon={<Email fontSize="small" />} label="邮箱" value={userProfile.email} />
            {userProfile.createdTime && (
              <InfoRow icon={<Tag fontSize="small" />} label="注册时间" value={userProfile.createdTime} />
            )}
          </List>
        </Paper>

        {/* 导航菜单 */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: tokens.radius.xl,
            border: `1px solid ${tokens.colors.border.default}`,
            overflow: "hidden",
          }}
        >
          <Box sx={{ p: tokens.spacing[4], borderBottom: `1px solid ${tokens.colors.border.default}` }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
              常用功能
            </Typography>
          </Box>
          <List>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <ListItemButton
                  key={item.path}
                  onClick={() => navigate({ to: item.path })}
                  sx={{
                    py: tokens.spacing[3],
                    "&:hover": { bgcolor: tokens.colors.background.primary },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: tokens.colors.text.secondary }}>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body1" sx={{ fontWeight: 500, color: tokens.colors.text.primary }}>
                        {item.label}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                        {item.desc}
                      </Typography>
                    }
                  />
                  <ChevronRight sx={{ color: tokens.colors.text.disabled }} />
                </ListItemButton>
              );
            })}
          </List>
        </Paper>
      </Container>
    </Box>
  );
}

/** 信息行 */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: tokens.spacing[2],
          px: tokens.spacing[4],
          py: tokens.spacing[2],
        }}
      >
        <Box sx={{ color: tokens.colors.text.secondary, display: "flex", alignItems: "center" }}>{icon}</Box>
        <Typography variant="body2" sx={{ color: tokens.colors.text.secondary, minWidth: 72 }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.colors.text.primary, fontWeight: 500 }}>
          {value}
        </Typography>
      </Box>
      <Divider sx={{ borderColor: tokens.colors.border.default, mx: tokens.spacing[4] }} />
    </>
  );
}
