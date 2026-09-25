import { useId } from "react";
import { Close } from "@ecommerce/icons";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import { useTranslation } from "@ecommerce/i18n";
import { addressActionSx, addressPaperSx, addressPrimarySx } from "./addressStyles";

export function LocationPermissionDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Dialog
      open
      onClose={() => {
        if (!pending) onCancel();
      }}
      maxWidth="sm"
      fullWidth
      aria-labelledby={id}
      aria-describedby={`${id}-description`}
      slotProps={{ paper: { sx: addressPaperSx } }}
    >
      <DialogTitle
        id={id}
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        {t("addresses.location.title")}
        <IconButton
          onClick={onCancel}
          disabled={pending}
          aria-label={t("common:action.close")}
          sx={addressActionSx}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent aria-busy={pending}>
        <Typography component="p" id={`${id}-description`}>
          {t("addresses.location.desc")}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending} sx={addressActionSx}>
          {t("common:action.cancel")}
        </Button>
        <Button onClick={onConfirm} disabled={pending} variant="contained" sx={addressPrimarySx}>
          {t(pending ? "addresses.location.getting" : "addresses.location.agree")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
