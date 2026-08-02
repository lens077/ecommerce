/**
 * 锁住 useCart「后端数据 → store」这条同步路径只跑一次。
 *
 * 这是个**只在运行时才暴露**的不变量:effect 写 store → store 订阅回调 setState →
 * 再渲染,本身就是个反馈环。只要查询结果的引用在同一份 data 下不稳定,这个环就闭合成
 * 死循环 —— 页面表现为 store 被反复 clear/重灌、CPU 打满。tsc 和 lint 一个字都不会说。
 *
 * ⚠️ 这几条用例**拦不住把 select 改成内联箭头函数**:实测下来默认的结构共享
 * (`replaceEqualDeep`)会把新算出的数组换回旧引用,所以内联写法在当前配置下也是绿的。
 * 真正会炸的组合是「内联 select + `structuralSharing: false`」,那时测试进程根本跑不完。
 * 把 select 提到模块作用域是为了不依赖结构共享兜底,理由写在 useCart.ts 的注释里。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createRouterTransport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CartService, CartStatus } from "@/gen/api";
import { cartStore } from "@/store/cart";
import { useCart } from "./useCart";

const ITEMS = [
  {
    cartItemId: 1n,
    spuId: 10n,
    skuId: 100n,
    merchantId: "m-1",
    shopName: "店铺一",
    spuName: "商品一",
    skuName: "规格一",
    price: 1990,
    quantity: 2,
    selected: true,
    skuThumbnailUrl: "http://example.com/a.png",
    status: CartStatus.ACTIVE,
  },
];

/**
 * providers 必须在一次测试内保持同一个实例 —— 每次 rerender 都新建 QueryClient
 * 等于换了一套缓存,数据会重新拉,那就测不出「同一份 data 下 effect 跑了几次」。
 */
function makeWrapper() {
  const transport = createRouterTransport(({ service }) => {
    service(CartService, { getCart: () => ({ items: ITEMS }) });
  });
  // retry 关掉:失败重试会让请求次数这类断言变得不可判
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TransportProvider>
    );
  };
}

function Probe() {
  const { items } = useCart();
  return <div data-testid="count">{items.length}</div>;
}

/** useCart 每次把后端数据灌进 store 前都会先 clear,数它被调了几次即可 */
let clearSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  cartStore.clear();
  clearSpy = vi.spyOn(cartStore, "clear");
});

afterEach(() => {
  cleanup(); // vitest 没开 globals,自动清理不会注册,必须手动清
  clearSpy.mockRestore();
});

describe("useCart 的后端数据同步", () => {
  it("拉到数据后只灌一次 store,重渲染不会重复触发", async () => {
    const Wrapper = makeWrapper();
    const { rerender, getByTestId } = render(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );

    await waitFor(() => expect(getByTestId("count").textContent).toBe("1"));
    expect(clearSpy.mock.calls.length).toBe(1);

    // 再强制渲染几次:data 没变,查询结果的引用就该保持不变,同步 effect 不该再跑。
    // 引用一旦不稳,这个数字会一路涨上去(见文件头那段说明)。
    for (let i = 0; i < 5; i++) {
      rerender(
        <Wrapper>
          <Probe />
        </Wrapper>,
      );
    }
    await act(async () => {});

    expect(clearSpy.mock.calls.length).toBe(1);
  });

  it("StrictMode 下也不会反复重灌", async () => {
    const Wrapper = makeWrapper();
    const { getByTestId } = render(
      <Wrapper>
        <StrictMode>
          <Probe />
        </StrictMode>
      </Wrapper>,
    );

    await waitFor(() => expect(getByTestId("count").textContent).toBe("1"));
    await act(async () => {});

    // StrictMode 把 effect 跑两遍(挂载→卸载→再挂载),所以上限放到 2;
    // 无限触发的写法会远远超过这个数。
    expect(clearSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
