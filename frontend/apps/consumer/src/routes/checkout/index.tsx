/**
 * 结算确认页面
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { tokens } from "@/styles/tokens";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/checkout/")({
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();

  // 模拟数据
  const address = {
    id: "addr-001",
    name: "张三",
    phone: "138****1234",
    detail: "北京市朝阳区建国路88号SOHO现代城1号楼101室",
    isDefault: true,
  };

  const cartItems = [
    {
      id: "cart-001",
      merchantId: "m001",
      merchantName: "优品数码旗舰店",
      items: [
        {
          id: "item-001",
          name: "iPhone 15 Pro Max 256GB 钛金色",
          price: 9999,
          quantity: 1,
          image: "",
          specs: "钛金色/256GB",
          selected: true,
        },
      ],
    },
    {
      id: "cart-002",
      merchantId: "m002",
      merchantName: "苹果官方旗舰店",
      items: [
        {
          id: "item-002",
          name: "AirPods Pro 2",
          price: 1899,
          quantity: 2,
          image: "",
          specs: "USB-C",
          selected: true,
        },
      ],
    },
  ];

  const [remark, setRemark] = useState("");
  const [couponAmount, setCouponAmount] = useState(0);
  const [freight] = useState(0);

  // 计算金额
  const totalAmount = cartItems.reduce((sum, merchant) => {
    return sum + merchant.items.reduce((s, item) => s + item.price * item.quantity, 0);
  }, 0);

  const paymentAmount = totalAmount + freight - couponAmount;

  const handleSubmit = () => {
    // TODO: 创建订单并跳转支付
    navigate({ to: "/payment/result?orderId=ORD20240612001" });
  };

  return (
    <Box sx={{ bgcolor: tokens.colors.background.primary, minHeight: "100vh", pb: 10 }}>
      {/* 顶部标题 */}
      <Box
        sx={{
          bgcolor: tokens.colors.background.card,
          p: 3,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, color: tokens.colors.text.primary }}>
          确认订单
        </Typography>
      </Box>

      {/* 收货地址 */}
      <Card sx={{ mx: 2, mt: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Link
            to="/profile/addresses"
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 2,
              textDecoration: "none",
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 500, color: tokens.colors.text.primary }}>
                  {address.name}
                </Typography>
                <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                  {address.phone}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                {address.detail}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              修改
            </Typography>
          </Link>
        </CardContent>
      </Card>

      {/* 商品列表 */}
      {cartItems.map((merchant) => (
        <Card key={merchant.id} sx={{ mx: 2, mt: 2 }}>
          <CardContent sx={{ p: 2 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 500, color: tokens.colors.text.primary, mb: 2 }}
            >
              {merchant.merchantName}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {merchant.items.map((item) => (
                <Box key={item.id} sx={{ display: "flex", gap: 2 }}>
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      borderRadius: 1,
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
                      {item.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                      {item.specs}
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                        x{item.quantity}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: tokens.colors.accent.red }}
                      >
                        ¥{item.price.toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      ))}

      {/* 优惠券 */}
      <Card sx={{ mx: 2, mt: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 500, color: tokens.colors.text.primary }}>
              优惠券
            </Typography>
            <Link
              to="/coupons"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                textDecoration: "none",
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: couponAmount > 0 ? tokens.colors.accent.red : tokens.colors.text.secondary }}
              >
                {couponAmount > 0 ? `-¥${couponAmount}` : "选择优惠券"}
              </Typography>
              <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                &gt;
              </Typography>
            </Link>
          </Box>
        </CardContent>
      </Card>

      {/* 配送方式 */}
      <Card sx={{ mx: 2, mt: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Checkbox
              checked={true}
              size="small"
              sx={{ p: 0 }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: tokens.colors.text.primary }}>
                普通配送
              </Typography>
              <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                预计 3-5 天送达
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              {freight === 0 ? "免运费" : `¥${freight}`}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 订单备注 */}
      <Card sx={{ mx: 2, mt: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: tokens.colors.text.primary }}>
              订单备注
            </Typography>
            <Box
              component="input"
              type="text"
              placeholder="选填，可备注特殊需求"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              sx={{
                flex: 1,
                border: "none",
                outline: "none",
                bgcolor: "transparent",
                fontSize: "0.875rem",
                color: tokens.colors.text.primary,
                "&::placeholder": {
                  color: tokens.colors.text.disabled,
                },
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* 金额明细 */}
      <Card sx={{ mx: 2, mt: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              商品总价
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              ¥{totalAmount.toLocaleString()}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              运费
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              {freight === 0 ? "免运费" : `¥${freight}`}
            </Typography>
          </Box>
          {couponAmount > 0 && (
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="body2" sx={{ color: tokens.colors.accent.green }}>
                优惠券
              </Typography>
              <Typography variant="body2" sx={{ color: tokens.colors.accent.green }}>
                -¥{couponAmount}
              </Typography>
            </Box>
          )}
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body1" sx={{ fontWeight: 500, color: tokens.colors.text.primary }}>
              合计
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: tokens.colors.accent.red }}>
              ¥{paymentAmount.toLocaleString()}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 底部提交栏 */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: tokens.colors.background.card,
          borderTop: `1px solid ${tokens.colors.border.default}`,
          p: 2,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
            合计：
          </Typography>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: tokens.colors.accent.red }}
          >
            ¥{paymentAmount.toLocaleString()}
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={handleSubmit}
          sx={{
            bgcolor: tokens.colors.accent.red,
            px: 4,
            "&:hover": { bgcolor: "#dc2626" },
          }}
        >
          提交订单
        </Button>
      </Box>
    </Box>
  );
}
