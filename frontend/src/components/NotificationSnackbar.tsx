import { Alert, Snackbar } from '@mui/material';
import { type SyntheticEvent, useEffect, useState } from 'react';
import { useSnapshot } from 'valtio';
import { notificationStore, removeNotification } from '@/store/notifications';

export default function NotificationSnackbar() {
  const [open, setOpen] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<ReturnType<typeof useSnapshot<typeof notificationStore>>['notifications'][0] | null>(null);
  
  const notifications = useSnapshot(notificationStore).notifications;
  
  useEffect(() => {
    if (notifications.length > 0 && !currentNotification) {
      setCurrentNotification(notifications[0]);
      setOpen(true);
    }
  }, [notifications, currentNotification]);
  
  const handleClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    
    setOpen(false);
  };

  useEffect(() => {
    if (!open && currentNotification) {
      // 使用 setTimeout 确保 Snackbar 完全隐藏后再移除通知
      const timer = setTimeout(() => {
        removeNotification(currentNotification.id);
        setCurrentNotification(null);
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [open, currentNotification]);
  
  if (!currentNotification) {
    return null;
  }
  
  return (
    <Snackbar
      open={open}
      autoHideDuration={currentNotification.duration || 5000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        onClose={handleClose}
        severity={currentNotification.severity}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {currentNotification.message}
      </Alert>
    </Snackbar>
  );
}
