import { createClient } from "@connectrpc/connect";
import { CartService, type CartItem as RpcCartItem, CartStatus } from "@/gen/api";
import { createAppTransport } from "@ecommerce/api";
import type { CartItem } from "@/store/cart";

const transport = createAppTransport();

const client = createClient(CartService, transport);

function mapRpcCartItemToCartItem(rpcItem: RpcCartItem): CartItem {
  const now = new Date();
  return {
    cartItemId: rpcItem.cartItemId.toString(),
    spuId: rpcItem.spuId.toString(),
    skuId: rpcItem.skuId.toString(),
    merchantId: rpcItem.merchantId,
    shopName: rpcItem.shopName,
    spuName: rpcItem.spuName,
    skuName: rpcItem.skuName,
    price: rpcItem.price,
    costPrice: rpcItem.price,
    quantity: rpcItem.quantity,
    selected: rpcItem.selected,
    skuThumbnailUrl: rpcItem.skuThumbnailUrl,
    createdAt: now,
    updatedAt: now,
  };
}

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

export class CartApiClient {
  async addToCart(request: AddToCartRequest): Promise<AddToCartResponse> {
    const response = await client.addProductToCart({
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
    });

    return {
      cartItemId: response.cartItemId.toString(),
      cartTotalQuantity: response.cartItemQuantity,
    };
  }

  async removeFromCart(request: RemoveFromCartRequest): Promise<RemoveFromCartResponse> {
    const response = await client.removeCartItem({
      spuIds: [BigInt(request.spuId)],
      skuIds: [BigInt(request.skuId)],
      merchantIds: [request.merchantId],
      status: [CartStatus.DELETED],
    });

    return {
      cartTotalQuantity: response.cartItemQuantity,
      isCartEmpty: response.isCartEmpty,
    };
  }

  async getCartItems(): Promise<CartItem[]> {
    const response = await client.getCart({});
    return response.items.map(mapRpcCartItemToCartItem);
  }

  async getCartSummary(): Promise<number> {
    const response = await client.getCartSummary({});
    return response.totalCount;
  }

  async updateCartItemQuantity(
    spuId: string,
    skuId: string,
    merchantId: string,
    quantity: number,
  ): Promise<number> {
    const response = await client.updateCartItemQuantity({
      spuId: BigInt(spuId),
      skuId: BigInt(skuId),
      merchantId,
      quantity,
    });

    return response.cartItemQuantity;
  }
}

export const cartApi = new CartApiClient();
