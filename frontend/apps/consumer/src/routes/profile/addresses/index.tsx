import { Add, Close, Delete, Edit, LocationOn } from "@mui/icons-material";
import {
  Alert,
  Backdrop,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Address, AddressFormData } from "@/api/addresses/types";
import { getLocationInfo, requestLocationPermission } from "@/api/location";
import { RegionSelect } from "@/components/address/RegionSelect";
import { useAddresses } from "@/hooks/useAddresses";
import { useGetUserProfile } from "@/hooks/useProfile";
import { setAccount } from "@/store/users";
import { i18next, useTranslation } from "@ecommerce/i18n";
import { fetchIdentity } from "@ecommerce/configs";
import { addNotification } from "@ecommerce/utils";

export const Route = createFileRoute("/profile/addresses/")({
  component: RouteComponent,
  // 登录态以网关的 /auth/me 为准（BFF 会话，见 control-tower ADR-0002）。
  // 不能再看「内存里有没有令牌」——BFF 下前端根本没有令牌，那样判会把
  // 已登录用户误踢去登录页。
  beforeLoad: async ({ context }) => {
    const identity = await fetchIdentity();
    if (!identity.authenticated) {
      addNotification({
        // beforeLoad 不是组件环境，用 i18next 的 t
        message: i18next.t("consumer:addresses.loginRequired"),
        severity: "warning",
      });
      if (context?.auth?.login) {
        context.auth.login();
      }
    }
  },
});

