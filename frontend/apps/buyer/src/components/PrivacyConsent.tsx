import { useState, useEffect } from "react";
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
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PrivacySettings>({
    analytics: false,
    location: false,
    marketing: false,
  });

  useEffect(() => {
    // 检查用户是否已经做出过隐私同意
    const hasConsented = localStorage.getItem("privacyConsent");
    if (!hasConsented) {
      // 首次访问，显示隐私同意弹窗
      setOpen(true);
    }
  }, []);

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
        隐私政策
        <IconButton onClick={() => setOpen(false)} sx={{ padding: 0 }}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 3 }}>
          我们重视您的隐私，致力于保护您的个人信息。以下是我们收集和使用您信息的方式：
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            数据分析
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            我们使用分析工具收集您的浏览行为数据，以改进我们的服务。
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              id="analytics"
              checked={settings.analytics}
              onChange={() => handleToggleSetting("analytics")}
              style={{ marginRight: "8px" }}
            />
            <label htmlFor="analytics">允许数据分析</label>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            位置信息
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            我们可能会使用您的位置信息为您提供更相关的服务。
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              id="location"
              checked={settings.location}
              onChange={() => handleToggleSetting("location")}
              style={{ marginRight: "8px" }}
            />
            <label htmlFor="location">允许位置信息</label>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            营销通讯
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            我们可能会向您发送有关我们产品和服务的营销信息。
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              id="marketing"
              checked={settings.marketing}
              onChange={() => handleToggleSetting("marketing")}
              style={{ marginRight: "8px" }}
            />
            <label htmlFor="marketing">允许营销通讯</label>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="body2" color="text.secondary">
          您可以随时在网站底部的隐私设置中修改这些选项。
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 3 }}>
        <Button onClick={handleRejectAll} sx={{ textTransform: "none" }}>
          拒绝所有
        </Button>
        <Box>
          <Button onClick={handleSaveSettings} sx={{ textTransform: "none", mr: 2 }}>
            保存设置
          </Button>
          <Button variant="contained" onClick={handleAcceptAll} sx={{ textTransform: "none" }}>
            接受所有
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default PrivacyConsent;
