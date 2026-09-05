import { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
} from "@mui/material";
import { Close } from "@mui/icons-material";
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

const PrivacyConsent: React.FC<PrivacyConsentProps> = ({ onConsent }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !localStorage.getItem("privacyConsent"));
  const [settings, setSettings] = useState<PrivacySettings>({
    analytics: false,
    location: false,
    marketing: false,
  });

  const handleAcceptAll = () => {
    const newSettings: PrivacySettings = {
      analytics: true,
      location: true,
      marketing: true,
    };
    saveConsent(newSettings);
  };

  const handleSaveSettings = () => {
    saveConsent(settings);
  };

  const handleRejectAll = () => {
    const newSettings: PrivacySettings = {
      analytics: false,
      location: false,
      marketing: false,
    };
    saveConsent(newSettings);
  };

  const saveConsent = (consentSettings: PrivacySettings) => {
    // 保存到本地存储
    localStorage.setItem("privacyConsent", JSON.stringify(consentSettings));
    // 通知父组件
    onConsent(consentSettings);
    // 关闭弹窗
    setOpen(false);
  };

  const handleToggleSetting = (key: keyof PrivacySettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="sm"
      fullWidth
      sx={{
        "& .MuiDialog-paper": {
          borderRadius: "16px",
          margin: "20px",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {t("privacy.title")}
        <IconButton
          onClick={() => setOpen(false)}
          aria-label={t("privacy.close")}
          sx={{ padding: 0 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 3 }}>
          {t("privacy.intro")}
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>
            {t("privacy.analytics.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("privacy.analytics.desc")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              id="analytics"
              checked={settings.analytics}
              onChange={() => handleToggleSetting("analytics")}
              style={{ marginRight: "8px" }}
            />
            <label htmlFor="analytics">{t("privacy.analytics.allow")}</label>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>
            {t("privacy.location.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("privacy.location.desc")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              id="location"
              checked={settings.location}
              onChange={() => handleToggleSetting("location")}
              style={{ marginRight: "8px" }}
            />
            <label htmlFor="location">{t("privacy.location.allow")}</label>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>
            {t("privacy.marketing.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("privacy.marketing.desc")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              id="marketing"
              checked={settings.marketing}
              onChange={() => handleToggleSetting("marketing")}
              style={{ marginRight: "8px" }}
            />
            <label htmlFor="marketing">{t("privacy.marketing.allow")}</label>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="body2" color="text.secondary">
          {t("privacy.footnote")}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 3 }}>
        <Button onClick={handleRejectAll} sx={{ textTransform: "none" }}>
          {t("privacy.rejectAll")}
        </Button>
        <Box>
          <Button onClick={handleSaveSettings} sx={{ textTransform: "none", mr: 2 }}>
            {t("privacy.saveSettings")}
          </Button>
          <Button variant="contained" onClick={handleAcceptAll} sx={{ textTransform: "none" }}>
            {t("privacy.acceptAll")}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default PrivacyConsent;
