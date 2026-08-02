/**
 * 错误边界组件
 *
 * 捕获子组件的 JavaScript 错误，显示错误 UI
 */

import { Box, Button, Typography } from "@mui/material";
import { Component, type ReactNode } from "react";
import { useTranslation } from "@ecommerce/i18n";

/**
 * 默认兜底 UI。
 *
 * 单独抽成函数组件是因为 ErrorBoundary 必须是 class（只有 class 有
 * getDerivedStateFromError），而 class 里用不了 useTranslation。
 * 抽出来之后文案照样跟着语言切换实时更新，比 i18next.t 直接取值更准。
 */
function DefaultFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const { t } = useTranslation("common");

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
        {t("error.title")}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 4, maxWidth: 400 }}>
        {error?.message || t("error.unknown")}
      </Typography>
      <Button variant="contained" onClick={onReset}>
        {t("action.reload")}
      </Button>
    </Box>
  );
}

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

      return <DefaultFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}
