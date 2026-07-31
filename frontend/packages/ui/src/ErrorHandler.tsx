import React from "react";
import { Box, Button, Container, Paper, Alert, Typography } from "@mui/material";
import {
  isPermissionDenied,
  isServiceUnavailable,
  isUnauthenticated,
  toAppError,
} from "@ecommerce/api";

interface ErrorHandlerProps {
  error: any;
  onBack?: () => void;
  loading: boolean;
  children: React.ReactNode;
}

const panelSx = {
  backdropFilter: "blur(10px)",
  backgroundColor: "rgba(255, 255, 255, 0.8)",
  borderRadius: "16px",
  padding: "24px",
  mb: 4,
} as const;

const buttonSx = {
  borderRadius: "8px",
  textTransform: "none",
  fontWeight: "medium",
} as const;

const ErrorPanel: React.FC<{ message: string; actionLabel: string; onAction: () => void }> = ({
  message,
  actionLabel,
  onAction,
}) => (
  <Container maxWidth="md" sx={{ py: 4 }}>
    <Paper elevation={0} sx={panelSx}>
      <Alert severity="error" sx={{ mb: 4 }}>
        {message}
      </Alert>
      <Button variant="contained" color="primary" onClick={onAction} sx={buttonSx}>
        {actionLabel}
      </Button>
    </Paper>
  </Container>
);

const ErrorHandler: React.FC<ErrorHandlerProps> = ({ error, onBack, loading, children }) => {
  if (loading) return <div>加载中...</div>;

  if (error) {
    // 文案统一由 toAppError 决定：优先用网关/服务端返回的中文 message，
    // 拿不到时按 reason、再按 code 兜底，不会再出现“未知错误”
    const appError = toAppError(error);

    if (isUnauthenticated(appError)) {
      return (
        <ErrorPanel
          message={appError.message}
          actionLabel="去登录"
          onAction={() => (window.location.href = "/callback")}
        />
      );
    }

    if (isPermissionDenied(appError)) {
      return (
        <ErrorPanel
          message={appError.message}
          actionLabel="返回上一页"
          onAction={onBack || (() => window.history.back())}
        />
      );
    }

    if (isServiceUnavailable(appError)) {
      return (
        <ErrorPanel
          message={appError.message}
          actionLabel="重新加载"
          onAction={() => window.location.reload()}
        />
      );
    }

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Paper elevation={0} sx={panelSx}>
          <Alert severity="error" sx={{ mb: 4 }}>
            加载失败：{appError.message}
          </Alert>
          <Typography variant="caption" color="text.secondary" component={Box} sx={{ mb: 2 }}>
            {appError.codeName} / {appError.reason}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => window.location.reload()}
            sx={buttonSx}
          >
            重新加载
          </Button>
        </Paper>
      </Container>
    );
  }

  return <>{children}</>;
};

export default ErrorHandler;
