import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import { Plus, X } from "@ecommerce/icons";
import { useTranslation } from "@ecommerce/i18n";
import { toAppError } from "@ecommerce/api";
import type { Address, AddressFormData } from "@/api/addresses/types";
import { useAddresses } from "@/hooks/useAddresses";
import { lantern, sp } from "@/styles/tokens";
import { AddressForm } from "./AddressForm";
import { EMPTY_ADDRESS_FORM, validateAddressForm } from "./addressValidation";

export function addressFullText(address: Address): string {
  const detail = address.detail;
  return [detail?.province, detail?.city, detail?.district, detail?.detail]
    .filter(Boolean)
    .join(" ");
}

export function AddressPickerDialog({
  open,
  addresses,
  loading,
  selectedAddressId,
  onClose,
  onSelect,
}: {
  open: boolean;
  addresses: Address[];
  loading: boolean;
  selectedAddressId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { createAddress, isCreating } = useAddresses();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AddressFormData>({ ...EMPTY_ADDRESS_FORM });
  const [districtRequired, setDistrictRequired] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const reset = () => {
    setAdding(false);
    setForm({ ...EMPTY_ADDRESS_FORM });
    setDistrictRequired(null);
    setError(null);
  };
  const close = () => {
    if (!inFlight.current) {
      reset();
      onClose();
    }
  };
  const save = async () => {
    if (inFlight.current) return;
    const key = validateAddressForm(form, { districtRequired });
    if (key) {
      setError(t(key));
      return;
    }
    inFlight.current = true;
    setError(null);
    try {
      const result = await createAddress(form);
      reset();
      onSelect(result.addressId);
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      aria-labelledby="address-picker-title"
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { bgcolor: lantern.paper, color: lantern.ink } } }}
    >
      <DialogTitle
        id="address-picker-title"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: lantern.serif,
        }}
      >
        {t("checkout.address.pickerTitle")}
        <IconButton onClick={close} disabled={isCreating} aria-label={t("common:action.close")}>
          <X size={20} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ borderColor: lantern.bamboo }}>
        {loading ? (
          <CircularProgress sx={{ color: lantern.vermilion }} />
        ) : (
          <RadioGroup
            aria-label={t("checkout.address.pickerTitle")}
            value={selectedAddressId ?? ""}
            onChange={(_, id) => {
              if (!inFlight.current) onSelect(id);
            }}
          >
            {addresses.map((address) => (
              <FormControlLabel
                key={address.addressId}
                value={address.addressId}
                disabled={isCreating}
                control={
                  <Radio
                    sx={{ color: lantern.inkSoft, "&.Mui-checked": { color: lantern.vermilion } }}
                  />
                }
                sx={{ mx: 0, mb: sp[2], p: sp[2], border: lantern.lineSoft }}
                label={
                  <Box component="span">
                    <Typography component="span" sx={{ display: "block" }}>
                      {address.recipientName} {address.recipientPhone}
                      {address.isDefault && ` · ${t("checkout.address.default")}`}
                    </Typography>
                    <Typography component="span" variant="body2" sx={{ color: lantern.inkSoft }}>
                      {addressFullText(address)}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </RadioGroup>
        )}
        {!adding ? (
          <Button
            startIcon={<Plus size={16} />}
            sx={{ color: lantern.vermilion }}
            onClick={() => setAdding(true)}
          >
            {t("checkout.address.add")}
          </Button>
        ) : (
          <Box sx={{ mt: sp[3] }}>
            {error && (
              <Alert severity="error" sx={{ mb: sp[3] }}>
                {error}
              </Alert>
            )}
            <AddressForm
              value={form}
              onChange={setForm}
              onDistrictRequiredChange={setDistrictRequired}
              disabled={isCreating}
            />
          </Box>
        )}
      </DialogContent>
      {adding && (
        <DialogActions>
          <Button disabled={isCreating} onClick={reset} sx={{ color: lantern.ink }}>
            {t("common:action.cancel")}
          </Button>
          <Button
            disabled={isCreating}
            onClick={save}
            variant="contained"
            sx={{
              bgcolor: lantern.vermilion,
              color: lantern.paperLit,
              "&:hover": { bgcolor: lantern.vermilionDeep },
            }}
          >
            {t(isCreating ? "checkout.address.saving" : "checkout.address.save")}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
