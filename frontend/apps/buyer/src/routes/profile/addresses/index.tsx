import { Add, Close, Delete, Edit } from "@mui/icons-material";
import {
  Alert,
  Backdrop,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Address } from "@/api/addresses/types";
import { getLocationInfo, requestLocationPermission } from "@/api/location";
import { useAddresses } from "@/hooks/useAddresses";
import { useGetUserProfile } from "@/hooks/useProfile";
import { addNotification } from "@/store/notifications";
import { setAccount } from "@/store/users";
import { isTokenExpired } from "@ecommerce/utils";

export const Route = createFileRoute("/profile/addresses/")({
  component: RouteComponent,
  beforeLoad: ({ location }) => {
    const token = localStorage.getItem("token");
    if (isTokenExpired(typeof token === "string" ? token : "")) {
      console.warn("Token已过期，请重新登录或尝试刷新。");

      addNotification({
        message: "Token已过期，请重新登录或尝试刷新。即将回到首页",
        severity: "warning",
      });

      setAccount({});
      localStorage.removeItem("token");

      throw redirect({
        to: "/",
        search: { redirect: location.href },
      });
    }
  },
});

function RouteComponent() {
  const { data: userProfile, isLoading: profileLoading, error: profileError } = useGetUserProfile();
  const {
    addresses,
    isLoading,
    error: addressError,
    createAddress,
    updateAddress,
    deleteAddress,
    refetch,
  } = useAddresses();
  const [openDialog, setOpenDialog] = useState(false);
  const [openLocationPermissionDialog, setOpenLocationPermissionDialog] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<Address | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    province: "",
    city: "",
    district: "",
    address: "",
    isDefault: false,
  });

  useEffect(() => {
    if (userProfile) {
      setAccount(userProfile);
    }
  }, [userProfile]);

  if (!userProfile) return <div>未找到用户</div>;

  const handleOpenDialog = (address: Address | null = null) => {
    if (address) {
      // 编辑现有地址，直接打开编辑对话框
      setCurrentAddress(address);
      setFormData({
        name: address.name,
        phone: address.phone,
        province: address.province,
        city: address.city,
        district: address.district,
        address: address.address,
        isDefault: address.isDefault,
      });
      setOpenDialog(true);
    } else {
      // 添加新地址，先弹出位置权限请求
      setCurrentAddress(null);
      setFormData({
        name: "",
        phone: "",
        province: "",
        city: "",
        district: "",
        address: "",
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
            address: locationInfo.address,
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

  const handleDeleteAddress = (id: string) => {
    deleteAddress(id);
  };

  const handleSaveAddress = () => {
    setFormError(null);
    // 简单验证
    if (
      !formData.name ||
      !formData.phone ||
      !formData.province ||
      !formData.city ||
      !formData.district ||
      !formData.address
    ) {
      setFormError("请填写所有必填字段");
      return;
    }

    if (currentAddress) {
      // 更新现有地址
      updateAddress({ ...formData, id: currentAddress.id });
    } else {
      // 创建新地址
      createAddress(formData);
    }
    setOpenDialog(false);
  };

  return (
    // <ErrorHandler error={profileError} loading={profileLoading}>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Paper
          elevation={0}
          sx={{
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(255, 255, 255, 0.8)",
            borderRadius: "16px",
            padding: "24px",
            mb: 4,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 4,
            }}
          >
            <Typography variant="h4" component="h1" sx={{ fontWeight: "bold" }}>
              地址管理
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Add />}
              onClick={() => handleOpenDialog()}
              sx={{
                borderRadius: "8px",
                textTransform: "none",
                fontWeight: "medium",
              }}
            >
              添加新地址
            </Button>
          </Box>

          <Divider sx={{ mb: 4 }} />

          {addressError && (
            <Alert severity="error" sx={{ mb: 4 }}>
              加载地址失败，请重试
            </Alert>
          )}

          <List sx={{ width: "100%" }}>
            {addresses?.map((address) => (
              <ListItem
                key={address.id}
                sx={{
                  mb: 2,
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 255, 255, 0.6)",
                }}
              >
                <ListItemText
                  primary={
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: "medium" }}>
                        {address.name} {address.phone}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {address.province}
                        {address.city}
                        {address.district}
                        {address.address}
                      </Typography>
                      {address.isDefault && (
                        <Box sx={{ mt: 1, display: "inline-block" }}>
                          <Typography
                            variant="caption"
                            sx={{
                              backgroundColor: "primary.main",
                              color: "white",
                              px: 1,
                              py: 0.25,
                              borderRadius: "4px",
                            }}
                          >
                            默认
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    aria-label="edit"
                    onClick={() => handleOpenDialog(address)}
                  >
                    <Edit />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleDeleteAddress(address.id)}
                  >
                    <Delete />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>

          {isLoading ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                加载中...
              </Typography>
            </Box>
          ) : (
            addresses?.length === 0 && (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  暂无地址，请添加新地址
                </Typography>
              </Box>
            )
          )}
        </Paper>

        <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
          <DialogTitle
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {currentAddress ? "编辑地址" : "添加新地址"}
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
                label="收件人"
                fullWidth
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                sx={{ mb: 2 }}
              />
              <TextField
                label="手机号码"
                fullWidth
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                sx={{ mb: 2 }}
              />
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
              <FormControl fullWidth>
                <InputLabel id="province-label">省份</InputLabel>
                <Select
                  labelId="province-label"
                  value={formData.province}
                  label="省份"
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                >
                  <MenuItem value="广东省">广东省</MenuItem>
                  <MenuItem value="北京市">北京市</MenuItem>
                  <MenuItem value="上海市">上海市</MenuItem>
                  <MenuItem value="江苏省">江苏省</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="city-label">城市</InputLabel>
                <Select
                  labelId="city-label"
                  value={formData.city}
                  label="城市"
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                >
                  <MenuItem value="深圳市">深圳市</MenuItem>
                  <MenuItem value="北京市">北京市</MenuItem>
                  <MenuItem value="上海市">上海市</MenuItem>
                  <MenuItem value="南京市">南京市</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="district-label">区/县</InputLabel>
                <Select
                  labelId="district-label"
                  value={formData.district}
                  label="区/县"
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                >
                  <MenuItem value="南山区">南山区</MenuItem>
                  <MenuItem value="朝阳区">朝阳区</MenuItem>
                  <MenuItem value="浦东新区">浦东新区</MenuItem>
                  <MenuItem value="玄武区">玄武区</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <TextField
              label="详细地址"
              fullWidth
              multiline
              rows={3}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <input
                type="checkbox"
                id="default"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                style={{ marginRight: "8px" }}
              />
              <label htmlFor="default">设为默认地址</label>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} disabled={isLoading} sx={{ textTransform: "none" }}>
              取消
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveAddress}
              disabled={isLoading}
              sx={{ textTransform: "none" }}
            >
              {isLoading ? "保存中..." : "保存"}
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
            位置权限请求
            <IconButton onClick={handleLocationPermissionCancel} sx={{ padding: 0 }}>
              <Close />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              我们将通过您的 IP
              地址或地址权限为您推荐省市区信息，相关数据由第三方高德地图处理，是否同意？
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleLocationPermissionCancel} sx={{ textTransform: "none" }}>
              取消
            </Button>
            <Button
              variant="contained"
              onClick={handleLocationPermissionConfirm}
              disabled={isGettingLocation}
              sx={{ textTransform: "none" }}
            >
              {isGettingLocation ? "获取中..." : "同意"}
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
    // </ErrorHandler>
  );
}
