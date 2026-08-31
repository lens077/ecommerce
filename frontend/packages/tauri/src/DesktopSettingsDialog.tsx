import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@ecommerce/i18n";
import { DEFAULT_GATEWAY_URL, loadGatewayUrl, saveGatewayUrl } from "./settings";

/**
 * 桌面端设置面板，`Cmd/Ctrl + ,` 唤起。
 *
 * 桌面安装包不绑定环境，网关地址存在本地 settings.json 里。改完需要重载
 * webview —— transport 的 baseUrl 在创建时就固化了，只能重跑一遍入口。
 */
export function DesktopSettingsDialog() {
  // 桌面胶水包没有自己的命名空间，文案挂在 common 的 desktop 段下
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadGatewayUrl().then(setGatewayUrl);
  }, [open]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveGatewayUrl(gatewayUrl || DEFAULT_GATEWAY_URL);
      // 重载 webview，让入口重新读设置并重建 transport
      window.location.reload();
    } catch (err) {
      console.error("[desktop] 保存设置失败", err);
      setSaving(false);
    }
  }, [gatewayUrl]);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>{t("desktop.title")}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t("desktop.description")}</DialogContentText>
        <TextField
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- 对话框打开时聚焦首个输入符合 APG dialog 模式
          autoFocus
          fullWidth
          label={t("desktop.gatewayUrl")}
          placeholder={DEFAULT_GATEWAY_URL}
          value={gatewayUrl}
          onChange={(event) => setGatewayUrl(event.target.value)}
          helperText={t("desktop.gatewayUrlHelp", { url: DEFAULT_GATEWAY_URL })}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)} disabled={saving}>
          {t("action.cancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving} variant="contained">
          {t("desktop.saveAndReload")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DesktopSettingsDialog;
