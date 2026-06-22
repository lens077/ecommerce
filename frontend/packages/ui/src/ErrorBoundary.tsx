/**
 * 错误边界组件
 * 
 * 捕获子组件的 JavaScript 错误，显示错误 UI
 */

import { Box, Button, Typography } from "@mui/material";
import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 400,
            p: 4,
            textAlign: "center",
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}>
            页面出错了
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 4, maxWidth: 400 }}>
            {this.state.error?.message || "发生了未知错误，请稍后重试"}
          </Typography>
          <Button variant="contained" onClick={this.handleReset}>
            重新加载
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
