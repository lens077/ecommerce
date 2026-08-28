/**
 * 全局通知（Toast）宿主：`@ecommerce/utils` notificationStore 的唯一渲染出口。
 *
 * 生产端只管 `addNotification()`（如 AppBar 登出提示），本组件负责展示：
 * 固定在顶部居中、按加入顺序竖向堆叠、自动消失由 store 的定时器驱动，
 * 手动关闭走 `removeNotification(id)`。挂载在 __root.tsx，全应用只挂一次。
 */

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Grow from "@mui/material/Grow";
import Stack from "@mui/material/Stack";
import { useStore } from "zustand";
import { notificationStore, removeNotification } from "@ecommerce/utils";

export default function NotificationsHost() {
  const notifications = useStore(notificationStore, (state) => state.notifications);

  if (notifications.length === 0) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        top: 80, // 让开 sticky AppBar
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        // 容器不拦截点击，只有 Alert 本身可交互
        pointerEvents: "none",
        zIndex: (theme) => theme.zIndex.snackbar,
      }}
    >
      <Stack spacing={1} sx={{ maxWidth: 480, width: "calc(100% - 32px)" }}>
        {notifications.map((notification) => (
          <Grow in key={notification.id}>
            <Alert
              severity={notification.severity}
              variant="filled"
              onClose={() => removeNotification(notification.id)}
              sx={{ pointerEvents: "auto", boxShadow: 3 }}
            >
              {notification.message}
            </Alert>
          </Grow>
        ))}
      </Stack>
    </Box>
  );
}
