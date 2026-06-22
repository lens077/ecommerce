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
import { tokens } from "@/styles/theme";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const shopInfo = {
    name: "优品数码旗舰店",
    description: "专注数码产品销售，提供正品保障",
    phone: "400-888-8888",
    address: "北京市朝阳区建国路88号",
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 3 }}>
        店铺设置
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 3 }}>
        {/* 店铺信息 */}
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              基本信息
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>店铺名称</Typography>
                <TextField fullWidth size="small" defaultValue={shopInfo.name} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>店铺简介</Typography>
                <TextField fullWidth size="small" defaultValue={shopInfo.description} multiline rows={3} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>联系电话</Typography>
                <TextField fullWidth size="small" defaultValue={shopInfo.phone} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>店铺地址</Typography>
                <TextField fullWidth size="small" defaultValue={shopInfo.address} />
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button variant="contained" startIcon={<Save size={16} />} sx={{ bgcolor: "primary.main" }}>
                  保存修改
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* 店铺头像 */}
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              店铺头像
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Box sx={{ position: "relative", mb: 2 }}>
                <Avatar sx={{ width: 120, height: 120, bgcolor: "primary.main", fontSize: "2.5rem" }}>优</Avatar>
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
              <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>点击上传店铺头像</Typography>
              <Typography variant="caption" sx={{ color: "text.disabled", mt: 0.5 }}>支持 JPG、PNG 格式</Typography>
            </Box>
          </CardContent>
        </Card>

        {/* 通知设置 */}
        <Card sx={{ gridColumn: "1 / -1" }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 3 }}>
              通知设置
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControlLabel control={<Switch defaultChecked />} label={<Box><Typography variant="body2" sx={{ fontWeight: 500 }}>新订单提醒</Typography><Typography variant="caption" sx={{ color: "text.secondary" }}>有新订单时发送通知</Typography></Box>} sx={{ mx: 0, alignItems: "flex-start", gap: 2 }} />
              <FormControlLabel control={<Switch defaultChecked />} label={<Box><Typography variant="body2" sx={{ fontWeight: 500 }}>库存预警</Typography><Typography variant="caption" sx={{ color: "text.secondary" }}>库存不足时发送通知</Typography></Box>} sx={{ mx: 0, alignItems: "flex-start", gap: 2 }} />
              <FormControlLabel control={<Switch />} label={<Box><Typography variant="body2" sx={{ fontWeight: 500 }}>退款通知</Typography><Typography variant="caption" sx={{ color: "text.secondary" }}>有退款申请时发送通知</Typography></Box>} sx={{ mx: 0, alignItems: "flex-start", gap: 2 }} />
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
