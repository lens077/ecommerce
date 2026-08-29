"use client";

import type { Interceptor } from "@connectrpc/connect";
import { addStaticKeyToTransport } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import { PERSONALIZED_TRANSPORT_QUERY_KEY } from "./transport-key";

const markPersonalizedScope: Interceptor = (next) => async (request) => {
  request.header.set("x-consumer-next-scope", "personalized-client");
  return next(request);
};

export const personalizedBrowserTransport = addStaticKeyToTransport(
  createConnectTransport({
    baseUrl: "/api",
    useBinaryFormat: false,
    interceptors: [markPersonalizedScope],
  }),
  PERSONALIZED_TRANSPORT_QUERY_KEY,
);
