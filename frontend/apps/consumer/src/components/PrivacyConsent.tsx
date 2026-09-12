/**
 * 隐私偏好提示：右下角非阻塞卡片，不是模态弹窗。
 *
 * - 没有遮罩、不锁焦点，用户可以照常浏览；关掉只是本次会话不再提示，不写存储。
 * - 三项开关默认收起，点「自定义」展开；「拒绝所有 / 接受所有」一键完成。
 * - 文案全部走 i18n，切语言时随 useTranslation 重渲染，无需额外处理。
 * - 右下角 24px 处是智能助手的悬浮按钮（52px），卡片从它上方开始排，避免遮挡。
 */

import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Slide,
  Typography,
} from "@mui/material";
import { Close } from "@ecommerce/icons";
import { useTranslation } from "@ecommerce/i18n";

// 隐私设置类型
interface PrivacySettings {
  analytics: boolean;
  location: boolean;
  marketing: boolean;
}

// 组件属性类型
interface PrivacyConsentProps {
  onConsent: (settings: PrivacySettings) => void;
}

const STORAGE_KEY = "privacyConsent";

/** 智能助手悬浮按钮：bottom 24 + 高 52 + 间距 16 */
const COPILOT_FAB_CLEARANCE = 92;

const SETTING_KEYS: (keyof PrivacySettings)[] = ["analytics", "location", "marketing"];

const PrivacyConsent: React.FC<PrivacyConsentProps> = ({ onConsent }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !localStorage.getItem(STORAGE_KEY));
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState<PrivacySettings>({
    analytics: false,
    location: false,
    marketing: false,
  });

  const saveConsent = (consentSettings: PrivacySettings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consentSettings));
    onConsent(consentSettings);
    setOpen(false);
  };

  const handleAcceptAll = () => {
    saveConsent({ analytics: true, location: true, marketing: true });
  };

  const handleRejectAll = () => {
    saveConsent({ analytics: false, location: false, marketing: false });
  };

  const handleToggleSetting = (key: keyof PrivacySettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Slide in={open} direction="up" mountOnEnter unmountOnExit>
      <Paper
        role="region"
        aria-label={t("privacy.title")}
        elevation={8}
        sx={{
          position: "fixed",
          right: { xs: 16, sm: 24 },
          left: { xs: 16, sm: "auto" },
          bottom: COPILOT_FAB_CLEARANCE,
          width: { sm: 400 },
          maxHeight: `calc(100vh - ${COPILOT_FAB_CLEARANCE + 16}px)`,
          overflowY: "auto",
          borderRadius: "12px",
          p: 2.5,
          // 低于智能助手面板(1500)，高于普通内容
          zIndex: (theme) => theme.zIndex.snackbar,
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
            {t("privacy.title")}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setOpen(false)}
            aria-label={t("privacy.close")}
            sx={{ mr: -1 }}
          >
            <Close size={18} />
          </IconButton>
        </Box>

        <Typography variant="body2" color="text.secondary">
          {t("privacy.intro")}
        </Typography>

        <Collapse in={expanded}>
          <Box sx={{ mt: 2 }}>
            {SETTING_KEYS.map((key) => (
              <Box key={key} sx={{ mb: 1.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={settings[key]}
                      onChange={() => handleToggleSetting(key)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {t(`privacy.${key}.title`)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t(`privacy.${key}.desc`)}
                      </Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start", ml: 0, "& .MuiCheckbox-root": { pt: 0 } }}
                />
              </Box>
            ))}
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary">
              {t("privacy.footnote")}
            </Typography>
          </Box>
        </Collapse>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            mt: 2,
            justifyContent: "flex-end",
          }}
        >
          <Button size="small" onClick={handleRejectAll} sx={{ textTransform: "none", mr: "auto" }}>
            {t("privacy.rejectAll")}
          </Button>
          {expanded ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => saveConsent(settings)}
              sx={{ textTransform: "none" }}
            >
              {t("privacy.saveSettings")}
            </Button>
          ) : (
            <Button
              size="small"
              onClick={() => setExpanded(true)}
              aria-expanded={expanded}
              sx={{ textTransform: "none" }}
            >
              {t("privacy.customize")}
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            disableElevation
            onClick={handleAcceptAll}
            sx={{ textTransform: "none" }}
          >
            {t("privacy.acceptAll")}
          </Button>
        </Box>
      </Paper>
    </Slide>
  );
};

export default PrivacyConsent;
