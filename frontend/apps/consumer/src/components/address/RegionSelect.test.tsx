import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createRouterTransport, Code, ConnectError } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initI18n } from "@ecommerce/i18n";
import { RegionService } from "@/gen/api";
import consumerEn from "@/locales/en/consumer.json";
import { RegionSelect } from "./RegionSelect";

beforeAll(() => initI18n({ ns: "consumer", locale: "en", resources: { en: consumerEn } }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("RegionSelect district requirement", () => {
  it("resets the requirement when controlled city changes and blocks unresolved or failed regions", async () => {
    let finishDistricts!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishDistricts = resolve;
    });
    const transport = createRouterTransport(({ service }) => {
      service(RegionService, {
        listRegions: async ({ parentId }) => {
          if (parentId === 0) return { regions: [{ id: 1, name: "海南省" }] };
          if (parentId === 1)
            return {
              regions: [
                { id: 2, name: "琼海市" },
                { id: 3, name: "海口市" },
                { id: 4, name: "失败市" },
              ],
            };
          if (parentId === 3) {
            await pending;
            return { regions: [{ id: 31, name: "龙华区" }] };
          }
          if (parentId === 4) throw new ConnectError("unavailable", Code.Unavailable);
          return { regions: [] };
        },
      });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const report = vi.fn();
    const ui = (city: string) => (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={client}>
          <RegionSelect
            value={{ province: "海南省", city, district: "" }}
            onChange={() => {}}
            onDistrictRequiredChange={report}
          />
        </QueryClientProvider>
      </TransportProvider>
    );
    const view = render(ui("琼海市"));
    await waitFor(() => expect(report).toHaveBeenLastCalledWith(false));
    view.rerender(ui("海口市"));
    await waitFor(() => expect(report).toHaveBeenLastCalledWith(null));
    finishDistricts();
    await waitFor(() => expect(report).toHaveBeenLastCalledWith(true));
    view.rerender(ui("失败市"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("unavailable"));
    expect(report).toHaveBeenLastCalledWith(null);
  });
});
