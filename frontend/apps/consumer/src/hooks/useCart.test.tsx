import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vite-plus/test";
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CartService, CartStatus } from "@/gen/api";
import { cartStore, subscribe } from "@/store/cart";
import { useAddToCart, useCart, useCartBadge } from "./useCart";

const ITEMS = [
  {
    cartItemId: 1n,
    spuId: 10n,
    skuId: 100n,
    merchantId: "m-1",
    shopName: "店铺一",
    spuName: "商品一",
    skuName: "规格一",
    unitPriceCents: 199000n,
    quantity: 2,
    selected: true,
    skuThumbnailUrl: "http://example.com/a.png",
    status: CartStatus.ACTIVE,
  },
  {
    cartItemId: 2n,
    spuId: 20n,
    skuId: 200n,
    merchantId: "m-2",
    shopName: "店铺二",
    spuName: "商品二",
    skuName: "规格二",
    unitPriceCents: 100n,
    quantity: 1,
    selected: false,
    skuThumbnailUrl: "http://example.com/b.png",
    status: CartStatus.ACTIVE,
  },
];

const REQUEST = {
  spuId: "10",
  skuId: "100",
  merchantId: "m-1",
  quantity: 1,
  selected: true,
  spuName: "商品一",
  skuName: "规格一",
  unitPriceCents: 199000n,
  costPriceCents: 199000n,
  skuThumbnailUrl: "http://example.com/a.png",
};

const clients: QueryClient[] = [];

function makeHarness(addError?: ConnectError) {
  let backendItems = ITEMS;
  const getCart = vi.fn(() => ({ items: backendItems }));
  const transport = createRouterTransport(({ service }) => {
    service(CartService, {
      getCart,
      addProductToCart: (request) => {
        if (addError) throw addError;
        backendItems = backendItems.map((item) =>
          item.cartItemId === 1n ? { ...item, quantity: item.quantity + request.quantity } : item,
        );
        return { cartItemId: 1n, cartItemQuantity: backendItems.length };
      },
    });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TransportProvider>
    );
  }

  return {
    Wrapper,
    client,
    getCart,
    setBackendItems: (items: typeof ITEMS) => {
      backendItems = items;
    },
  };
}

let observations: number[][];
let unsubscribe: () => void;
let storageSpy: MockInstance<Storage["setItem"]>;

beforeEach(() => {
  cartStore.clear();
  observations = [];
  unsubscribe = subscribe(() => {
    observations.push(cartStore.items.map((item) => item.quantity));
  });
  storageSpy = vi.spyOn(Storage.prototype, "setItem");
});

afterEach(() => {
  cleanup();
  unsubscribe();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

function cartWrites() {
  return storageSpy.mock.calls.filter(([key]) => key === "ecommerce_cart");
}

describe("useCart 的原子同步", () => {
  it("灌入完整快照时只持久化并通知一次，重渲染不重复灌入", async () => {
    const { Wrapper } = makeHarness();
    const { result, rerender } = renderHook(() => useCart(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(observations).toEqual([[2, 1]]);
    expect(cartWrites()).toHaveLength(1);

    for (let i = 0; i < 5; i++) rerender();
    await act(async () => {});
    expect(observations).toEqual([[2, 1]]);
    expect(cartWrites()).toHaveLength(1);
  });

  it("StrictMode 中不会暴露空或部分条目，也不会无限重灌", async () => {
    const { Wrapper } = makeHarness();
    const { result } = renderHook(() => useCart(), {
      wrapper: ({ children }) => (
        <Wrapper>
          <StrictMode>{children}</StrictMode>
        </Wrapper>
      ),
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.length).toBeLessThanOrEqual(2);
    expect(observations.every((items) => items.length === 2)).toBe(true);
  });

  it("多个订阅者都读取完整且一致的快照", async () => {
    const { Wrapper, getCart } = makeHarness();
    const { result } = renderHook(() => ({ page: useCart(), checkout: useCart() }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.checkout.items).toHaveLength(2));
    expect(result.current.page.items).toEqual(result.current.checkout.items);
    expect(result.current.page.summary.totalQuantity).toBe(3);
    expect(observations.every((items) => items.length === 2)).toBe(true);
    expect(getCart).toHaveBeenCalledTimes(1);
  });

  it("本地选择状态不会被同一条目的远端刷新覆盖", async () => {
    const { Wrapper, client, setBackendItems } = makeHarness();
    const { result } = renderHook(() => useCart(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.toggleSelect("2"));
    expect(result.current.items[1].selected).toBe(true);

    setBackendItems(ITEMS.map((item) => ({ ...item, selected: false })));
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() => expect(result.current.items[1].selected).toBe(true));
  });

  it("后端返回空购物车时用一次替换移除旧条目", async () => {
    const { Wrapper, client, setBackendItems } = makeHarness();
    const { result } = renderHook(() => useCart(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    observations.length = 0;
    storageSpy.mockClear();

    setBackendItems([]);
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(result.current.summary.totalQuantity).toBe(0);
    expect(observations).toEqual([[]]);
    expect(cartWrites()).toHaveLength(1);
  });

  it.each(["cart", "product"] as const)("%s 加购后以共享查询为准，不再重复累加", async (source) => {
    const { Wrapper } = makeHarness();
    const { result } = renderHook(
      () => ({ cart: useCart(), product: useAddToCart(), badge: useCartBadge() }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.cart.items).toHaveLength(2));
    observations.length = 0;

    await act(async () => {
      if (source === "cart") await result.current.cart.addItem(REQUEST);
      else await result.current.product.addToCart(REQUEST);
    });
    await waitFor(() => expect(result.current.cart.items[0].quantity).toBe(3));
    expect(result.current.cart.summary.totalQuantity).toBe(4);
    expect(result.current.badge).toBe(2);
    expect(observations).toEqual([[3, 1]]);
  });

  it("加购失败保留 ConnectError 语义，不修改已加载的购物车", async () => {
    const { Wrapper } = makeHarness(new ConnectError("offline", Code.Unavailable));
    const { result } = renderHook(() => useCart(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    observations.length = 0;

    await act(async () => {
      await expect(result.current.addItem(REQUEST)).rejects.toMatchObject({
        code: Code.Unavailable,
      });
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.items[0].quantity).toBe(2);
    expect(observations).toEqual([]);
  });
});
