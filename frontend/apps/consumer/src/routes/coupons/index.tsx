/**
 * 优惠券页面
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { tokens } from "@/styles/tokens";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/coupons/")({
  component: CouponsPage,
});

function CouponsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  // 模拟优惠券数据
  const coupons = {
    available: [
      {
        id: "c001",
        name: "新人专享券",
        type: "满减",
        amount: 50,
        threshold: 200,
        range: "全品类",
        expireTime: "2024-06-30",
        merchantName: null,
      },
      {
        id: "c002",
        name: "苹果旗舰店专享",
        type: "满减",
        amount: 100,
        threshold: 500,
        range: "限苹果旗舰店",
        expireTime: "2024-07-15",
        merchantName: "苹果官方旗舰店",
      },
      {
        id: "c003",
        name: "数码专享券",
        type: "满减",
        amount: 30,
        threshold: 150,
        range: "数码类",
        expireTime: "2024-06-25",
        merchantName: null,
      },
    ],
    used: [
      {
        id: "c004",
        name: "618狂欢券",
        amount: 100,
        threshold: 500,
        usedTime: "2024-06-10",
      },
    ],
    expired: [
      {
        id: "c005",
        name: "限时特惠券",
        amount: 20,
        threshold: 100,
        expireTime: "2024-05-31",
      },
    ],
  };

  const tabs = [
    { label: "可用优惠券", value: "available", count: coupons.available.length },
    { label: "已使用", value: "used", count: coupons.used.length },
    { label: "已过期", value: "expired", count: coupons.expired.length },
  ];

  const currentCoupons =
    tab === 0 ? coupons.available : tab === 1 ? coupons.used : coupons.expired;

  const handleUseCoupon = (couponId: string) => {
    // 返回上一页并带上优惠券信息
    navigate({ to: "/checkout/", search: { couponId } });
  };

  return (
    <Box sx={{ bgcolor: tokens.colors.background.primary, minHeight: "100vh", pb: 6 }}>
      {/* 顶部标题 */}
      <Box
        sx={{
          bgcolor: tokens.colors.background.card,
          p: 3,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, color: tokens.colors.text.primary }}>
          我的优惠券
        </Typography>
      </Box>

      {/* 状态 Tab */}
      <Box
        sx={{
          bgcolor: tokens.colors.background.card,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, newValue) => setTab(newValue)}
          sx={{
            minHeight: 48,
            "& .MuiTab-root": {
              minHeight: 48,
              textTransform: "none",
              fontWeight: 500,
            },
          }}
        >
          {tabs.map((t, index) => (
            <Tab
              key={t.value}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {t.label}
                  {t.count > 0 && (
                    <Chip
                      label={t.count}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: "0.75rem",
                        bgcolor:
                          tab === index
                            ? tokens.colors.accent.red
                            : tokens.colors.background.primary,
                        color:
                          tab === index
                            ? "#fff"
                            : tokens.colors.text.secondary,
                      }}
                    />
                  )}
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>

      {/* 优惠券列表 */}
      <Box sx={{ p: 2 }}>
        {currentCoupons.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="body1" sx={{ color: tokens.colors.text.secondary }}>
              暂无优惠券
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {currentCoupons.map((coupon) => (
              <Card
                key={coupon.id}
                sx={{
                  overflow: "hidden",
                  opacity: tab > 0 ? 0.6 : 1,
                }}
              >
                <Box sx={{ display: "flex" }}>
                  {/* 左侧金额 */}
                  <Box
                    sx={{
                      width: 100,
                      bgcolor: tab > 0 ? "action.disabledBackground" : tokens.colors.accent.red,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      p: 2,
                    }}
                  >
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: 700, color: "#fff", lineHeight: 1 }}
                    >
                      ¥{coupon.amount}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
                    >
                      满{coupon.threshold}可用
                    </Typography>
                  </Box>

                  {/* 右侧信息 */}
                  <Box sx={{ flex: 1, p: 2 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 500, color: tokens.colors.text.primary, mb: 0.5 }}
                    >
                      {coupon.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                      {"range" in coupon && coupon.range !== "全品类"
                        ? coupon.range
                        : "全平台可用"}
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: tokens.colors.text.disabled }}>
                        {"expireTime" in coupon
                          ? `有效期至 ${coupon.expireTime}`
                          : "usedTime" in coupon
                            ? `使用时间 ${coupon.usedTime}`
                            : `过期时间 ${coupon.expireTime}`}
                      </Typography>
                      {tab === 0 && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleUseCoupon(coupon.id)}
                          sx={{
                            borderColor: tokens.colors.accent.red,
                            color: tokens.colors.accent.red,
                            height: 28,
                            minWidth: 60,
                            "&:hover": {
                              borderColor: tokens.colors.accent.red,
                              bgcolor: "rgba(239, 68, 68, 0.05)",
                            },
                          }}
                        >
                          立即使用
                        </Button>
                      )}
                      {tab === 1 && (
                        <Chip
                          label="已使用"
                          size="small"
                          sx={{
                            bgcolor: tokens.colors.background.primary,
                            color: tokens.colors.text.secondary,
                          }}
                        />
                      )}
                      {tab === 2 && (
                        <Chip
                          label="已过期"
                          size="small"
                          sx={{
                            bgcolor: tokens.colors.background.primary,
                            color: tokens.colors.text.disabled,
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                </Box>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
