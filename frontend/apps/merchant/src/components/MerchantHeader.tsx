/**
 * 商家端顶部导航
 *
 * 修复样式问题
 */

import { Box, Typography, Avatar } from "@mui/material";
import { Bell, Search } from "lucide-react";
import { useTranslation } from "@ecommerce/i18n";
import { LocaleSwitcher } from "@ecommerce/ui";

export function MerchantHeader() {
  const { t } = useTranslation();
  const merchantInfo = {
    name: "优品数码旗舰店",
    avatar: "",
  };

  return (
    <Box
      sx={{
        height: 64,
        px: 3,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {/* 搜索框 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
          bgcolor: "background.default",
          borderRadius: 10,
          width: 320,
        }}
      >
        <Search size={16} color="#6b7280" />
        <Typography variant="body2" sx={{ color: "#9ca3af" }}>
          {t("header.searchPlaceholder")}
        </Typography>
      </Box>

      {/* 右侧操作 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
        {/* 语言切换 */}
        <LocaleSwitcher size="small" color="default" />

        {/* 通知 */}
        <Box
          component="button"
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            border: "none",
            borderRadius: "50%",
            bgcolor: "background.default",
            cursor: "pointer",
            "&:hover": {
              bgcolor: "action.hover",
            },
          }}
        >
          <Bell size={18} color="#6b7280" />
          <Box
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "error.main",
            }}
          />
        </Box>

        {/* 商家信息 */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
              {merchantInfo.name}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("header.verified")}
            </Typography>
          </Box>
          <Avatar
            src={merchantInfo.avatar}
            sx={{
              width: 40,
              height: 40,
              bgcolor: "primary.main",
            }}
          >
            {t("header.avatarInitial")}
          </Avatar>
        </Box>
      </Box>
    </Box>
  );
}
