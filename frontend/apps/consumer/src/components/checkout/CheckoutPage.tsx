/** 结算：只提交服务端快照中的全部选中条目，地址与写操作复用查询层。 */
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  TextField,
  Typography,
} from "@mui/material";
import { MapPin } from "@ecommerce/icons";
import { useMemo, useRef, useState } from "react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { useMutation } from "@connectrpc/connect-query";
import { toAppError } from "@ecommerce/api";
import { orderService } from "@/gen/api";
import { useAddresses } from "@/hooks/useAddresses";
import { useCart } from "@/hooks/useCart";
import type { CartItem } from "@/store/cart";
import { AddressPickerDialog, addressFullText } from "@/components/address/AddressPickerDialog";
import { lantern, sp } from "@/styles/tokens";

const cardSx = {
  mx: sp[4],
  mt: sp[4],
  bgcolor: lantern.paperLit,
  color: lantern.ink,
  border: lantern.lineSoft,
  boxShadow: "none",
};
const actionSx = {
  bgcolor: lantern.vermilion,
  color: lantern.paperLit,
  "&:hover": { bgcolor: lantern.vermilionDeep },
};

export function CheckoutPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatCurrencyCents } = useFormat();
  const { items, serverItems, isInitializing, isRefreshing } = useCart();
  const {
    addresses,
    isLoading: addrLoading,
    isFetching: addrRefreshing,
    error: addressError,
  } = useAddresses();
  const [remark, setRemark] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const createOrder = useMutation(orderService.method.createOrder);
  const selectedItems = useMemo(() => items.filter((item) => item.selected), [items]);
  const activeAddressId =
    selectedAddressId ??
    addresses?.find((a) => a.isDefault)?.addressId ??
    addresses?.[0]?.addressId ??
    null;
  const selectedAddress = addresses?.find((a) => a.addressId === activeAddressId);
  // CreateOrder 只收条目 ID，数量/商品/单价以服务端为准。本地改数量尚未持久化时不能下单。
  const serverById = new Map(serverItems?.map((item) => [item.cartItemId, item]));
  const unsynced = selectedItems.some((item) => {
    const server = serverById.get(item.cartItemId);
    return (
      !/^[1-9]\d*$/.test(item.cartItemId) ||
      item.cartItemId.length > 19 ||
      BigInt(item.cartItemId) > 9223372036854775807n ||
      !server ||
      item.quantity !== server.quantity ||
      item.unitPriceCents !== server.unitPriceCents ||
      item.skuId !== server.skuId ||
      item.spuId !== server.spuId ||
      item.merchantId !== server.merchantId
    );
  });
  const canSubmit =
    !createOrder.isPending &&
    !isRefreshing &&
    !addrLoading &&
    !addrRefreshing &&
    !addressError &&
    !!selectedAddress &&
    selectedItems.length > 0 &&
    !unsynced;
  const total = selectedItems.reduce(
    (sum, item) => sum + item.unitPriceCents * BigInt(item.quantity),
    0n,
  );

  const handleSubmit = async () => {
    if (!canSubmit || !selectedAddress || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitError(null);
    try {
      // requestId 尚未进入 proto；这里只防当前页面重复点击，不宣称服务端幂等。
      await createOrder.mutateAsync({
        CartItemIds: selectedItems.map((item) => BigInt(item.cartItemId)),
        addressId: selectedAddress.addressId,
        remark,
      });
      void navigate({ to: "/payment/result" });
    } catch (error) {
      setSubmitError(toAppError(error).message || t("checkout.submitFailed"));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Box sx={{ bgcolor: lantern.paper, color: lantern.ink, minHeight: "100vh", pb: "112px" }}>
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          bgcolor: lantern.paper,
          p: sp[4],
          borderBottom: lantern.line,
        }}
      >
        <Typography component="h1" variant="h6" sx={{ fontFamily: lantern.serif, fontWeight: 700 }}>
          {t("checkout.title")}
        </Typography>
      </Box>
      {isInitializing ? (
        <Box sx={{ p: sp[8], textAlign: "center" }}>
          <CircularProgress sx={{ color: lantern.vermilion }} />
        </Box>
      ) : selectedItems.length === 0 ? (
        <Box sx={{ p: sp[8], textAlign: "center" }}>
          <Typography sx={{ mb: sp[4] }}>{t("checkout.noSelection")}</Typography>
          <Button component={Link} to="/cart" variant="contained" sx={actionSx}>
            {t("checkout.backToCart")}
          </Button>
        </Box>
      ) : (
        <>
          <Card sx={cardSx}>
            <CardContent>
              {addressError && <Alert severity="error">{toAppError(addressError).message}</Alert>}
              <Box
                component="button"
                type="button"
                onClick={() => setAddressDialogOpen(true)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: sp[3],
                  width: "100%",
                  p: sp[2],
                  border: 0,
                  bgcolor: "transparent",
                  color: lantern.ink,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <MapPin size={20} color={lantern.vermilion} />
                <Box component="span" sx={{ flex: 1 }}>
                  {selectedAddress ? (
                    <>
                      <Typography component="span" sx={{ display: "block" }}>
                        {selectedAddress.recipientName} {selectedAddress.recipientPhone}
                      </Typography>
                      <Typography component="span" variant="body2" sx={{ color: lantern.inkSoft }}>
                        {addressFullText(selectedAddress)}
                      </Typography>
                    </>
                  ) : (
                    t(addrLoading ? "checkout.addressLoading" : "checkout.addressPick")
                  )}
                </Box>
                <Typography component="span" variant="body2">
                  {t(selectedAddress ? "common:action.edit" : "checkout.select")}
                </Typography>
              </Box>
            </CardContent>
          </Card>
          <CheckoutItems items={selectedItems} />
          <Card sx={cardSx}>
            <CardContent>
              <Typography>{t("checkout.shipping.standard")}</Typography>
              <Typography variant="caption" sx={{ color: lantern.inkSoft }}>
                {t("checkout.shipping.eta")}
              </Typography>
              <Typography>{t("checkout.shipping.free")}</Typography>
            </CardContent>
          </Card>
          <Card sx={cardSx}>
            <CardContent>
              <TextField
                fullWidth
                label={t("checkout.remark.label")}
                placeholder={t("checkout.remark.placeholder")}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </CardContent>
          </Card>
          <Card sx={cardSx}>
            <CardContent>
              <AmountRow label={t("checkout.amount.goods")} value={formatCurrencyCents(total)} />
              <AmountRow label={t("checkout.amount.freight")} value={t("checkout.shipping.free")} />
              <Divider sx={{ my: sp[2], borderColor: lantern.bamboo }} />
              <AmountRow label={t("checkout.amount.total")} value={formatCurrencyCents(total)} />
            </CardContent>
          </Card>
          {unsynced && (
            <Alert severity="warning" sx={{ mx: sp[4], mt: sp[4] }}>
              {t("checkout.unsyncedItems")} <Link to="/cart">{t("checkout.backToCart")}</Link>
            </Alert>
          )}
          {submitError && (
            <Alert severity="error" sx={{ mx: sp[4], mt: sp[4] }}>
              {submitError}
            </Alert>
          )}
          <Box
            sx={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              bgcolor: lantern.paper,
              borderTop: lantern.line,
              p: sp[4],
              display: "flex",
              gap: sp[3],
              alignItems: "center",
              zIndex: 1,
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption">{t("checkout.amount.totalInline")}</Typography>
              <Typography
                component="p"
                variant="h6"
                sx={{
                  color: lantern.vermilion,
                  fontFamily: lantern.serif,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatCurrencyCents(total)}
              </Typography>
            </Box>
            <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit} sx={actionSx}>
              {createOrder.isPending ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                t("checkout.submit")
              )}
            </Button>
          </Box>
        </>
      )}
      {addressDialogOpen && (
        <AddressPickerDialog
          open
          addresses={addresses ?? []}
          loading={addrLoading}
          selectedAddressId={activeAddressId}
          onClose={() => setAddressDialogOpen(false)}
          onSelect={(id) => {
            setSelectedAddressId(id);
            setAddressDialogOpen(false);
          }}
        />
      )}
    </Box>
  );
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: sp[3] }}>
      <Typography>{label}</Typography>
      <Typography>{value}</Typography>
    </Box>
  );
}

