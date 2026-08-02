/**
 * 购物车自定义 Hooks
 *
 * 遵循 Vercel React Best Practices:
 * - rerender-memo: 分离状态避免不必要的重渲染
 * - rerender-defer-reads: 使用订阅模式延迟读取
 */

import { i18next } from "@ecommerce/i18n";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cartApi, type AddToCartRequest } from "@/api/cart";
import {
  cartStore,
  subscribe,
  type CartItem,
  type CartSummary,
  type MerchantGroup,
} from "@/store/cart";

// 共享查询

/**
 * 购物车条目的唯一 queryKey。
 *
 * useCartBadge 和 useCart 必须共用它 —— 之前两者各拉各的（badge 走 GetCartSummary，
 * useCart 走裸 useEffect + GetCart），购物车页一次挂载会打出 4 个 POST：badge 1 次
 * 加 1 次重试，useCart 在 StrictMode 下双发（它的 isMounted 只挡了 setState，没挡请求）。
 * 合并后是 1 个请求，重试由 QueryClient 统一管。
 */
const CART_ITEMS_QUERY_KEY = ["cart", "items"] as const;

function useCartItemsQuery() {
  return useQuery({
    queryKey: CART_ITEMS_QUERY_KEY,
    queryFn: () => cartApi.getCartItems(),
    staleTime: 10000,
  });
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: backendItems, isPending: isInitializing, error: loadError } = useCartItemsQuery();

  // 订阅状态变化
  useEffect(() => {
    return subscribe(() => {
      setItems([...cartStore.items]);
      setSummary(cartStore.getSummary());
      setMerchantGroups(cartStore.getMerchantGroups());
    });
  }, []);

  // 把后端数据灌进 store。依赖的是 react-query 的 data 引用：同一份数据引用稳定，
  // 所以每次成功拉取只灌一次，StrictMode 重复执行 effect 也不会多发请求。
  useEffect(() => {
    if (!backendItems) return;

    cartStore.clear();
    backendItems.forEach((item) => {
      cartStore.addItem({
        cartItemId: item.cartItemId,
        spuId: item.spuId,
        skuId: item.skuId,
        merchantId: item.merchantId,
        shopName: item.shopName,
        spuName: item.spuName,
        skuName: item.skuName,
        price: item.price,
        costPrice: item.costPrice,
        quantity: item.quantity,
        selected: item.selected,
        skuThumbnailUrl: item.skuThumbnailUrl,
      });
    });
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
      setIsLoading(true);
      setError(null);

      try {
        // 调用 API（未来替换为真实 RPC）
        const res = await cartApi.addToCart(request);

        // 更新本地状态（cartItemId 取后端返回值）
        cartStore.addItem({
          ...request,
          cartItemId: res.cartItemId,
        });
        // 服务端已经变了，让共享查询失效，AppBar 的徽标才会跟着刷新
        await queryClient.invalidateQueries({ queryKey: CART_ITEMS_QUERY_KEY });
      } catch (err) {
        const message = err instanceof Error ? err.message : i18next.t("consumer:cart.addFailed");
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient],
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
    isLoading,
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
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const addToCart = useCallback(
    async (request: Omit<AddToCartRequest, "quantity">): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await cartApi.addToCart({
          ...request,
          quantity,
          selected: true,
        });

        cartStore.addItem({
          ...request,
          quantity,
          selected: true,
          cartItemId: res.cartItemId,
        });
        // 商详页加购之后 AppBar 徽标要立刻变,否则要等 staleTime 到期
        await queryClient.invalidateQueries({ queryKey: CART_ITEMS_QUERY_KEY });

        setIsSuccess(true);
        setTimeout(() => setIsSuccess(false), 2000);
      } catch (err) {
        const message = err instanceof Error ? err.message : i18next.t("consumer:cart.addFailed");
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [quantity, queryClient],
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
    isLoading,
    isSuccess,
    error,
    increment,
    decrement,
    setQuantity,
    addToCart,
    clearError,
  };
}
