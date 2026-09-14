import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { CartItem } from "./cart";

const INPUTS: Omit<CartItem, "createdAt" | "updatedAt">[] = [
  {
    cartItemId: "1",
    spuId: "10",
    skuId: "100",
    merchantId: "m-1",
    spuName: "First",
    skuName: "Small",
    unitPriceCents: 100n,
    costPriceCents: 80n,
    quantity: 2,
    selected: true,
    skuThumbnailUrl: "https://example.com/first.png",
  },
  {
    cartItemId: "2",
    spuId: "20",
    skuId: "200",
    merchantId: "m-2",
    spuName: "Second",
    skuName: "Large",
    unitPriceCents: 200n,
    costPriceCents: 150n,
    quantity: 1,
    selected: true,
    skuThumbnailUrl: "https://example.com/second.png",
  },
];

let cart: typeof import("./cart");

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  cart = await import("./cart");
});

afterEach(() => vi.restoreAllMocks());

describe("CartStore 的提交契约", () => {
  it("替换完整条目只写盘和通知一次，输入对象不进入可变状态", () => {
    const input = INPUTS.map((item) => ({ ...item }));
    const states: string[][] = [];
    const unsubscribe = cart.subscribe(() => {
      states.push(cart.cartStore.items.map((item) => item.cartItemId));
    });
    const write = vi.spyOn(Storage.prototype, "setItem");
    try {
      cart.cartStore.replaceAll(input);
      expect(states).toEqual([["1", "2"]]);
      expect(write).toHaveBeenCalledTimes(1);
      expect(cart.cartStore.getSummary().totalQuantity).toBe(3);
      input[0].quantity = 99;
      expect(cart.cartStore.items[0].quantity).toBe(2);
    } finally {
      unsubscribe();
    }
  });

  it("新快照构造失败时保留旧购物车，不持久化半成品", () => {
    cart.cartStore.replaceAll(INPUTS);
    const before = cart.cartStore.getSnapshot();
    const write = vi.spyOn(Storage.prototype, "setItem");
    const listener = vi.fn();
    const unsubscribe = cart.subscribe(listener);
    try {
      expect(() =>
        cart.cartStore.replaceAll([INPUTS[0], { ...INPUTS[1], quantity: NaN }]),
      ).toThrow();
      expect(cart.cartStore.getSnapshot()).toBe(before);
      expect(write).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("更新数量和选择不修改 React 已读取的旧快照", () => {
    cart.cartStore.replaceAll(INPUTS);
    const before = cart.cartStore.getSnapshot();
    expect(cart.cartStore.getSnapshot()).toBe(before);

    cart.cartStore.updateQuantity("1", 4);
    cart.cartStore.toggleSelect("1");
    expect(before.items[0].quantity).toBe(2);
    expect(before.items[0].selected).toBe(true);
    expect(before.merchantGroups[0].items[0]).toBe(before.items[0]);
    expect(before.summary.totalQuantity).toBe(3);
    expect(cart.cartStore.getSnapshot().summary).toMatchObject({
      totalQuantity: 5,
      totalPriceCents: 600n,
      selectedQuantity: 1,
      selectedPriceCents: 200n,
    });

    const beforeInvalid = cart.cartStore.getSnapshot();
    cart.cartStore.updateQuantity("1", Number.NaN);
    expect(cart.cartStore.getSnapshot()).toBe(beforeInvalid);
  });

  it.each([
    { command: "toggleSelect", expected: [false, true] },
    { command: "selectAll", expected: [false, false] },
    { command: "selectByMerchant", expected: [false, true] },
  ] as const)("$command 的结果可从持久化状态恢复", async ({ command, expected }) => {
    cart.cartStore.replaceAll(INPUTS);
    if (command === "toggleSelect") cart.cartStore.toggleSelect("1");
    else if (command === "selectAll") cart.cartStore.selectAll(false);
    else cart.cartStore.selectByMerchant("m-1", false);

    vi.resetModules();
    const restored = (await import("./cart")).cartStore;
    expect(restored.items.map((item) => item.selected)).toEqual(expected);
    expect(restored.getSummary().totalPriceCents).toBe(400n);
    expect(restored.items[0].createdAt).toBeInstanceOf(Date);
  });
});
