import { createFileRoute } from "@tanstack/react-router";
import { setAccount } from "@/store/users";
import { useEffect } from "react";
import { useGetUserProfile } from "@/hooks/useProfile";
import { Box, CircularProgress, Typography } from "@mui/material";
import { addNotification } from "@ecommerce/utils";

export const Route = createFileRoute("/profile/")({
  component: RouteComponent,
  // 校验token是否过期，过期则重定向到首页
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
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

function RouteComponent() {
  const { data: userProfile,error } = useGetUserProfile();

  useEffect(() => {
    if (userProfile) {
      setAccount(userProfile);
    }
  }, [userProfile]);

  if (!userProfile) return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
  )

  if (error || !userProfile) {
    return <Typography color="error">无法加载用户信息，请刷新重试。</Typography>;
  }

  return (
      <div style={{ padding: "20px" }}>
        <h2>个人中心</h2>
        <ol style={{ lineHeight: "2.5" }}>
          <li><strong>ID：</strong>{userProfile.id}</li>
          <li><strong>用户名：</strong>{userProfile.name}</li>
          <li><strong>昵称：</strong>{userProfile.displayName}</li>
          <li>
            <strong>头像：</strong>
            <br />
            <img
                src={userProfile.avatar}
                alt="用户头像"
                style={{ width: "80px", height: "80px", borderRadius: "50%", marginTop: "8px" }}
            />
          </li>
          <li><strong>邮箱：</strong>{userProfile.email}</li>
          <li><strong>账号创建日期：</strong>{userProfile.createdTime}</li>
          <li><strong>用户标签：</strong>{userProfile.tag}</li>
        </ol>
      </div>
  );
}
