/**
 * 语言切换器，四个 app 共用。
 *
 * 切换是即时的：setLocale 内部走 i18next 的 changeLanguage，
 * 订阅了 useTranslation 的组件会自动重渲染，不需要刷新页面。
 */

import LanguageIcon from "@mui/icons-material/Language";
import { IconButton, ListItemText, Menu, MenuItem, Tooltip } from "@mui/material";
import { SUPPORTED_LOCALES, useLocale, useTranslation, type Locale } from "@ecommerce/i18n";
import { useState } from "react";

interface LocaleSwitcherProps {
  /** 图标按钮尺寸，跟随所在工具栏 */
  size?: "small" | "medium" | "large";
  /** 图标颜色，深色 AppBar 上传 "inherit" */
  color?: "inherit" | "default" | "primary";
}

export function LocaleSwitcher({ size = "medium", color = "inherit" }: LocaleSwitcherProps) {
  const { t } = useTranslation("common");
  const { locale, setLocale } = useLocale();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handlePick = (next: Locale) => {
    handleClose();
    void setLocale(next);
  };

  return (
    <>
      <Tooltip title={t("locale.switch")}>
        <IconButton
          size={size}
          color={color}
          onClick={handleOpen}
          aria-label={t("locale.switch")}
          aria-haspopup="true"
        >
          <LanguageIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {SUPPORTED_LOCALES.map((item) => (
          <MenuItem key={item} selected={item === locale} onClick={() => handlePick(item)}>
            <ListItemText primary={t(`locale.${item}`)} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
