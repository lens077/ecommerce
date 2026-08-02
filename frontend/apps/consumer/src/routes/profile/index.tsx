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
import { i18next, useTranslation } from "@ecommerce/i18n";
import { addNotification, isTokenExpired } from "@ecommerce/utils";
import { sp, tokens } from "@/styles/tokens";

export const Route = createFileRoute("/profile/")({
  component: RouteComponent,
  // 校验token是否存在且未过期
  beforeLoad: ({ context }) => {
    const token = localStorage.getItem("token");
    if (!token || isTokenExpired(token)) {
      console.warn("Token已过期或未登录，请重新登录。");

      addNotification({
        // beforeLoad 不是组件环境，用 i18next 的 t
        message: i18next.t("consumer:profile.loginRequired"),
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

/** 个人中心导航项。文案 key 显式写死，不用路径拼 key。 */
const NAV_ITEMS = [
  {
    labelKey: "profile.nav.addresses.label",
    descKey: "profile.nav.addresses.desc",
    icon: LocationOn,
    path: "/profile/addresses",
  },
] as const;

function RouteComponent() {
  const navigate = useNavigate();
  const { data: userProfile, error } = useGetUserProfile();
  const { t } = useTranslation();

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
        {t("profile.loadFailed")}
      </Typography>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.colors.background.primary, py: sp[6] }}>
      <Container maxWidth="md">
        {/* 用户信息卡片 */}
        <Paper
          elevation={0}
          sx={{
            p: sp[6],
            mb: sp[4],
            borderRadius: tokens.radius.xl,
            border: `1px solid ${tokens.colors.border.default}`,
            display: "flex",
            alignItems: "center",
            gap: sp[4],
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
                {t("profile.tagLabel", { value: userProfile.tag })}
              </Typography>
            )}
          </Box>
        </Paper>

        {/* 账号信息 */}
        <Paper
          elevation={0}
          sx={{
            mb: sp[4],
            borderRadius: tokens.radius.xl,
            border: `1px solid ${tokens.colors.border.default}`,
            overflow: "hidden",
          }}
        >
          <Box sx={{ p: sp[4], borderBottom: `1px solid ${tokens.colors.border.default}` }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
              {t("profile.account.title")}
            </Typography>
          </Box>
          <List dense>
            <InfoRow icon={<BadgeIcon fontSize="small" />} label={t("profile.account.userId")} value={userProfile.id} />
            <InfoRow icon={<Person fontSize="small" />} label={t("profile.account.username")} value={userProfile.name} />
            <InfoRow icon={<Email fontSize="small" />} label={t("profile.account.email")} value={userProfile.email} />
            {userProfile.createdTime && (
              <InfoRow icon={<Tag fontSize="small" />} label={t("profile.account.createdAt")} value={userProfile.createdTime} />
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
          <Box sx={{ p: sp[4], borderBottom: `1px solid ${tokens.colors.border.default}` }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
              {t("profile.nav.title")}
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
                    py: sp[3],
                    "&:hover": { bgcolor: tokens.colors.background.primary },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: tokens.colors.text.secondary }}>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body1" sx={{ fontWeight: 500, color: tokens.colors.text.primary }}>
                        {t(item.labelKey)}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                        {t(item.descKey)}
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
          gap: sp[2],
          px: sp[4],
          py: sp[2],
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
      <Divider sx={{ borderColor: tokens.colors.border.default, mx: sp[4] }} />
    </>
  );
}
