/**
 * 管理后台顶部导航
 */

import { Box, Avatar, IconButton, Tooltip } from "@mui/material";
import { Bell, Search, Settings } from "lucide-react";
import { useTranslation } from "@ecommerce/i18n";
import { LocaleSwitcher } from "@ecommerce/ui";
import { tokens } from "@/styles/tokens";

export function AdminHeader() {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        height: 64,
        bgcolor: tokens.colors.background.card,
        borderBottom: `1px solid ${tokens.colors.border.default}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 4,
      }}
    >
      {/* 搜索框 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          bgcolor: tokens.colors.background.primary,
          borderRadius: 1.5,
          px: 2,
          py: 1,
          width: 320,
        }}
      >
        <Search size={18} color={tokens.colors.text.secondary} />
        <Box
          component="input"
          type="text"
          placeholder={t("header.searchPlaceholder")}
          aria-label={t("header.searchPlaceholder")}
          sx={{
            border: "none",
            outline: "none",
            bgcolor: "transparent",
            flex: 1,
            fontSize: "0.875rem",
            color: tokens.colors.text.primary,
            "&::placeholder": {
              color: tokens.colors.text.secondary,
            },
          }}
        />
      </Box>

      {/* 右侧操作 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <LocaleSwitcher size="medium" color="default" />
        <Tooltip title={t("header.notifications")}>
          <IconButton
            aria-label={t("header.notifications")}
            sx={{
              color: tokens.colors.text.secondary,
              "&:hover": { bgcolor: tokens.colors.background.primary },
            }}
          >
            <Bell size={20} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("header.settings")}>
          <IconButton
            aria-label={t("header.settings")}
            sx={{
              color: tokens.colors.text.secondary,
              "&:hover": { bgcolor: tokens.colors.background.primary },
            }}
          >
            <Settings size={20} />
          </IconButton>
        </Tooltip>
        <Avatar
          sx={{
            width: 36,
            height: 36,
            ml: 1,
            bgcolor: tokens.colors.text.primary,
            fontSize: "0.875rem",
          }}
        >
          {t("header.avatarInitial")}
        </Avatar>
      </Box>
    </Box>
  );
}
