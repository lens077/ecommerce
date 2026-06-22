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
  Divider,
} from "@mui/material";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 800 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}>
          系统设置
        </Typography>

        {/* 基本设置 */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              基本设置
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <TextField
                label="平台名称"
                defaultValue="B2B2C 电商平台"
                fullWidth
                size="small"
              />
              <TextField
                label="平台 Logo"
                defaultValue="https://example.com/logo.png"
                fullWidth
                size="small"
              />
              <TextField
                label="版权信息"
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
              订单设置
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Typography variant="body2" sx={{ color: "text.primary", width: 150 }}>
                  订单超时时间
                </Typography>
                <TextField
                  size="small"
                  defaultValue="30"
                  sx={{ width: 100 }}
                  InputProps={{
                    endAdornment: <Typography variant="body2" sx={{ color: "text.secondary" }}>分钟</Typography>,
                  }}
                />
              </Box>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="允许自动取消超时未支付订单"
              />
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="订单完成后自动评价"
              />
            </Box>
          </CardContent>
        </Card>

        {/* 安全设置 */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              安全设置
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="开启双因素认证"
              />
              <FormControlLabel
                control={<Switch />}
                label="异地登录提醒"
              />
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="敏感操作需二次验证"
              />
            </Box>
          </CardContent>
        </Card>

        {/* 保存按钮 */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
          <Button variant="outlined" sx={{ borderColor: tokens.colors.border.default }}>
            取消
          </Button>
          <Button variant="contained">
            保存设置
          </Button>
        </Box>
      </Box>
    </AdminLayout>
  );
}
