/**
 * 商家端设置页面
 *
 * 修复样式问题
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Avatar,
  Divider,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { Camera, Save } from "lucide-react";
import { useTranslation } from "@ecommerce/i18n";

/** 通知开关。文案 key 显式列出，不用字段名拼。 */
const NOTIFY_ITEMS = [
  {
    labelKey: "settings.notify.newOrder.label",
    descKey: "settings.notify.newOrder.desc",
    defaultChecked: true,
  },
  {
    labelKey: "settings.notify.lowStock.label",
    descKey: "settings.notify.lowStock.desc",
    defaultChecked: true,
  },
  {
    labelKey: "settings.notify.refund.label",
    descKey: "settings.notify.refund.desc",
    defaultChecked: false,
  },
] as const;

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation();

  const shopInfo = {
    name: "优品数码旗舰店",
    description: "专注数码产品销售，提供正品保障",
    phone: "400-888-8888",
    address: "北京市朝阳区建国路88号",
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 3 }}>
        {t("settings.title")}
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 3 }}>
        {/* 店铺信息 */}
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              {t("settings.basic.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                  {t("settings.basic.name")}
                </Typography>
                <TextField fullWidth size="small" defaultValue={shopInfo.name} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                  {t("settings.basic.description")}
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  defaultValue={shopInfo.description}
                  multiline
                  rows={3}
                />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                  {t("settings.basic.phone")}
                </Typography>
                <TextField fullWidth size="small" defaultValue={shopInfo.phone} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                  {t("settings.basic.address")}
                </Typography>
                <TextField fullWidth size="small" defaultValue={shopInfo.address} />
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  startIcon={<Save size={16} />}
                  sx={{ bgcolor: "primary.main" }}
                >
                  {t("settings.save")}
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* 店铺头像 */}
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              {t("settings.avatar.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Box sx={{ position: "relative", mb: 2 }}>
                <Avatar
                  sx={{ width: 120, height: 120, bgcolor: "primary.main", fontSize: "2.5rem" }}
                >
                  {t("settings.avatar.initial")}
                </Avatar>
                <Box
                  component="button"
                  sx={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                    border: "3px solid",
                    borderColor: "background.paper",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Camera size={16} color="white" />
                </Box>
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
                {t("settings.avatar.upload")}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled", mt: 0.5 }}>
                {t("settings.avatar.formats")}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* 通知设置 */}
        <Card sx={{ gridColumn: "1 / -1" }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              {t("settings.notify.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {NOTIFY_ITEMS.map((item) => (
                <FormControlLabel
                  key={item.labelKey}
                  control={<Switch defaultChecked={item.defaultChecked} />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {t(item.labelKey)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {t(item.descKey)}
                      </Typography>
                    </Box>
                  }
                  sx={{ mx: 0, alignItems: "flex-start", gap: 2 }}
                />
              ))}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
