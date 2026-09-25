import { Add } from "@ecommerce/icons";
import { Alert, Box, Button, Container, Paper, Typography } from "@mui/material";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toAppError } from "@ecommerce/api";
import { useTranslation } from "@ecommerce/i18n";
import type { Address, AddressFormData } from "@/api/addresses/types";
import { getLocationInfo, requestLocationPermission } from "@/api/location";
import { AddressEditDialog } from "@/components/address/AddressEditDialog";
import { AddressDeleteDialog } from "@/components/address/AddressDeleteDialog";
import { AddressList } from "@/components/address/AddressList";
import { LocationPermissionDialog } from "@/components/address/LocationPermissionDialog";
import { EMPTY_ADDRESS_FORM } from "@/components/address/addressValidation";
import {
  addressActionSx,
  addressAlertSx,
  addressPaperSx,
  addressPrimarySx,
} from "@/components/address/addressStyles";
import { useAddresses } from "@/hooks/useAddresses";
import { useGetUserProfile } from "@/hooks/useProfile";
import { requireLogin } from "@/lib/requireLogin";
import { setAccount } from "@/store/users";
import { lantern, sp } from "@/styles/tokens";

export const Route = createFileRoute("/profile/addresses/")({
  component: RouteComponent,
  beforeLoad: requireLogin("consumer:addresses.loginRequired"),
});

function toForm(address: Address): AddressFormData {
  return {
    recipientName: address.recipientName,
    recipientPhone: address.recipientPhone,
    province: address.detail?.province ?? "",
    city: address.detail?.city ?? "",
    district: address.detail?.district ?? "",
    detail: address.detail?.detail ?? "",
    isDefault: address.isDefault,
  };
}

function RouteComponent() {
  const { data: userProfile } = useGetUserProfile();
  const { t } = useTranslation();
  const {
    addresses,
    isLoading,
    error,
    refetch,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    isCreating,
    isUpdating,
    isDeleting,
    isSettingDefault,
  } = useAddresses();
  const [editor, setEditor] = useState<{
    addressId?: string;
    value: AddressFormData;
    notice?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const locationPending = useRef(false);
  const defaultPending = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = isCreating || isUpdating || isDeleting || isSettingDefault || locating;
  useEffect(() => {
    if (userProfile) setAccount(userProfile);
  }, [userProfile]);

  const locate = async () => {
    if (locationPending.current) return;
    locationPending.current = true;
    setLocating(true);
    let value = { ...EMPTY_ADDRESS_FORM };
    let warning: string | undefined;
    try {
      const permission = await requestLocationPermission();
      const info = permission ? await getLocationInfo() : null;
      if (info)
        value = {
          ...value,
          province: info.province,
          city: info.city,
          district: info.district,
          detail: info.address,
        };
      else warning = t("addresses.location.failed");
    } catch (err) {
      warning = `${t("addresses.location.failed")} ${toAppError(err).message}`;
    } finally {
      locationPending.current = false;
      setLocating(false);
      setLocationOpen(false);
      setEditor({ value, notice: warning });
    }
  };
  const setDefault = async (address: Address) => {
    if (defaultPending.current || busy) return;
    defaultPending.current = true;
    setActionError(null);
    setNotice(null);
    try {
      await setDefaultAddress(address.addressId);
      setNotice(t("addresses.defaultSaved"));
    } catch (err) {
      setActionError(toAppError(err).message);
    } finally {
      defaultPending.current = false;
    }
  };

  if (!userProfile) return <div>{t("addresses.userNotFound")}</div>;
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: lantern.paper, color: lantern.ink, py: sp[8] }}>
      <Container maxWidth="md">
        <Box sx={{ mb: sp[6] }}>
          <Typography component="p" variant="body2" sx={{ color: lantern.inkSoft }}>
            {t("addresses.breadcrumb")}
          </Typography>
          <Typography
            component="h1"
            variant="h4"
            sx={{ fontFamily: lantern.serif, fontWeight: 900 }}
          >
            {t("addresses.title")}
          </Typography>
        </Box>
        <Paper elevation={0} sx={{ ...addressPaperSx, p: { xs: sp[4], sm: sp[6] } }}>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: sp[4],
              alignItems: "center",
              pb: sp[4],
              borderBottom: lantern.line,
            }}
          >
            <Typography component="h2" variant="h6" sx={{ fontFamily: lantern.serif }}>
              {t("addresses.myAddresses")}
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              disabled={busy}
              onClick={() => setLocationOpen(true)}
              sx={addressPrimarySx}
            >
              {t("addresses.add")}
            </Button>
          </Box>
          {error && (
            <Alert
              severity="error"
              sx={addressAlertSx}
              action={
                <Button
                  sx={addressActionSx}
                  onClick={() => {
                    void refetch();
                  }}
                >
                  {t("addresses.retry")}
                </Button>
              }
            >
              {t("addresses.loadFailed")} {toAppError(error).message}
            </Alert>
          )}
          {actionError && (
            <Alert severity="error" sx={addressAlertSx}>
              {actionError}
            </Alert>
          )}
          {notice && (
            <Alert severity="success" sx={addressAlertSx}>
              {notice}
            </Alert>
          )}
          <AddressList
            addresses={addresses}
            isLoading={isLoading}
            disabled={busy}
            onEdit={(address) =>
              setEditor({ addressId: address.addressId, value: toForm(address) })
            }
            onDelete={setDeleting}
            onSetDefault={(address) => {
              void setDefault(address);
            }}
          />
        </Paper>
        {editor && (
          <AddressEditDialog
            initialValue={editor.value}
            editing={!!editor.addressId}
            notice={editor.notice}
            isSaving={isCreating || isUpdating}
            onClose={() => setEditor(null)}
            onSave={(value) =>
              editor.addressId
                ? updateAddress({ ...value, addressId: editor.addressId })
                : createAddress(value)
            }
          />
        )}
        {deleting && (
          <AddressDeleteDialog
            recipient={deleting.recipientName}
            isDeleting={isDeleting}
            onClose={() => setDeleting(null)}
            onDelete={() => deleteAddress(deleting.addressId)}
          />
        )}
        {locationOpen && (
          <LocationPermissionDialog
            pending={locating}
            onConfirm={() => {
              void locate();
            }}
            onCancel={() => {
              setLocationOpen(false);
              setEditor({ value: { ...EMPTY_ADDRESS_FORM } });
            }}
          />
        )}
      </Container>
    </Box>
  );
}
