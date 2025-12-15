import { proxy } from 'valtio';

export interface Notification {
  id: string;
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export interface NotificationState {
  notifications: Notification[];
}

export const notificationStore = proxy<NotificationState>({
  notifications: [],
});

export const addNotification = (notification: Omit<Notification, 'id'>) => {
  const id = Date.now().toString();
  notificationStore.notifications.push({
    ...notification,
    id,
  });
  
  // 自动移除通知
  if (notification.duration !== 0) {
    setTimeout(() => {
      removeNotification(id);
    }, notification.duration || 5000);
  }
};

export const removeNotification = (id: string) => {
  notificationStore.notifications = notificationStore.notifications.filter(
    (notification) => notification.id !== id
  );
};

export const clearNotifications = () => {
  notificationStore.notifications = [];
};
