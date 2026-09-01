/**
 * 404 Not Found 页面
 */

import { createFileRoute } from "@tanstack/react-router";
import { Box, Button, Typography } from "@mui/material";
import { Home, ArrowLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "@ecommerce/i18n";

export const Route = createFileRoute("/404")({
  component: NotFoundPage,
});

function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        component="h1"
        sx={{
          fontWeight: 600,
          color: "text.primary",
          mb: 2,
          textAlign: "center",
        }}
      >
        {t("notFound.title")}
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
        {t("notFound.desc")}
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
          {t("notFound.back")}
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
          {t("notFound.home")}
        </Button>
      </Box>
    </Box>
  );
}
