/**
 * 购物车 API 客户端
 * 
 * TODO: 后端 CartService 实现后替换为真实的 RPC 调用
 */

import type { CartItem } from "@/store/cart";

// ============================================================================
// Types
// ============================================================================

export interface AddToCartRequest {
  spuId: string;
  skuId: string;
  merchantId: string;
  merchantName?: string;
  quantity: number;
  selected: boolean;
  spuName: string;
  skuName: string;
  price: number;
  skuThumbnailUrl: string;
}

export interface AddToCartResponse {
  cartItemId: string;
  cartTotalQuantity: number;
}

export interface RemoveFromCartRequest {
  spuId: string;
  skuId: string;
  merchantId: string;
  quantity: number;
}

export interface RemoveFromCartResponse {
  cartTotalQuantity: number;
  isCartEmpty: boolean;
}

// ============================================================================
// API Client
// ============================================================================

class CartApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8080";
  }

  /**
   * 添加商品到购物车
   * 
   * TODO: 替换为真实的 CartService RPC 调用
   */
  async addToCart(request: AddToCartRequest): Promise<AddToCartResponse> {
    try {
      // 模拟 API 调用
      console.log("[CartAPI] Adding to cart:", request);

      // 实际项目中应调用:
      // const client = createClient(CartService, transport);
      // return await client.addProductToCart({ ... });

      // 模拟返回
      return {
        cartItemId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        cartTotalQuantity: request.quantity,
      };
    } catch (error) {
      console.error("[CartAPI] Failed to add to cart:", error);
      throw new Error("添加购物车失败，请重试");
    }
  }

  /**
   * 从购物车移除商品
   * 
   * TODO: 替换为真实的 CartService RPC 调用
   */
  async removeFromCart(request: RemoveFromCartRequest): Promise<RemoveFromCartResponse> {
    try {
      // 模拟 API 调用
      console.log("[CartAPI] Removing from cart:", request);

      return {
        cartTotalQuantity: 0,
        isCartEmpty: true,
      };
    } catch (error) {
      console.error("[CartAPI] Failed to remove from cart:", error);
      throw new Error("移除失败，请重试");
    }
  }

  /**
   * 获取购物车列表
   * 
   * TODO: 替换为真实的 CartService RPC 调用
   */
  async getCartItems(): Promise<CartItem[]> {
    try {
      // 模拟 API 调用
      console.log("[CartAPI] Fetching cart items");

      return [];
    } catch (error) {
      console.error("[CartAPI] Failed to fetch cart items:", error);
      throw new Error("获取购物车失败，请重试");
    }
  }
}

// 单例导出
export const cartApi = new CartApiClient();
