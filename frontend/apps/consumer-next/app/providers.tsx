"use client";

import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { browserTransport } from "@/lib/browser-transport";
import { PRODUCT_QUERY_STALE_TIME_MS } from "@/lib/product-query";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: PRODUCT_QUERY_STALE_TIME_MS,
          },
        },
      }),
  );

  return (
    <TransportProvider transport={browserTransport}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TransportProvider>
  );
}
