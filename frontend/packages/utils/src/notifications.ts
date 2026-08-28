import { createStore } from "zustand/vanilla";

export interface Notification {
  id: string;
  message: string;
  severity: "success" | "error" | "warning" | "info";
  duration?: number;
}

export interface NotificationState {
  notifications: Notification[];
}

/** zustand vanilla store：本包不依赖 React，刻意只用 `zustand/vanilla`。
 *  React 侧如需订阅，自行 `import { useStore } from "zustand"` 后
 *  `useStore(notificationStore, (s) => s.notifications)`。 */
export const notificationStore = createStore<NotificationState>()(() => ({
  notifications: [],
}));

export const addNotification = (notification: Omit<Notification, "id">) => {
  const id = Date.now().toString();
  notificationStore.setState((state) => ({
    notifications: [...state.notifications, { ...notification, id }],
  }));

  // 自动移除通知；duration 为 0 表示不自动移除
  if (notification.duration !== 0) {
    setTimeout(() => {
      removeNotification(id);
    }, notification.duration || 5000);
  }
};

export const removeNotification = (id: string) => {
  notificationStore.setState((state) => ({
    notifications: state.notifications.filter((notification) => notification.id !== id),
  }));
};

export const clearNotifications = () => {
  notificationStore.setState({ notifications: [] });
};
