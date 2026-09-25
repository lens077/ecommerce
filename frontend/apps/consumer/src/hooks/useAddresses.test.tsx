import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddressService } from "@/gen/api";
import { useAddresses } from "./useAddresses";

const form = {
  recipientName: "张三",
  recipientPhone: "+852 1234 5678",
  province: "海南省",
  city: "琼海市",
  district: "",
  detail: "海边路 1 号",
  isDefault: false,
};
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function harness(failCreate = false, failRefresh = false) {
  let created = false;
  const transport = createRouterTransport(({ service }) => {
    service(AddressService, {
      listAddresses: () => {
        if (created && failRefresh) throw new ConnectError("refresh unavailable", Code.Unavailable);
        return {
          addresses: created
            ? [
                {
                  addressId: "new-address",
                  recipientName: form.recipientName,
                  detail: {
                    province: form.province,
                    city: form.city,
                    district: form.district,
                    detail: form.detail,
                  },
                },
              ]
            : [],
        };
      },
      createAddress: () => {
        if (failCreate) throw new ConnectError("save rejected", Code.InvalidArgument);
        created = true;
        return { addressId: "new-address" };
      },
      updateAddress: () => ({}),
      deleteAddress: () => ({}),
      setDefaultAddress: () => ({}),
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
  return { Wrapper, client };
}

describe("address mutation promises", () => {
  it("returns the created id and refreshes the address list", async () => {
    const { Wrapper } = harness();
    const { result } = renderHook(() => useAddresses(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.addresses).toEqual([]));
    await act(async () => {
      expect(await result.current.createAddress(form)).toMatchObject({ addressId: "new-address" });
    });
    await waitFor(() => expect(result.current.addresses?.[0]?.addressId).toBe("new-address"));
  });

  it("rejects failed creates so the caller can keep the form", async () => {
    const { Wrapper } = harness(true);
    const { result } = renderHook(() => useAddresses(), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.createAddress(form)).rejects.toThrow("save rejected");
    });
  });

  it("does not report a successful create as failed when refreshing fails", async () => {
    const { Wrapper } = harness(false, true);
    const { result } = renderHook(() => useAddresses(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.addresses).toEqual([]));
    await act(async () => {
      await expect(result.current.createAddress(form)).resolves.toMatchObject({
        addressId: "new-address",
      });
    });
    await waitFor(() => expect(result.current.error?.message).toContain("refresh unavailable"));
  });
});
