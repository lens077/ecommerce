import { Box, Checkbox, FormControlLabel, TextField } from "@mui/material";
import { useTranslation } from "@ecommerce/i18n";
import type { AddressFormData } from "@/api/addresses/types";
import { lantern, sp } from "@/styles/tokens";
import { RegionSelect } from "./RegionSelect";

interface AddressFormProps {
  value: AddressFormData;
  onChange: (value: AddressFormData) => void;
  onDistrictRequiredChange?: (required: boolean | null) => void;
  disabled?: boolean;
  showDefault?: boolean;
}

export function AddressForm({
  value,
  onChange,
  onDistrictRequiredChange,
  disabled = false,
  showDefault = true,
}: AddressFormProps) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        display: "grid",
        gap: sp[4],
        py: sp[2],
        color: lantern.ink,
        "& .MuiInputBase-root": { color: lantern.ink, bgcolor: lantern.paper },
        "& .MuiInputLabel-root": { color: lantern.inkSoft },
        "& .MuiInputLabel-root.Mui-focused": { color: lantern.ink },
        "& .MuiOutlinedInput-notchedOutline": { borderColor: lantern.bamboo },
        "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: lantern.ink,
        },
        "& .MuiCheckbox-root": { color: lantern.inkSoft },
        "& .MuiCheckbox-root.Mui-checked": { color: lantern.vermilion },
      }}
    >
      <TextField
        label={t("addresses.form.recipient")}
        autoComplete="shipping name"
        fullWidth
        disabled={disabled}
        value={value.recipientName}
        onChange={(event) => onChange({ ...value, recipientName: event.target.value })}
      />
      <TextField
        label={t("addresses.form.phone")}
        type="tel"
        autoComplete="shipping tel"
        fullWidth
        disabled={disabled}
        value={value.recipientPhone}
        onChange={(event) => onChange({ ...value, recipientPhone: event.target.value })}
      />
      <RegionSelect
        value={value}
        onChange={(region) => onChange({ ...value, ...region })}
        onDistrictRequiredChange={onDistrictRequiredChange}
        disabled={disabled}
      />
      <TextField
        label={t("addresses.form.detail")}
        autoComplete="shipping street-address"
        fullWidth
        multiline
        rows={3}
        disabled={disabled}
        value={value.detail}
        onChange={(event) => onChange({ ...value, detail: event.target.value })}
      />
      {showDefault && (
        <FormControlLabel
          label={t("addresses.form.setDefault")}
          disabled={disabled}
          control={
            <Checkbox
              checked={value.isDefault}
              onChange={(event) => onChange({ ...value, isDefault: event.target.checked })}
            />
          }
        />
      )}
    </Box>
  );
}
