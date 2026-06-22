/**
 * 404 Not Found 页面
 */

import { createFileRoute } from "@tanstack/react-router";
import { Box, Button, Typography } from "@mui/material";
import { Home, ArrowLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/404")({
  component: NotFoundPage,
});

function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 4,
      }}
    >
      {/* 404 数字 */}
      <Typography
        sx={{
          fontSize: { xs: "120px", md: "180px" },
          fontWeight: 800,
          color: "text.disabled",
          lineHeight: 1,
          mb: 2,
        }}
      >
        404
      </Typography>

      {/* 标题 */}
      <Typography
        variant="h4"
        sx={{
          fontWeight: 600,
          color: "text.primary",
          mb: 2,
          textAlign: "center",
        }}
      >
        页面不存在
      </Typography>

      {/* 描述 */}
      <Typography
        variant="body1"
        sx={{
          color: "text.secondary",
          mb: 4,
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        您访问的页面可能已失效或不存在，请检查链接是否正确
      </Typography>

      {/* 操作按钮 */}
      <Box sx={{ display: "flex", gap: 2 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowLeft size={18} />}
          onClick={() => navigate({ to: "/" })}
          sx={{
            borderColor: "divider",
            color: "text.secondary",
            "&:hover": {
              borderColor: "primary.main",
              bgcolor: "transparent",
            },
          }}
        >
          返回上一页
        </Button>
        <Button
          variant="contained"
          startIcon={<Home size={18} />}
          onClick={() => navigate({ to: "/" })}
          sx={{
            bgcolor: "primary.main",
            "&:hover": {
              bgcolor: "primary.dark",
            },
          }}
        >
          返回首页
        </Button>
      </Box>
    </Box>
  );
}