function RouteComponent() {
  const { data: userProfile } = useGetUserProfile();
  const { t } = useTranslation();
  const {
    addresses,
    isLoading,
    error: addressError,
    createAddress,
    updateAddress,
    deleteAddress,
  } = useAddresses();
  const [openDialog, setOpenDialog] = useState(false);
  const [openLocationPermissionDialog, setOpenLocationPermissionDialog] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<Address | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  // 所选城市下有没有区县可选。省直辖县级行政区（琼海市、仙桃市等）没有下级，
  // 这时把区县当必填会让这些地方的用户根本提交不了
  const [districtRequired, setDistrictRequired] = useState(false);
  const [formData, setFormData] = useState<AddressFormData>({
    recipientName: "",
    recipientPhone: "",
    province: "",
    city: "",
    district: "",
    detail: "",
    isDefault: false,
  });

  useEffect(() => {
    if (userProfile) {
      setAccount(userProfile);
    }
  }, [userProfile]);

  if (!userProfile) return <div>{t("addresses.userNotFound")}</div>;

  const handleOpenDialog = (address: Address | null = null) => {
    if (address) {
      // 编辑现有地址，直接打开编辑对话框
      setCurrentAddress(address);
      setFormData({
        recipientName: address.recipientName,
        recipientPhone: address.recipientPhone,
        province: address.detail?.province ?? "",
        city: address.detail?.city ?? "",
        district: address.detail?.district ?? "",
        detail: address.detail?.detail ?? "",
        isDefault: address.isDefault,
      });
      setOpenDialog(true);
    } else {
      // 添加新地址，先弹出位置权限请求
      setCurrentAddress(null);
      setFormData({
        recipientName: "",
        recipientPhone: "",
        province: "",
        city: "",
        district: "",
        detail: "",
        isDefault: false,
      });
      setOpenLocationPermissionDialog(true);
    }
  };

  const handleLocationPermissionConfirm = async () => {
    setOpenLocationPermissionDialog(false);
    setIsGettingLocation(true);
    try {
      // 请求位置权限
      const hasPermission = await requestLocationPermission();
      if (hasPermission) {
        // 获取位置信息
        const locationInfo = await getLocationInfo();
        if (locationInfo) {
          // 更新表单数据
          setFormData((prev) => ({
            ...prev,
            province: locationInfo.province,
            city: locationInfo.city,
            district: locationInfo.district,
            detail: locationInfo.address,
          }));
        }
      }
    } catch (error) {
      console.error("获取位置信息失败:", error);
    } finally {
      setIsGettingLocation(false);
      setOpenDialog(true);
    }
  };

  const handleLocationPermissionCancel = () => {
    setOpenLocationPermissionDialog(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentAddress(null);
    setFormError(null);
  };

  const handleDeleteAddress = (addressId: string) => {
    deleteAddress(addressId);
  };

  const handleSaveAddress = () => {
    setFormError(null);
    // 简单验证
    if (
      !formData.recipientName ||
      !formData.recipientPhone ||
      !formData.province ||
      !formData.city ||
      (districtRequired && !formData.district) ||
      !formData.detail
    ) {
      setFormError(t("addresses.form.required"));
      return;
    }

    if (currentAddress) {
      // 更新现有地址
      updateAddress({ ...formData, addressId: currentAddress.addressId });
    } else {
      // 创建新地址
      createAddress(formData);
    }
    setOpenDialog(false);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8f9ff 0%, #ffffff 100%)",
        py: 4,
      }}
    >
      <Container maxWidth="md">
        {/* 页面标题 */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("addresses.breadcrumb")}
          </Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: "text.primary" }}>
            {t("addresses.title")}
          </Typography>
        </Box>

        <Paper
          elevation={0}
          sx={{
            borderRadius: "20px",
            border: "1px solid rgba(102, 126, 234, 0.1)",
            boxShadow: "0 4px 24px rgba(102, 126, 234, 0.06)",
            overflow: "hidden",
          }}
        >
          {/* 头部区域 */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 3,
              borderBottom: "1px solid rgba(102, 126, 234, 0.08)",
              background:
                "linear-gradient(135deg, rgba(102, 126, 234, 0.03) 0%, rgba(118, 75, 162, 0.03) 100%)",
            }}
          >
            <Typography variant="h6" component="h2" sx={{ fontWeight: 600, color: "text.primary" }}>
              {t("addresses.myAddresses")}
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleOpenDialog()}
              sx={{
                borderRadius: "10px",
                textTransform: "none",
                fontWeight: 600,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                boxShadow: "0 4px 12px rgba(102, 126, 234, 0.3)",
                "&:hover": {
                  background: "linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%)",
                },
              }}
            >
              {t("addresses.add")}
            </Button>
          </Box>

          {/* 内容区域 */}
          <Box sx={{ p: 3 }}>
            {addressError && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: "12px" }}>
                {t("addresses.loadFailed")}
              </Alert>
            )}

            <List sx={{ width: "100%" }}>
              {addresses?.map((address) => (
                <ListItem
                  key={address.addressId}
                  sx={{
                    mb: 2,
                    borderRadius: "16px",
                    border: "1px solid rgba(102, 126, 234, 0.1)",
                    backgroundColor: "white",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: "rgba(102, 126, 234, 0.3)",
                      boxShadow: "0 4px 16px rgba(102, 126, 234, 0.1)",
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
                        {/* 收件人姓名/电话是列表项内容不是标题：subtitle1 默认渲染成 h6，
                            读屏按标题导航会念出一串人名电话。ListItemText primary 已是
                            <span>，这里用 span 而非 p 以免 p 嵌进 span 的非法嵌套 */}
                        <Typography variant="subtitle1" component="span" sx={{ fontWeight: 600 }}>
                          {address.recipientName}
                        </Typography>
                        <Typography
                          variant="subtitle1"
                          component="span"
                          sx={{ fontWeight: 600, color: "text.primary" }}
                        >
                          {address.recipientPhone}
                        </Typography>
                        {address.isDefault && (
                          <Box
                            sx={{
                              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                              color: "white",
                              px: 1.5,
                              py: 0.5,
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                            }}
                          >
                            {t("addresses.default")}
                          </Box>
                        )}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                        <LocationOn sx={{ fontSize: 16, color: "text.secondary", mt: 0.3 }} />
                        <Typography variant="body2" color="text.secondary">
                          {address.detail?.province} {address.detail?.city}{" "}
                          {address.detail?.district} {address.detail?.detail}
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <IconButton
                        edge="end"
                        aria-label="edit"
                        onClick={() => handleOpenDialog(address)}
                        size="small"
                        sx={{
                          color: "#667eea",
                          "&:hover": {
                            backgroundColor: "rgba(102, 126, 234, 0.1)",
                          },
                        }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDeleteAddress(address.addressId)}
                        size="small"
                        sx={{
                          color: "#f44336",
                          "&:hover": {
                            backgroundColor: "rgba(244, 67, 54, 0.1)",
                          },
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>

            {isLoading ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  {t("common:state.loading")}
                </Typography>
              </Box>
            ) : (
              addresses?.length === 0 && (
                <Box sx={{ textAlign: "center", py: 6 }}>
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mx: "auto",
                      mb: 2,
                    }}
                  >
                    <LocationOn sx={{ fontSize: 40, color: "#667eea" }} />
                  </Box>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                    {t("addresses.empty.title")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("addresses.empty.desc")}
                  </Typography>
                </Box>
              )
            )}
          </Box>
        </Paper>

        <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
          <DialogTitle
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {currentAddress ? t("addresses.edit") : t("addresses.add")}
            <IconButton onClick={handleCloseDialog} sx={{ padding: 0 }}>
              <Close />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}
            <Box sx={{ mt: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label={t("addresses.form.recipient")}
                fullWidth
                value={formData.recipientName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, recipientName: e.target.value }))
                }
                sx={{ mb: 2 }}
              />
              <TextField
                label={t("addresses.form.phone")}
                fullWidth
                value={formData.recipientPhone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, recipientPhone: e.target.value }))
                }
                sx={{ mb: 2 }}
              />
            </Box>
            <RegionSelect
              value={{
                province: formData.province,
                city: formData.city,
                district: formData.district,
              }}
              onChange={(region) => setFormData((prev) => ({ ...prev, ...region }))}
              onDistrictRequiredChange={setDistrictRequired}
            />
            <TextField
              label={t("addresses.form.detail")}
              fullWidth
              multiline
              rows={3}
              value={formData.detail}
              onChange={(e) => setFormData((prev) => ({ ...prev, detail: e.target.value }))}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <Checkbox
                checked={formData.isDefault}
                onChange={(e) => setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))}
                sx={{
                  color: "#667eea",
                  "&.Mui-checked": {
                    color: "#667eea",
                  },
                }}
              />
              <Typography variant="body2">{t("addresses.form.setDefault")}</Typography>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} disabled={isLoading} sx={{ textTransform: "none" }}>
              {t("common:action.cancel")}
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveAddress}
              disabled={isLoading}
              sx={{ textTransform: "none" }}
            >
              {isLoading ? t("addresses.saving") : t("common:action.save")}
            </Button>
          </DialogActions>
        </Dialog>

        <Backdrop
          open={isLoading}
          sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        >
          <CircularProgress color="inherit" />
        </Backdrop>

        {/* 位置权限请求对话框 */}
        <Dialog
          open={openLocationPermissionDialog}
          onClose={handleLocationPermissionCancel}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {t("addresses.location.title")}
            <IconButton onClick={handleLocationPermissionCancel} sx={{ padding: 0 }}>
              <Close />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {t("addresses.location.desc")}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleLocationPermissionCancel} sx={{ textTransform: "none" }}>
              {t("common:action.cancel")}
            </Button>
            <Button
              variant="contained"
              onClick={handleLocationPermissionConfirm}
              disabled={isGettingLocation}
              sx={{ textTransform: "none" }}
            >
              {isGettingLocation ? t("addresses.location.getting") : t("addresses.location.agree")}
            </Button>
          </DialogActions>
        </Dialog>

        <Backdrop
          open={isGettingLocation}
          sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        >
          <CircularProgress color="inherit" />
        </Backdrop>
      </Container>
    </Box>
  );
}
