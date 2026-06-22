/**
 * 购物车自定义 Hooks
 * 
 * 遵循 Vercel React Best Practices:
 * - rerender-memo: 分离状态避免不必要的重渲染
 * - rerender-defer-reads: 使用订阅模式延迟读取
 */

import { useCallback, useEffect, useState } from "react";
import { cartApi, type AddToCartRequest } from "@/api/cart";
import {
  cartStore,
  subscribe,
  type CartItem,
  type CartSummary,
  type MerchantGroup,
} from "@/store/cart";

// ============================================================================
// useCartBadge
// ============================================================================

/**
 * 用于获取购物车数量的 Hook（轻量级，用于 AppBar 等）
 * 
 * @returns 购物车总数量
 */
export function useCartBadge(): number {
  const [count, setCount] = useState(() => cartStore.totalQuantity);

  useEffect(() => {
    return subscribe(() => {
      setCount(cartStore.totalQuantity);
    });
  }, []);

  return count;
}

// ============================================================================
// useCart
// ============================================================================

/**
 * 完整的购物车 Hook
 * 
 * @returns 购物车状态和操作方法
 */
export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => cartStore.items);
  const [summary, setSummary] = useState<CartSummary>(() => cartStore.getSummary());
  const [merchantGroups, setMerchantGroups] = useState<MerchantGroup[]>(
    () => cartStore.getMerchantGroups()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 订阅状态变化
  useEffect(() => {
    return subscribe(() => {
      setItems([...cartStore.items]);
      setSummary(cartStore.getSummary());
      setMerchantGroups(cartStore.getMerchantGroups());
    });
  }, []);

  /**
   * 添加商品到购物车
   */
  const addItem = useCallback(
    async (request: AddToCartRequest): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        // 调用 API（未来替换为真实 RPC）
        await cartApi.addToCart(request);

        // 更新本地状态
        cartStore.addItem({
          ...request,
          status: "active",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "添加失败";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
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
    error,
    // 操作
    addItem,
    removeItem,
    updateQuantity,
    toggleSelect,
    selectAll,
    clear,
    getSelectedItems,
  };
}

// ============================================================================
// useAddToCart
// ============================================================================

/**
 * 专门用于商品详情页添加购物车的 Hook
 * 
 * @param initialQuantity - 初始数量，默认为 1
 */
export function useAddToCart(initialQuantity: number = 1) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const addToCart = useCallback(
    async (request: Omit<AddToCartRequest, "quantity">): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        await cartApi.addToCart({
          ...request,
          quantity,
          selected: true,
        });

        cartStore.addItem({
          ...request,
          quantity,
          selected: true,
          status: "active",
        });

        setIsSuccess(true);
        setTimeout(() => setIsSuccess(false), 2000);
      } catch (err) {
        const message = err instanceof Error ? err.message : "添加失败";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [quantity]
  );

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
    increment,
    decrement,
    setQuantity,
    addToCart,
  };
}
