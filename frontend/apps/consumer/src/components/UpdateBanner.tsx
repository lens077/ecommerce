/**
 * 「发现新版本」提示条：versionCheck 检测到服务器上有新构建时出现在底部居中，
 * 由用户决定是否刷新（不打断后台里可能填到一半的表单）。挂在 __root.tsx，
 * 与 NotificationsHost 互不抢占——通知会自动消失，这条只会被刷新或手动关闭。
 */

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Grow from "@mui/material/Grow";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "@ecommerce/i18n";
import { isUpdateAvailable, subscribeUpdateAvailable } from "@/lib/versionCheck";

export default function UpdateBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const updateAvailable = useSyncExternalStore(subscribeUpdateAvailable, isUpdateAvailable);

  if (!updateAvailable || dismissed) return null;

  return (
    <Grow in>
      <Alert
        severity="info"
        variant="filled"
        role="status"
        onClose={() => setDismissed(true)}
        sx={{
          position: "fixed",
          bottom: 24,
          left: 0,
          right: 0,
          margin: "auto",
          width: "fit-content",
          maxWidth: "calc(100% - 32px)",
          boxShadow: 3,
          zIndex: (theme) => theme.zIndex.snackbar,
        }}
        action={
          <Button color="inherit" size="small" onClick={() => window.location.reload()}>
            {t("update.refresh")}
          </Button>
        }
      >
        {t("update.available")}
      </Alert>
    </Grow>
  );
}
