/**
 * Ecommerce UI 组件库
 */

// 懒加载图片
export { LazyImage } from "./LazyImage";

// 骨架屏
export {
  ProductCardSkeleton,
  ProductListSkeleton,
  OrderCardSkeleton,
  UserInfoSkeleton,
  PageSkeleton,
  DetailPageSkeleton,
} from "./Skeleton";

// 虚拟列表
export { VirtualList } from "./VirtualList";

// 防抖
export { useDebounce, useDebouncedCallback, useDebounceWithPending } from "./useDebounce";

// 错误边界
export { ErrorBoundary } from "./ErrorBoundary";

// 语言切换
export { LocaleSwitcher } from "./LocaleSwitcher";

// BFF 登录态（control-tower ADR-0002），供纯 Web 应用直接复用
export {
  BffAuthProvider,
  useBffAuthState,
  useBffAuthActions,
  type BffAuthState,
  type BffAuthActions,
} from "./auth/BffAuthProvider";
