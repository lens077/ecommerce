import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initI18n, i18next } from "@ecommerce/i18n";
import { AddressService, RegionService } from "@/gen/api";
import zh from "@/locales/zh-CN/consumer.json";
import en from "@/locales/en/consumer.json";
import { AddressPickerDialog } from "./AddressPickerDialog";

const clients: QueryClient[] = [];
beforeAll(async () => {
  await initI18n({ ns: "consumer", resources: { "zh-CN": zh, en } });
  await i18next.changeLanguage("zh-CN");
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});
function setup(fail = false) {
  const createAddress = vi.fn(() => {
    if (fail) throw new ConnectError("地址暂时无法保存", Code.Unavailable);
    return { addressId: "new-address" };
  });
  const onSelect = vi.fn();
  const transport = createRouterTransport(({ service }) => {
    service(AddressService, { listAddresses: () => ({ addresses: [] }), createAddress });
    service(RegionService, {
      listRegions: ({ parentId }) => ({
        regions:
          parentId === 0
            ? [{ id: 1, name: "海南省" }]
            : parentId === 1
              ? [{ id: 2, name: "琼海市" }]
              : [],
      }),
    });
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={client}>
        <AddressPickerDialog
          open
          addresses={[]}
          loading={false}
          selectedAddressId={null}
          onClose={() => {}}
          onSelect={onSelect}
        />
      </QueryClientProvider>
    </TransportProvider>,
  );
  return { createAddress, onSelect };
}
async function fillForm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "添加新地址" }));
  await user.type(screen.getByRole("textbox", { name: "收件人" }), "张三");
  await user.type(screen.getByRole("textbox", { name: "手机号码" }), "123456");
  const province = await screen.findByRole("combobox", { name: "省份" });
  await waitFor(() => expect(province.getAttribute("aria-disabled")).not.toBe("true"));
  await user.click(province);
  await user.click(await screen.findByRole("option", { name: "海南省" }));
  const city = screen.getByRole("combobox", { name: "城市" });
  await waitFor(() => expect(city.getAttribute("aria-disabled")).not.toBe("true"));
  await user.click(city);
  await user.click(await screen.findByRole("option", { name: "琼海市" }));
  await screen.findByText(/该市下无区/);
  await user.type(screen.getByRole("textbox", { name: "详细地址" }), "一号街");
  return user;
}
describe("checkout address creation", () => {
  it("keeps failed input visible for retry", async () => {
    const { onSelect } = setup(true);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "保存地址" }));
    await screen.findByText(/地址暂时无法保存/);
    expect(screen.getByRole("textbox", { name: "收件人" })).toHaveProperty("value", "张三");
    expect(screen.getByRole("textbox", { name: "详细地址" })).toHaveProperty("value", "一号街");
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("creates terminal-city address without district and selects returned ID", async () => {
    const { createAddress, onSelect } = setup();
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "保存地址" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("new-address"));
    expect(createAddress).toHaveBeenCalledTimes(1);
  });
});
