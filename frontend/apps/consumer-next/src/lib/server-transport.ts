import type { Interceptor, Transport } from "@connectrpc/connect";
import { addStaticKeyToTransport } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-node";
import { PRODUCT_TRANSPORT_QUERY_KEY } from "./transport-key";

// 2026-08-29 订正：旧默认 http://192.168.3.131:8080 的 LB 已不存在（与 consumer SPA
// 的 vite.config.ts 同源问题）。Mac /etc/hosts 把 gateway.dev.test 映射到 192.168.3.121
// （Cilium Gateway）；业务 HTTPRoute 只挂 443，故走 https。
// 集群内由 deploy/dev.yaml 的 CONSUMER_NEXT_GATEWAY_URL 覆盖，本默认值只服务本地 dev。
const DEFAULT_GATEWAY_URL = "https://gateway.dev.test";

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
