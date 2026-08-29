import type { Transport } from "@connectrpc/connect";
import { createQueryOptions } from "@connectrpc/connect-query";
import { ProductService } from "@/gen/api/product/v1/product_pb";

export const PRODUCT_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

export function productDetailQueryOptions(transport: Transport, spuCode: string) {
  return {
    ...createQueryOptions(ProductService.method.getProductDetail, { spuCode }, { transport }),
    staleTime: PRODUCT_QUERY_STALE_TIME_MS,
  };
}
