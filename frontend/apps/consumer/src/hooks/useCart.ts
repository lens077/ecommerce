/**
 * 购物车自定义 Hooks
 *
 * 遵循 Vercel React Best Practices:
 * - rerender-memo: 分离状态避免不必要的重渲染
 * - rerender-defer-reads: 使用订阅模式延迟读取
 */

import { i18next } from "@ecommerce/i18n";
import { toAppError } from "@ecommerce/api";
import { useCallback, useEffect, useState } from "react";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { CartService, CartStatus, type GetCartResponse } from "@/gen/api";
import {
  cartStore,
  subscribe,
  type CartItem,
  type CartSummary,
  type MerchantGroup,
} from "@/store/cart";

/** 灌进 store 的条目形状。createdAt/updatedAt 由 store 自己盖时间戳。 */
type StoreCartInput = Omit<CartItem, "createdAt" | "updatedAt">;

// 共享查询

/**
 * 把 GetCart 的响应映射成 store 认的形状。
 *
 * 定义在模块作用域，理由有两条，第二条才是关键：
 *
 * 1. select 只在 `data` 引用变了**或 select 函数身份变了**时重跑。写成内联箭头函数
 *    每次渲染都是新身份，于是每次渲染都重算一遍映射 —— 纯浪费。
 * 2. 内联写法能不出事，全靠 TanStack 的结构共享（`replaceEqualDeep`）把新算出的数组
 *    换回旧引用。一旦有人给这个查询加上 `structuralSharing: false`，内联 select 就会
 *    每次渲染产出新引用 → 下面那个 `useEffect([backendItems])` 写 store → 订阅回调
 *    setState → 再渲染 → **死循环**（实测过：测试进程根本跑不完）。模块级函数把这条
 *    路堵死，不依赖结构共享兜底。
 */
function toStoreItems(res: GetCartResponse): StoreCartInput[] {
  return res.items.map((item) => ({
    cartItemId: item.cartItemId.toString(),
    spuId: item.spuId.toString(),
    skuId: item.skuId.toString(),
    merchantId: item.merchantId,
    shopName: item.shopName,
    spuName: item.spuName,
    skuName: item.skuName,
    price: item.price,
    // 后端没有单独的 costPrice 字段,沿用 price(与迁移前的行为一致)
    costPrice: item.price,
    quantity: item.quantity,
    selected: item.selected,
    skuThumbnailUrl: item.skuThumbnailUrl,
  }));
}

/**
 * 购物车条目查询。
 *
 * useCartBadge 和 useCart 必须共用它 —— 之前两者各拉各的（badge 走 GetCartSummary，
 * useCart 走裸 useEffect + GetCart），购物车页一次挂载会打出 4 个 POST：badge 1 次
 * 加 1 次重试，useCart 在 StrictMode 下双发（它的 isMounted 只挡了 setState，没挡请求）。
 * 合并后是 1 个请求，重试由 QueryClient 统一管。
 *
 * key 由 connect-query 从 schema + input + transport 推出，不再需要人为约定常量。
 * select 是模块级函数，所以返回的数组引用在 data 不变时保持稳定 —— 见 toStoreItems。
 */
function useCartItemsQuery() {
  return useQuery(CartService.method.getCart, {}, { staleTime: 10000, select: toStoreItems });
}

/** GetCart 的 query key。写操作成功后拿它失效，AppBar 徽标才会跟着刷新。 */
function useCartItemsKey() {
  return createConnectQueryKey({
    schema: CartService.method.getCart,
    cardinality: "finite",
  });
}

/** 加购请求。字段与 AddProductToCart 对齐，但 ID 用 string，BigInt 转换收在 hook 里。 */
export interface AddToCartRequest {
  spuId: string;
  skuId: string;
  merchantId: string;
  quantity: number;
  selected: boolean;
  spuName: string;
  skuName: string;
  price: number;
  costPrice: number;
  skuThumbnailUrl: string;
}

function toAddProductInput(request: AddToCartRequest) {
  return {
    spuId: BigInt(request.spuId),
    skuId: BigInt(request.skuId),
    merchantId: request.merchantId,
    quantity: request.quantity,
    selected: request.selected,
    spuName: request.spuName,
    skuName: request.skuName,
    price: request.price,
    skuThumbnailUrl: request.skuThumbnailUrl,
    status: CartStatus.ACTIVE,
  };
}

// useCartBadge

/**
 * 用于获取购物车数量的 Hook（轻量级，用于 AppBar 等）
 *
 * 数字取 items.length 而不是 sum(quantity)：后端 GetCartSummary 的 SQL 是
 * COUNT(*)，数的是行数而不是件数，两个接口的 status 过滤也都是 CartStatusActive，
 * 所以 items.length 与原来的 totalCount 数值等价，用户看到的徽标不会变。
 *
 * @returns 购物车条目数
 */
export function useCartBadge(): number {
  const { data } = useCartItemsQuery();

  return data?.length ?? 0;
}

// useCart

/**
 * 完整的购物车 Hook
 *
 * @returns 购物车状态和操作方法
 */
