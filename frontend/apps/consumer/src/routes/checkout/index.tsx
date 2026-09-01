/**
 * 结算确认页面
 *
 * 数据来源：
 * - 商品：进页时由 useCart 从后端重拉购物车，取「已选中」项（按商家分组展示）
 * - 地址：AddressService 地址列表，页内弹层选择 / 新增（调用 createAddress）
 *
 * 下单：点「提交订单」→ orderService.CreateOrder → 跳支付页
 * 说明：优惠券/发货微服务暂未实现，运费恒 0（仅展示「免运费」），无优惠。
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Radio,
  TextField,
  Typography,
} from "@mui/material";
import { Check, MapPin, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { useMutation } from "@connectrpc/connect-query";
import { toAppError } from "@ecommerce/api";
import { orderService } from "@/gen/api";
import type { Address, AddressFormData } from "@/api/addresses/types";
import { useAddresses } from "@/hooks/useAddresses";
import { useCart } from "@/hooks/useCart";
import type { CartItem } from "@/store/cart";
import { sp, tokens } from "@/styles/tokens";

export const Route = createFileRoute("/checkout/")({
  component: CheckoutPage,
});

interface MerchantGroup {
  merchantId: string;
  shopName: string;
  items: CartItem[];
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatCurrencyCents } = useFormat();
  const { items, isInitializing } = useCart();
  const { addresses, isLoading: addrLoading } = useAddresses();

  const [remark, setRemark] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createOrder = useMutation(orderService.method.createOrder);
  const submitting = createOrder.isPending;

  // 已选中的购物车项，按商家分组
  const selectedItems = useMemo(() => items.filter((i) => i.selected), [items]);
  const merchantGroups = useMemo<MerchantGroup[]>(() => {
    const map = new Map<string, MerchantGroup>();
    for (const it of selectedItems) {
      if (!map.has(it.merchantId)) {
        map.set(it.merchantId, {
          merchantId: it.merchantId,
          shopName: it.shopName ?? "",
          items: [],
        });
      }
      map.get(it.merchantId)!.items.push(it);
    }
    return Array.from(map.values());
  }, [selectedItems]);

  // 默认选中默认地址（无默认则取第一个）
  useEffect(() => {
    if (!selectedAddressId && addresses && addresses.length > 0) {
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      setSelectedAddressId(def.addressId);
    }
  }, [addresses, selectedAddressId]);

  const selectedAddress = addresses?.find((a) => a.addressId === selectedAddressId) ?? null;

  const totalAmountCents = useMemo(
    () =>
      selectedItems.reduce((sum, item) => sum + item.unitPriceCents * BigInt(item.quantity), 0n),
    [selectedItems],
  );
  const freightCents = 0n;
  const payAmountCents = totalAmountCents + freightCents;

  const canSubmit = !submitting && !!selectedAddressId && selectedItems.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedAddressId) return;
    setSubmitError(null);
    try {
      // TODO 防重令牌：proto 的 CreateOrderRequest 还没有 requestId 字段，
      // 补字段并 `cd backend && make api` 之后再在这里带上，否则重复提交会建多单。
      await createOrder.mutateAsync({
        // 仅纯数字的 ID 才转 BigInt：本地临时购物车项的 ID 不是数字，
        // 直接进 BigInt() 会在提交时抛错
        CartItemIds: selectedItems
          .map((i) => i.cartItemId)
          .filter((id) => /^\d+$/.test(id))
          .map((id) => BigInt(id)),
        addressId: selectedAddressId,
        remark,
      });
      // 后端响应暂无 orderNo，先跳固定支付页占位
      void navigate({ to: "/payment/result" });
    } catch (err) {
      setSubmitError(toAppError(err).message || t("checkout.submitFailed"));
    }
  };

  // 加载中
  if (isInitializing) {
    return (
      <Box sx={{ bgcolor: tokens.colors.background.primary, minHeight: "100vh" }}>
        <CheckoutHeader />
        <Box sx={{ display: "flex", justifyContent: "center", py: sp[16] }}>
          <CircularProgress sx={{ color: tokens.colors.accent.black }} />
        </Box>
      </Box>
    );
  }

  // 无选中商品
  if (selectedItems.length === 0) {
    return (
      <Box sx={{ bgcolor: tokens.colors.background.primary, minHeight: "100vh" }}>
        <CheckoutHeader />
        <Box sx={{ textAlign: "center", py: sp[16], px: sp[4] }}>
          <Typography variant="body1" sx={{ color: tokens.colors.text.secondary, mb: sp[4] }}>
            {t("checkout.noSelection")}
          </Typography>
          <Button
            component={Link}
            to="/cart"
            variant="contained"
            sx={{ bgcolor: tokens.colors.accent.red, "&:hover": { bgcolor: "#dc2626" } }}
          >
            {t("checkout.backToCart")}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: tokens.colors.background.primary, minHeight: "100vh", pb: "96px" }}>
      <CheckoutHeader />

      {/* 收货地址 */}
      <Card sx={{ mx: sp[4], mt: sp[4] }}>
        <CardContent sx={{ p: sp[4] }}>
          <Box
            component="button"
            onClick={() => setAddressDialogOpen(true)}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: sp[3],
              width: "100%",
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
              textAlign: "left",
              p: 0,
            }}
          >
            <MapPin
              size={20}
              color={tokens.colors.accent.red}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {selectedAddress ? (
                <>
                  <Box sx={{ display: "flex", alignItems: "center", gap: sp[2], mb: sp[1] }}>
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 600, color: tokens.colors.text.primary }}
                    >
                      {selectedAddress.recipientName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                      {selectedAddress.recipientPhone}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                    {addressFullText(selectedAddress)}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                  {addrLoading ? t("checkout.addressLoading") : t("checkout.addressPick")}
                </Typography>
              )}
            </Box>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary, flexShrink: 0 }}>
              {selectedAddress ? t("common:action.edit") : t("checkout.select")}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 商品列表（按商家分组） */}
      {merchantGroups.map((group) => (
        <Card key={group.merchantId} sx={{ mx: sp[4], mt: sp[4] }}>
          <CardContent sx={{ p: sp[4] }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: tokens.colors.text.primary, mb: sp[3] }}
            >
              {group.shopName || t("checkout.shop")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: sp[3] }}>
              {group.items.map((item) => (
                <Box key={item.cartItemId} sx={{ display: "flex", gap: sp[3] }}>
                  <Box
                    component="img"
                    src={item.skuThumbnailUrl}
                    alt={item.spuName}
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: tokens.radius.md,
                      objectFit: "cover",
                      bgcolor: tokens.colors.background.primary,
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: tokens.colors.text.primary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.spuName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                      {item.skuName}
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mt: sp[1] }}>
                      <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                        x{item.quantity}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: tokens.colors.accent.red }}
                      >
                        {formatCurrencyCents(item.unitPriceCents)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      ))}

      {/* 配送方式（暂无发货服务，恒免运费，仅展示） */}
      <Card sx={{ mx: sp[4], mt: sp[4] }}>
        <CardContent sx={{ p: sp[4] }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, color: tokens.colors.text.primary }}
              >
                {t("checkout.shipping.standard")}
              </Typography>
              <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                {t("checkout.shipping.eta")}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              {t("checkout.shipping.free")}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 订单备注 */}
      <Card sx={{ mx: sp[4], mt: sp[4] }}>
        <CardContent sx={{ p: sp[4] }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: sp[3] }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: tokens.colors.text.primary, flexShrink: 0 }}
            >
              {t("checkout.remark.label")}
            </Typography>
            <Box
              component="input"
              type="text"
              placeholder={t("checkout.remark.placeholder")}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              sx={{
                flex: 1,
                border: "none",
                outline: "none",
                bgcolor: "transparent",
                fontSize: "0.875rem",
                color: tokens.colors.text.primary,
                "&::placeholder": { color: tokens.colors.text.disabled },
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* 金额明细 */}
      <Card sx={{ mx: sp[4], mt: sp[4] }}>
        <CardContent sx={{ p: sp[4] }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: sp[2] }}>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              {t("checkout.amount.goods")}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              {formatCurrencyCents(totalAmountCents)}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: sp[2] }}>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              {t("checkout.amount.freight")}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              {t("checkout.shipping.free")}
            </Typography>
          </Box>
          <Divider sx={{ my: sp[2] }} />
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
              {t("checkout.amount.total")}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: tokens.colors.accent.red }}>
              {formatCurrencyCents(payAmountCents)}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {submitError && (
        <Alert severity="error" sx={{ mx: sp[4], mt: sp[4] }}>
          {submitError}
        </Alert>
      )}

      {/* 底部提交栏 */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: tokens.colors.background.card,
          borderTop: `1px solid ${tokens.colors.border.default}`,
          p: sp[4],
          display: "flex",
          alignItems: "center",
          gap: sp[3],
          zIndex: tokens.zIndex.sticky,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
            {t("checkout.amount.totalInline")}
          </Typography>
          {/* 金额是数值不是标题：component="p" 让它退出标题树（variant 仅保留字号） */}
          <Typography
            variant="h6"
            component="p"
            sx={{ fontWeight: 700, color: tokens.colors.accent.red }}
          >
            {formatCurrencyCents(payAmountCents)}
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          sx={{
            bgcolor: tokens.colors.accent.red,
            px: sp[6],
            "&:hover": { bgcolor: "#dc2626" },
          }}
        >
          {submitting ? (
            <CircularProgress size={20} sx={{ color: "#fff" }} />
          ) : (
            t("checkout.submit")
          )}
        </Button>
      </Box>

      {/* 地址选择弹层 */}
      <AddressPickerDialog
        open={addressDialogOpen}
        addresses={addresses ?? []}
        loading={addrLoading}
        selectedAddressId={selectedAddressId}
        onClose={() => setAddressDialogOpen(false)}
        onSelect={(id) => {
          setSelectedAddressId(id);
          setAddressDialogOpen(false);
        }}
      />
    </Box>
  );
}

