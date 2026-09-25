import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRouterTransport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CartItem } from "@/store/cart";
import { orderService } from "@/gen/api";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  cart: {} as Record<string, unknown>,
  addresses: [] as unknown[],
  addressRefreshing: false,
  navigate: vi.fn(),
}));
vi.mock("@/hooks/useCart", () => ({ useCart: () => state.cart }));
vi.mock("@/hooks/useAddresses", () => ({
  useAddresses: () => ({
    addresses: state.addresses,
    isLoading: false,
    isFetching: state.addressRefreshing,
  }),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<object>()),
  useNavigate: () => state.navigate,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@ecommerce/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  useFormat: () => ({ formatCurrencyCents: (n: bigint) => String(n) }),
}));

const item = (id: string): CartItem => ({
  cartItemId: id,
  spuId: "1",
  skuId: "2",
  merchantId: "m",
  spuName: "lamp",
  skuName: "small",
  unitPriceCents: 100n,
  costPriceCents: 100n,
  quantity: 1,
  selected: true,
  skuThumbnailUrl: "",
  createdAt: new Date(),
  updatedAt: new Date(),
});
const clients: QueryClient[] = [];
async function mount() {
  const createOrder = vi.fn((_request: unknown) => ({}));
  const transport = createRouterTransport(({ service }) => service(orderService, { createOrder }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const Page = CheckoutPage;
  const view = render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>
    </TransportProvider>,
  );
  await screen.findByRole("button", { name: "checkout.submit" });
  return { createOrder, ...view };
}
beforeEach(() => {
  state.cart = {
    items: [item("1")],
    serverItems: [item("1")],
    isInitializing: false,
    isRefreshing: false,
  };
  state.addresses = [{ addressId: "addr-1", recipientName: "person", isDefault: true }];
  state.navigate.mockReset();
  state.addressRefreshing = false;
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});

describe("checkout submission integrity", () => {
  it("blocks unsynced items instead of silently dropping them", async () => {
    state.cart.items = [item("1"), item("local-temp")];
    const { createOrder } = await mount();
    const button = screen.getByRole("button", { name: "checkout.submit" });
    expect(button).toHaveProperty("disabled", true);
    expect(screen.getByText("checkout.unsyncedItems")).toBeTruthy();
    fireEvent.click(button);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("does not trust a numeric local ID absent from the server snapshot", async () => {
    state.cart.items = [item("999")];
    await mount();
    expect(screen.getByRole("button", { name: "checkout.submit" })).toHaveProperty(
      "disabled",
      true,
    );
  });
  it("blocks local quantity changes not persisted to the server", async () => {
    state.cart.items = [{ ...item("1"), quantity: 3 }];
    state.cart.serverItems = [{ ...item("1"), quantity: 2 }];
    const { createOrder } = await mount();
    const button = screen.getByRole("button", { name: "checkout.submit" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("blocks stale addresses while their background refresh is pending", async () => {
    state.addressRefreshing = true;
    const { createOrder } = await mount();
    const button = screen.getByRole("button", { name: "checkout.submit" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("submits every valid selected item without filtering", async () => {
    state.cart.items = [item("1"), item("2")];
    state.cart.serverItems = state.cart.items;
    const { createOrder } = await mount();
    await userEvent.click(screen.getByRole("button", { name: "checkout.submit" }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    expect(createOrder.mock.calls[0]?.[0]).toMatchObject({
      CartItemIds: [1n, 2n],
      addressId: "addr-1",
    });
  });
  it("blocks submission if the address list no longer contains a selectable address", async () => {
    state.addresses = [];
    await mount();
    expect(screen.getByRole("button", { name: "checkout.submit" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
