import React from "react";
import { Box, Button, Container, Paper, Alert, Typography } from "@mui/material";
import {
  isPermissionDenied,
  isServiceUnavailable,
  isUnauthenticated,
  toAppError,
} from "@ecommerce/api";
import { useTranslation } from "@ecommerce/i18n";

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
  // 这是共享包，没有自己的命名空间，文案一律取 common
  const { t } = useTranslation("common");

  if (loading) return <div>{t("state.loading")}</div>;

  if (error) {
    // 文案统一由 toAppError 决定：先问 app 注入的解析器（切英文时走 errors 命名空间），
    // 再按服务端 message、reason、code 兜底，不会再出现“未知错误”
    const appError = toAppError(error);

    if (isUnauthenticated(appError)) {
      return (
        <ErrorPanel
          message={appError.message}
          actionLabel={t("action.signIn")}
          onAction={() => (window.location.href = "/callback")}
        />
      );
    }

    if (isPermissionDenied(appError)) {
      return (
        <ErrorPanel
          message={appError.message}
          actionLabel={t("action.goBack")}
          onAction={onBack || (() => window.history.back())}
        />
      );
    }

    if (isServiceUnavailable(appError)) {
      return (
        <ErrorPanel
          message={appError.message}
          actionLabel={t("action.reload")}
          onAction={() => window.location.reload()}
        />
      );
    }

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Paper elevation={0} sx={panelSx}>
          <Alert severity="error" sx={{ mb: 4 }}>
            {t("error.loadFailed", { message: appError.message })}
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
            {t("action.reload")}
          </Button>
        </Paper>
      </Container>
    );
  }

  return <>{children}</>;
};

export default ErrorHandler;