function CheckoutItems({ items }: { items: CartItem[] }) {
  const { t } = useTranslation();
  const { formatCurrencyCents } = useFormat();
  const groups = new Map<string, CartItem[]>();
  for (const item of items)
    groups.set(item.merchantId, [...(groups.get(item.merchantId) ?? []), item]);
  return (
    <>
      {[...groups].map(([merchantId, products]) => (
        <Card key={merchantId} sx={cardSx}>
          <CardContent>
            <Typography component="h2" variant="body1" sx={{ fontWeight: 600, mb: sp[3] }}>
              {products[0]?.shopName || t("checkout.shop")}
            </Typography>
            {products.map((item) => (
              <Box key={item.cartItemId} sx={{ display: "flex", gap: sp[3], mb: sp[3] }}>
                {item.skuThumbnailUrl && (
                  <Box
                    component="img"
                    src={item.skuThumbnailUrl}
                    alt={item.spuName}
                    sx={{ width: 64, height: 64, objectFit: "cover", bgcolor: lantern.paperAsh }}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography>{item.spuName}</Typography>
                  <Typography variant="caption" sx={{ color: lantern.inkSoft }}>
                    {item.skuName} ×{item.quantity}
                  </Typography>
                  <Typography sx={{ color: lantern.vermilion, fontFamily: lantern.serif }}>
                    {formatCurrencyCents(item.unitPriceCents)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
