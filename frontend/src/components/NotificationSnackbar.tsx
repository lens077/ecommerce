import { useEffect, useState } from 'react';
import { useSnapshot } from 'valtio';
import { Alert, Snackbar } from '@mui/material';
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
  
  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    
    setOpen(false);
  };
  
  const handleExited = () => {
    if (currentNotification) {
      removeNotification(currentNotification.id);
      setCurrentNotification(null);
    }
  };
  
  if (!currentNotification) {
    return null;
  }
  
  return (
    <Snackbar
      open={open}
      autoHideDuration={currentNotification.duration || 5000}
      onClose={handleClose}
      onExited={handleExited}
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
