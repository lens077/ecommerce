import { useId, useRef, useState } from "react";
import { Close } from "@ecommerce/icons";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import { toAppError } from "@ecommerce/api";
import { useTranslation } from "@ecommerce/i18n";
import { addressActionSx, addressAlertSx, addressPaperSx, addressPrimarySx } from "./addressStyles";

export function AddressDeleteDialog({
  recipient,
  onDelete,
  onClose,
  isDeleting,
}: {
  recipient: string;
  onDelete: () => Promise<unknown>;
  onClose: () => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const close = () => {
    if (!isDeleting && !pending.current) onClose();
  };
  const remove = async () => {
    if (pending.current || isDeleting) return;
    pending.current = true;
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      pending.current = false;
    }
  };
  return (
    <Dialog
      open
      onClose={close}
      aria-labelledby={id}
      aria-describedby={`${id}-description`}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: addressPaperSx } }}
    >
      <DialogTitle
        id={id}
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        {t("addresses.deleteTitle")}
        <IconButton
          aria-label={t("common:action.close")}
          disabled={isDeleting}
          onClick={close}
          sx={addressActionSx}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent aria-busy={isDeleting}>
        {error && (
          <Alert severity="error" sx={addressAlertSx}>
            {error}
          </Alert>
        )}
        <Typography component="p" id={`${id}-description`}>
          {t("addresses.deleteConfirm", { recipient })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={isDeleting} sx={addressActionSx}>
          {t("common:action.cancel")}
        </Button>
        <Button
          onClick={() => {
            void remove();
          }}
          disabled={isDeleting}
          variant="contained"
          sx={addressPrimarySx}
        >
          {t(isDeleting ? "addresses.deleting" : "common:action.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
