/**
 * 系统设置页面
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation();

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 800 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}>
          {t("settings.title")}
        </Typography>

        {/* 基本设置 */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              {t("settings.basic.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* defaultValue 是平台自身的配置值，不随界面语言变 —— 只翻 label */}
              <TextField
                label={t("settings.basic.platformName")}
                defaultValue="B2B2C 电商平台"
                fullWidth
                size="small"
              />
              <TextField
                label={t("settings.basic.platformLogo")}
                defaultValue="https://example.com/logo.png"
                fullWidth
                size="small"
              />
              <TextField
                label={t("settings.basic.copyright")}
                defaultValue="© 2024 Ecommerce. All rights reserved."
                fullWidth
                size="small"
              />
            </Box>
          </CardContent>
        </Card>

        {/* 订单设置 */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              {t("settings.order.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Typography variant="body2" sx={{ color: "text.primary", width: 150 }}>
                  {t("settings.order.timeout")}
                </Typography>
                <TextField
                  size="small"
                  defaultValue="30"
                  sx={{ width: 120 }}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {t("settings.order.minutes")}
                        </Typography>
                      ),
                    },
                  }}
                />
              </Box>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label={t("settings.order.autoCancel")}
              />
              <FormControlLabel
                control={<Switch defaultChecked />}
                label={t("settings.order.autoReview")}
              />
            </Box>
          </CardContent>
        </Card>

        {/* 安全设置 */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              {t("settings.security.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label={t("settings.security.twoFactor")}
              />
              <FormControlLabel
                control={<Switch />}
                label={t("settings.security.remoteLoginAlert")}
              />
              <FormControlLabel
                control={<Switch defaultChecked />}
                label={t("settings.security.sensitiveOpVerify")}
              />
            </Box>
          </CardContent>
        </Card>

        {/* 保存按钮 */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
          <Button variant="outlined" sx={{ borderColor: tokens.colors.border.default }}>
            {t("common:action.cancel")}
          </Button>
          <Button variant="contained">{t("settings.save")}</Button>
        </Box>
      </Box>
    </AdminLayout>
  );
}
