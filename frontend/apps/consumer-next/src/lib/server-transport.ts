import type { Interceptor, Transport } from "@connectrpc/connect";
import { addStaticKeyToTransport } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-node";
import { PRODUCT_TRANSPORT_QUERY_KEY } from "./transport-key";

const DEFAULT_GATEWAY_URL = "http://192.168.3.131:8080";

export function createAnonymousServerTransport(): Transport {
  return createNodeTransport([scopeInterceptor("public-ssr")]);
}

export function createServerTransport(cookieHeader: string): Transport {
  const forwardCookie: Interceptor = (next) => async (request) => {
    if (cookieHeader) {
      request.header.set("cookie", cookieHeader);
    }
    return next(request);
  };

  return createNodeTransport([scopeInterceptor("cookie-ssr"), forwardCookie]);
}

function createNodeTransport(interceptors: Interceptor[]): Transport {
  const transport = createConnectTransport({
    baseUrl: process.env.CONSUMER_NEXT_GATEWAY_URL ?? DEFAULT_GATEWAY_URL,
    httpVersion: "1.1",
    useBinaryFormat: false,
    interceptors,
  });

  return addStaticKeyToTransport(transport, PRODUCT_TRANSPORT_QUERY_KEY);
}

function scopeInterceptor(scope: string): Interceptor {
  return (next) => async (request) => {
    request.header.set("x-consumer-next-scope", scope);
    return next(request);
  };
}