// 顶部标题
function CheckoutHeader() {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: tokens.zIndex.sticky,
        bgcolor: tokens.colors.background.card,
        p: sp[4],
        borderBottom: `1px solid ${tokens.colors.border.default}`,
      }}
    >
      <Typography
        variant="h6"
        component="h1"
        sx={{ fontWeight: 700, color: tokens.colors.text.primary }}
      >
        {t("checkout.title")}
      </Typography>
    </Box>
  );
}

// 地址完整文本
function addressFullText(a: Address): string {
  const d = a.detail;
  return `${d?.province ?? ""} ${d?.city ?? ""} ${d?.district ?? ""} ${d?.detail ?? ""}`.trim();
}

const emptyAddressForm: AddressFormData = {
  recipientName: "",
  recipientPhone: "",
  province: "",
  city: "",
  district: "",
  detail: "",
  isDefault: false,
};

// 地址选择弹层：列表选择 + 新增
function AddressPickerDialog({
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
  onSelect: (addressId: string) => void;
}) {
  const { t } = useTranslation();
  const { createAddress, isCreating } = useAddresses();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AddressFormData>(emptyAddressForm);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setForm(emptyAddressForm);
    setFormError(null);
    setAdding(false);
  };

  const handleCreate = () => {
    setFormError(null);
    if (
      !form.recipientName ||
      !form.recipientPhone ||
      !form.province ||
      !form.city ||
      !form.district ||
      !form.detail
    ) {
      setFormError(t("checkout.address.required"));
      return;
    }
    // 调用地址微服务新增地址；成功后 useAddresses 会刷新列表
    createAddress(form);
    resetForm();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {t("checkout.address.pickerTitle")}
        <IconButton onClick={onClose} sx={{ p: 0 }}>
          <X size={20} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ textAlign: "center", py: sp[8] }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: sp[2] }}>
            {addresses.map((a) => (
              <Box
                key={a.addressId}
                component="button"
                onClick={() => onSelect(a.addressId)}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: sp[2],
                  p: sp[3],
                  width: "100%",
                  textAlign: "left",
                  border: `1px solid ${tokens.colors.border.default}`,
                  borderRadius: tokens.radius.lg,
                  bgcolor: "transparent",
                  cursor: "pointer",
                }}
              >
                <Radio
                  checked={a.addressId === selectedAddressId}
                  size="small"
                  sx={{ p: 0, mt: "2px" }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: sp[2], mb: sp[1] }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: tokens.colors.text.primary }}
                    >
                      {a.recipientName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                      {a.recipientPhone}
                    </Typography>
                    {a.isDefault && (
                      <Box
                        sx={{
                          px: sp[1],
                          borderRadius: tokens.radius.sm,
                          bgcolor: tokens.colors.accent.red,
                          color: "#fff",
                          fontSize: "0.625rem",
                        }}
                      >
                        {t("checkout.address.default")}
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                    {addressFullText(a)}
                  </Typography>
                </Box>
              </Box>
            ))}

            {!adding && (
              <Button
                startIcon={<Plus size={16} />}
                onClick={() => setAdding(true)}
                sx={{
                  alignSelf: "flex-start",
                  color: tokens.colors.accent.red,
                  textTransform: "none",
                }}
              >
                {t("checkout.address.add")}
              </Button>
            )}

            {adding && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: sp[3], mt: sp[2] }}>
                {formError && <Alert severity="error">{formError}</Alert>}
                <Box sx={{ display: "flex", gap: sp[3] }}>
                  <TextField
                    label={t("checkout.address.recipient")}
                    size="small"
                    fullWidth
                    value={form.recipientName}
                    onChange={(e) => setForm((p) => ({ ...p, recipientName: e.target.value }))}
                  />
                  <TextField
                    label={t("checkout.address.phone")}
                    size="small"
                    fullWidth
                    value={form.recipientPhone}
                    onChange={(e) => setForm((p) => ({ ...p, recipientPhone: e.target.value }))}
                  />
                </Box>
                <Box sx={{ display: "flex", gap: sp[3] }}>
                  <TextField
                    label={t("checkout.address.province")}
                    size="small"
                    fullWidth
                    value={form.province}
                    onChange={(e) => setForm((p) => ({ ...p, province: e.target.value }))}
                  />
                  <TextField
                    label={t("checkout.address.city")}
                    size="small"
                    fullWidth
                    value={form.city}
                    onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  />
                  <TextField
                    label={t("checkout.address.district")}
                    size="small"
                    fullWidth
                    value={form.district}
                    onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))}
                  />
                </Box>
                <TextField
                  label={t("checkout.address.detail")}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={form.detail}
                  onChange={(e) => setForm((p) => ({ ...p, detail: e.target.value }))}
                />
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Checkbox
                    checked={form.isDefault}
                    onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                    size="small"
                    sx={{ p: 0, mr: sp[2] }}
                  />
                  <Typography variant="body2">{t("checkout.address.setDefault")}</Typography>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      {adding && (
        <DialogActions>
          <Button onClick={resetForm} disabled={isCreating} sx={{ textTransform: "none" }}>
            {t("common:action.cancel")}
          </Button>
          <Button
            variant="contained"
            startIcon={<Check size={16} />}
            onClick={handleCreate}
            disabled={isCreating}
            sx={{
              textTransform: "none",
              bgcolor: tokens.colors.accent.red,
              "&:hover": { bgcolor: "#dc2626" },
            }}
          >
            {isCreating ? t("checkout.address.saving") : t("checkout.address.save")}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
