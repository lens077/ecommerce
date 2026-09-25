import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  Typography,
} from "@mui/material";
import { Delete, Edit } from "@ecommerce/icons";
import { useTranslation } from "@ecommerce/i18n";
import type { Address } from "@/api/addresses/types";
import { lantern, sp } from "@/styles/tokens";
import { addressActionSx } from "./addressStyles";

interface AddressListProps {
  addresses: Address[] | undefined;
  isLoading: boolean;
  disabled: boolean;
  onEdit: (address: Address) => void;
  onDelete: (address: Address) => void;
  onSetDefault: (address: Address) => void;
}
export function AddressList({
  addresses,
  isLoading,
  disabled,
  onEdit,
  onDelete,
  onSetDefault,
}: AddressListProps) {
  const { t } = useTranslation();
  if (isLoading)
    return (
      <Box role="status" sx={{ p: sp[6], textAlign: "center" }}>
        <CircularProgress size={24} sx={{ color: lantern.inkSoft }} />
        <Typography component="p">{t("common:state.loading")}</Typography>
      </Box>
    );
  if (addresses?.length === 0)
    return (
      <Box sx={{ py: sp[8], textAlign: "center", color: lantern.inkSoft }}>
        <Typography component="p">{t("addresses.empty.title")}</Typography>
        <Typography component="p" variant="body2">
          {t("addresses.empty.desc")}
        </Typography>
      </Box>
    );
  return (
    <List sx={{ display: "grid", gap: sp[4] }}>
      {addresses?.map((address) => (
        <ListItem
          key={address.addressId}
          sx={{
            p: sp[4],
            border: lantern.line,
            borderRadius: "10px",
            display: "flex",
            flexWrap: "wrap",
            gap: sp[3],
            bgcolor: lantern.paper,
          }}
        >
          <Box sx={{ flex: "1 1 220px", minWidth: 0, overflowWrap: "anywhere" }}>
            <Typography component="p" sx={{ fontWeight: 700 }}>
              {address.recipientName}{" "}
              <Box component="span" sx={{ fontWeight: 400 }}>
                {address.recipientPhone}
              </Box>
            </Typography>
            <Typography component="p" variant="body2" sx={{ color: lantern.inkSoft }}>
              {[
                address.detail?.province,
                address.detail?.city,
                address.detail?.district,
                address.detail?.detail,
              ]
                .filter(Boolean)
                .join(" ")}
            </Typography>
            {address.isDefault && (
              <Typography component="span" variant="body2" sx={{ color: lantern.bambooDeep }}>
                {t("addresses.default")}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: sp[2] }}>
            {!address.isDefault && (
              <Button
                disabled={disabled}
                onClick={() => onSetDefault(address)}
                sx={addressActionSx}
              >
                {t("addresses.form.setDefault")}
              </Button>
            )}
            <IconButton
              disabled={disabled}
              aria-label={t("addresses.edit")}
              onClick={() => onEdit(address)}
              sx={addressActionSx}
            >
              <Edit />
            </IconButton>
            <IconButton
              disabled={disabled}
              aria-label={t("common:action.delete")}
              onClick={() => onDelete(address)}
              sx={addressActionSx}
            >
              <Delete />
            </IconButton>
          </Box>
        </ListItem>
      ))}
    </List>
  );
}
