import React from "react";
import { Box, Button, Container, Paper, Alert, Typography } from "@mui/material";
import { Code, ConnectError } from "@connectrpc/connect";

interface ErrorHandlerProps {
  error: any;
  onBack?: () => void;
  loading: boolean;
  children: React.ReactNode;
}

const ErrorHandler: React.FC<ErrorHandlerProps> = ({ error, onBack, loading, children }) => {
  if (loading) return <div>加载中...</div>;

  if (error) {
    const connectErr = ConnectError.from(error);

    switch (connectErr.code) {
      case Code.PermissionDenied:
        return (
          <Container maxWidth="md" sx={{ py: 4 }}>
            <Paper
              elevation={0}
              sx={{
                backdropFilter: "blur(10px)",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                borderRadius: "16px",
                padding: "24px",
                mb: 4,
              }}
            >
              <Alert severity="error" sx={{ mb: 4 }}>
                权限不足：您没有访问此页面的权限
              </Alert>
              <Button
                variant="contained"
                color="primary"
                onClick={onBack || (() => window.history.back())}
                sx={{
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: "medium",
                }}
              >
                返回上一页
              </Button>
            </Paper>
          </Container>
        );
      case Code.Unauthenticated:
        return (
          <Container maxWidth="md" sx={{ py: 4 }}>
            <Paper
              elevation={0}
              sx={{
                backdropFilter: "blur(10px)",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                borderRadius: "16px",
                padding: "24px",
                mb: 4,
              }}
            >
              <Alert severity="error" sx={{ mb: 4 }}>
                未登录：请先登录后再访问此页面
              </Alert>
              <Button
                variant="contained"
                color="primary"
                onClick={() => (window.location.href = "/callback")}
                sx={{
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: "medium",
                }}
              >
                去登录
              </Button>
            </Paper>
          </Container>
        );
      case Code.Unavailable:
        return (
          <Container maxWidth="md" sx={{ py: 4 }}>
            <Paper
              elevation={0}
              sx={{
                backdropFilter: "blur(10px)",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                borderRadius: "16px",
                padding: "24px",
                mb: 4,
              }}
            >
              <Alert severity="error" sx={{ mb: 4 }}>
                服务不可用：请稍后再试
              </Alert>
              <Button
                variant="contained"
                color="primary"
                onClick={() => window.location.reload()}
                sx={{
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: "medium",
                }}
              >
                重新加载
              </Button>
            </Paper>
          </Container>
        );
      default:
        return (
          <Container maxWidth="md" sx={{ py: 4 }}>
            <Paper
              elevation={0}
              sx={{
                backdropFilter: "blur(10px)",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                borderRadius: "16px",
                padding: "24px",
                mb: 4,
              }}
            >
              <Alert severity="error" sx={{ mb: 4 }}>
                加载失败：{connectErr.rawMessage || "未知错误"}
              </Alert>
              <Button
                variant="contained"
                color="primary"
                onClick={() => window.location.reload()}
                sx={{
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: "medium",
                }}
              >
                重新加载
              </Button>
            </Paper>
          </Container>
        );
    }
  }

  return <>{children}</>;
};

export default ErrorHandler;
