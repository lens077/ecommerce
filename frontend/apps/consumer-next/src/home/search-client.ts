/**
 * 搜索 RPC 客户端。单独成模块,由 HeaderSearch 在用户第一次提交搜索时动态 import——
 * 首页首屏 JS 里不带 connect-web / protobuf 运行时。
 */
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { SearchService, type Product } from "@/gen/api/search/v1/search_pb";
import { bffBaseUrl } from "./gateway";

export type SearchProduct = Product;

let client: ReturnType<typeof createClient<typeof SearchService>> | undefined;

export async function searchProducts(name: string, signal?: AbortSignal): Promise<Product[]> {
  client ??= createClient(
    SearchService,
    createConnectTransport({
      baseUrl: bffBaseUrl(),
      useBinaryFormat: false,
      fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
    }),
  );
  const response = await client.search({ name }, { signal });
  return response.products ?? [];
}
