import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRouterTransport, Code, ConnectError } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initI18n } from "@ecommerce/i18n";
import { AddressService, RegionService, UserService } from "@/gen/api";
import consumerEn from "@/locales/en/consumer.json";
import { Route } from "@/routes/profile/addresses";

vi.mock("@/api/location", () => ({
  requestLocationPermission: async () => false,
  getLocationInfo: async () => null,
}));
const Page = Route.options.component!;
beforeAll(() => initI18n({ ns: "consumer", locale: "en", resources: { en: consumerEn } }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

async function setup(pendingUpdate?: Promise<void>) {
  const update = vi.fn(async () => {
    await pendingUpdate;
    throw new ConnectError("save rejected", Code.InvalidArgument);
  });
  const create = vi.fn(async () => {
    throw new ConnectError("create rejected", Code.InvalidArgument);
  });
  const remove = vi.fn(async () => {
    throw new ConnectError("delete rejected", Code.InvalidArgument);
  });
  const setDefault = vi.fn(async () => {
    throw new ConnectError("default rejected", Code.InvalidArgument);
  });
  const transport = createRouterTransport(({ service }) => {
    service(UserService, { userProfile: () => ({ user: { id: "user", name: "User" } }) });
    service(AddressService, {
      listAddresses: () => ({
        addresses: [
          {
            addressId: "address",
            recipientName: "Original",
            recipientPhone: "+852 1234 5678",
            detail: { province: "海南省", city: "琼海市", district: "", detail: "Street 1" },
          },
        ],
      }),
      createAddress: create,
      updateAddress: update,
      deleteAddress: remove,
      setDefaultAddress: setDefault,
    });
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  await Page.preload?.();
  await act(async () => {
    render(
      <TransportProvider transport={transport}>
        <QueryClientProvider client={client}>
          <Page />
        </QueryClientProvider>
      </TransportProvider>,
    );
  });
  return { update, create, remove, setDefault, user: userEvent.setup() };
}

describe("address book writes", () => {
  it("keeps the dialog and entered values visible when saving fails", async () => {
    const { user, update } = await setup();
    await screen.findByText("Original");
    await user.click(screen.getByRole("button", { name: /edit/i }));
    const field = screen.getByRole("textbox", { name: "Recipient" });
    fireEvent.change(field, { target: { value: "Changed" } });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("save rejected"));
    expect((screen.getByRole("textbox", { name: "Recipient" }) as HTMLInputElement).value).toBe(
      "Changed",
    );
    expect(screen.queryByRole("checkbox", { name: "Set as default address" })).toBeNull();
  });

  it("keeps a newly entered address when create fails and lets the user retry", async () => {
    const { user, create } = await setup();
    await user.click(await screen.findByRole("button", { name: "Add address" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Recipient" }), {
      target: { value: "New recipient" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Phone number" }), {
      target: { value: "+852 1234 5678" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Street address" }), {
      target: { value: "Street 2" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Province" }).getAttribute("aria-disabled"),
      ).not.toBe("true"),
    );
    await user.click(screen.getByRole("combobox", { name: "Province" }));
    await user.click(await screen.findByRole("option", { name: "海南省" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "City" }).getAttribute("aria-disabled")).not.toBe(
        "true",
      ),
    );
    await user.click(screen.getByRole("combobox", { name: "City" }));
    await user.click(await screen.findByRole("option", { name: "琼海市" }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("create rejected");
    expect((screen.getByRole("textbox", { name: "Recipient" }) as HTMLInputElement).value).toBe(
      "New recipient",
    );
    expect(
      (screen.getByRole("textbox", { name: "Street address" }) as HTMLInputElement).value,
    ).toBe("Street 2");
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  });

  it("blocks repeat submits and closing while the actual save is pending", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { user, update } = await setup(pending);
    await user.click(await screen.findByRole("button", { name: "Edit address" }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    const form = screen.getByRole("textbox", { name: "Recipient" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => finish());
    await screen.findByText("save rejected");
  });

  it("requires deletion confirmation and retains the confirmation on RPC failure", async () => {
    const { user, remove } = await setup();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: /Delete address/ });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await screen.findByText("delete rejected");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Original")).toBeTruthy();
  });

  it("shows a set-default failure without silently updating address details", async () => {
    const { user, update, setDefault } = await setup();
    await user.click(await screen.findByRole("button", { name: "Set as default address" }));
    await screen.findByText("default rejected");
    expect(setDefault).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("falls back to manual entry with feedback when location permission is denied", async () => {
    const { user } = await setup();
    await user.click(await screen.findByRole("button", { name: "Add address" }));
    await user.click(screen.getByRole("button", { name: "Agree" }));
    await screen.findByText("Could not get your location. Please enter the address manually.");
    expect(screen.getByRole("textbox", { name: "Recipient" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});
