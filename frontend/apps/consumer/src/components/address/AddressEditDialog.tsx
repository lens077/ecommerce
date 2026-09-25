import { useId, useRef, useState } from "react";
import { Close } from "@ecommerce/icons";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from "@mui/material";
import { toAppError } from "@ecommerce/api";
import { useTranslation } from "@ecommerce/i18n";
import type { AddressFormData } from "@/api/addresses/types";
import { sp } from "@/styles/tokens";
import { AddressForm } from "./AddressForm";
import { validateAddressForm } from "./addressValidation";
import { addressActionSx, addressAlertSx, addressPaperSx, addressPrimarySx } from "./addressStyles";

interface AddressEditDialogProps {
  initialValue: AddressFormData;
  editing: boolean;
  onSave: (value: AddressFormData) => Promise<unknown>;
  isSaving: boolean;
  onClose: () => void;
  notice?: string | null;
}

/** 每次打开挂载一个新表单；写入失败不卸载、不清空输入。 */
export function AddressEditDialog({
  initialValue,
  editing,
  onSave,
  isSaving,
  onClose,
  notice,
}: AddressEditDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [value, setValue] = useState(initialValue);
  const [districtRequired, setDistrictRequired] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const close = () => {
    if (!saving.current && !isSaving) onClose();
  };
  const save = async () => {
    if (saving.current || isSaving) return;
    const invalid = validateAddressForm(value, { districtRequired });
    if (invalid) {
      setError(t(invalid));
      return;
    }
    saving.current = true;
    setError(null);
    try {
      await onSave(value);
      onClose();
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      saving.current = false;
    }
  };
  return (
    <Dialog
      open
      onClose={close}
      maxWidth="sm"
      fullWidth
      aria-labelledby={titleId}
      slotProps={{ paper: { sx: addressPaperSx } }}
    >
      <DialogTitle
        id={titleId}
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        {t(editing ? "addresses.edit" : "addresses.add")}
        <IconButton
          aria-label={t("common:action.close")}
          onClick={close}
          disabled={isSaving}
          sx={addressActionSx}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        aria-busy={isSaving}
      >
        <DialogContent>
          {notice && (
            <Alert severity="warning" sx={{ ...addressAlertSx, mb: sp[4] }}>
              {notice}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ ...addressAlertSx, mb: sp[4] }}>
              {error}
            </Alert>
          )}
          <AddressForm
            value={value}
            onChange={setValue}
            onDistrictRequiredChange={setDistrictRequired}
            disabled={isSaving}
            showDefault={!editing}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={isSaving} sx={addressActionSx}>
            {t("common:action.cancel")}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSaving || districtRequired === null}
            sx={addressPrimarySx}
          >
            {t(isSaving ? "addresses.saving" : "common:action.save")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
