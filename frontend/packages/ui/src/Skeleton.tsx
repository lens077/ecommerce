/**
 * 骨架屏组件
 * 
 * 提供各种场景的骨架屏占位
 */

import { Box, Skeleton } from "@mui/material";

// 产品卡片骨架屏
export function ProductCardSkeleton() {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Skeleton
        variant="rectangular"
        height={200}
        animation="wave"
        sx={{ bgcolor: "action.hover" }}
      />
      <Box sx={{ p: 2 }}>
        <Skeleton width="80%" height={24} animation="wave" />
        <Skeleton width="60%" height={20} sx={{ mt: 1 }} animation="wave" />
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}>
          <Skeleton width={80} height={28} animation="wave" />
          <Skeleton width={60} height={20} animation="wave" />
        </Box>
      </Box>
    </Box>
  );
}

// 产品列表骨架屏
export function ProductListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(2, 1fr)",
          sm: "repeat(3, 1fr)",
          md: "repeat(4, 1fr)",
          lg: "repeat(5, 1fr)",
        },
        gap: 2,
      }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </Box>
  );
}

// 订单卡片骨架屏
export function OrderCardSkeleton() {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderRadius: 2,
        p: 2,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
        <Skeleton width={120} height={20} animation="wave" />
        <Skeleton width={80} height={20} animation="wave" />
      </Box>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Skeleton variant="rectangular" width={80} height={80} animation="wave" />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="90%" height={20} animation="wave" />
          <Skeleton width="60%" height={16} sx={{ mt: 1 }} animation="wave" />
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Skeleton width={60} height={24} animation="wave" />
          <Skeleton width={40} height={16} sx={{ mt: 0.5 }} animation="wave" />
        </Box>
      </Box>
    </Box>
  );
}

// 用户信息骨架屏
export function UserInfoSkeleton() {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        p: 2,
        bgcolor: "background.paper",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Skeleton variant="circular" width={56} height={56} animation="wave" />
      <Box sx={{ flex: 1 }}>
        <Skeleton width={120} height={24} animation="wave" />
        <Skeleton width={80} height={16} sx={{ mt: 0.5 }} animation="wave" />
      </Box>
    </Box>
  );
}

// 全页面加载骨架屏
export function PageSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3,
        }}
      >
        <Skeleton width={200} height={40} animation="wave" />
        <Skeleton width={100} height={36} sx={{ borderRadius: 5 }} animation="wave" />
      </Box>
      <ProductListSkeleton count={8} />
    </Box>
  );
}

// 详情页骨架屏
export function DetailPageSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", gap: 4, flexDirection: { xs: "column", md: "row" } }}>
        <Box sx={{ flex: 1 }}>
          <Skeleton
            variant="rectangular"
            height={400}
            sx={{ borderRadius: 2 }}
            animation="wave"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Skeleton width="80%" height={40} animation="wave" />
          <Skeleton width="40%" height={32} sx={{ mt: 2 }} animation="wave" />
          <Skeleton width="100%" height={80} sx={{ mt: 3 }} animation="wave" />
          <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
            <Skeleton width={120} height={48} sx={{ borderRadius: 5 }} animation="wave" />
            <Skeleton width={120} height={48} sx={{ borderRadius: 5 }} animation="wave" />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
