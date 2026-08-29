"use client";

import { addStaticKeyToTransport } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import { PRODUCT_TRANSPORT_QUERY_KEY } from "./transport-key";

export const browserTransport = addStaticKeyToTransport(
  createConnectTransport({
    baseUrl: "/api",
    useBinaryFormat: false,
  }),
  PRODUCT_TRANSPORT_QUERY_KEY,
);