export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => cartStore.items);
  const [summary, setSummary] = useState<CartSummary>(() => cartStore.getSummary());
  const [merchantGroups, setMerchantGroups] = useState<MerchantGroup[]>(() =>
    cartStore.getMerchantGroups(),
  );
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const cartItemsKey = useCartItemsKey();
  const { data: backendItems, isPending: isInitializing, error: loadError } = useCartItemsQuery();

  const addProductToCart = useMutation(CartService.method.addProductToCart, {
    // 服务端已经变了，让共享查询失效，AppBar 的徽标才会跟着刷新
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cartItemsKey }),
  });

  // 订阅状态变化
  useEffect(() => {
    return subscribe(() => {
      setItems([...cartStore.items]);
      setSummary(cartStore.getSummary());
      setMerchantGroups(cartStore.getMerchantGroups());
    });
  }, []);

  // 把后端数据灌进 store。映射本身在 toStoreItems 里（模块级 select，结果引用稳定），
  // 这里只负责写 store —— 依赖只在真的拉到新数据时才变，StrictMode 下重复执行也不会多发请求。
  useEffect(() => {
    if (!backendItems) return;

    cartStore.clear();
    backendItems.forEach((item) => cartStore.addItem(item));
  }, [backendItems]);

  useEffect(() => {
    if (loadError) {
      console.warn("[useCart] Failed to load cart from backend:", loadError);
    }
  }, [loadError]);

  /**
   * 添加商品到购物车
   */
  const addItem = useCallback(
    async (request: AddToCartRequest): Promise<void> => {
      setError(null);

      try {
        const res = await addProductToCart.mutateAsync(toAddProductInput(request));

        // 更新本地状态（cartItemId 取后端返回值）
        cartStore.addItem({
          ...request,
          cartItemId: res.cartItemId.toString(),
        });
      } catch (err) {
        const message = toAppError(err).message || i18next.t("consumer:cart.addFailed");
        setError(message);
        throw err;
      }
    },
    [addProductToCart],
  );

  /**
   * 移除商品
   */
  const removeItem = useCallback((cartItemId: string): void => {
    setError(null);
    cartStore.removeItem(cartItemId);
  }, []);

  /**
   * 更新数量
   */
  const updateQuantity = useCallback((cartItemId: string, quantity: number): void => {
    setError(null);
    cartStore.updateQuantity(cartItemId, quantity);
  }, []);

  /**
   * 切换选中状态
   */
  const toggleSelect = useCallback((cartItemId: string): void => {
    cartStore.toggleSelect(cartItemId);
  }, []);

  /**
   * 全选/取消全选
   */
  const selectAll = useCallback((selected: boolean): void => {
    cartStore.selectAll(selected);
  }, []);

  /**
   * 按商家全选/取消全选
   */
  const selectByMerchant = useCallback((merchantId: string, selected: boolean): void => {
    cartStore.selectByMerchant(merchantId, selected);
  }, []);

  /**
   * 清空购物车
   */
  const clear = useCallback((): void => {
    cartStore.clear();
  }, []);

  /**
   * 获取选中的商品
   */
  const getSelectedItems = useCallback((): CartItem[] => {
    return cartStore.getSelectedItems();
  }, []);

  return {
    // 状态
    items,
    summary,
    merchantGroups,
    isLoading: addProductToCart.isPending,
    isInitializing,
    error,
    // 操作
    addItem,
    removeItem,
    updateQuantity,
    toggleSelect,
    selectAll,
    selectByMerchant,
    clear,
    getSelectedItems,
  };
}

// useAddToCart

/**
 * 专门用于商品详情页添加购物车的 Hook
 *
 * @param initialQuantity - 初始数量，默认为 1
 */
export function useAddToCart(initialQuantity: number = 1) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const cartItemsKey = useCartItemsKey();

  const addProductToCart = useMutation(CartService.method.addProductToCart, {
    // 商详页加购之后 AppBar 徽标要立刻变，否则要等 staleTime 到期
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cartItemsKey }),
  });

  const addToCart = useCallback(
    async (request: Omit<AddToCartRequest, "quantity">): Promise<void> => {
      setError(null);

      try {
        const res = await addProductToCart.mutateAsync(
          toAddProductInput({ ...request, quantity, selected: true }),
        );

        cartStore.addItem({
          ...request,
          quantity,
          selected: true,
          cartItemId: res.cartItemId.toString(),
        });

        setIsSuccess(true);
        setTimeout(() => setIsSuccess(false), 2000);
      } catch (err) {
        const message = toAppError(err).message || i18next.t("consumer:cart.addFailed");
        setError(message);
        throw err;
      }
    },
    [quantity, addProductToCart],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const increment = useCallback(() => {
    setQuantity((q) => q + 1);
  }, []);

  const decrement = useCallback(() => {
    setQuantity((q) => Math.max(1, q - 1));
  }, []);

  return {
    quantity,
    isLoading: addProductToCart.isPending,
    isSuccess,
    error,
    increment,
    decrement,
    setQuantity,
    addToCart,
    clearError,
  };
}
