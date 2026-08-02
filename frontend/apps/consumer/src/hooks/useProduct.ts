import { skipToken, useQuery } from "@connectrpc/connect-query";
import { getPublicTransport } from "@ecommerce/api";
import { ProductService } from "@/gen/api";

/**
 * 商品详情。
 *
 * 商品浏览是公开接口，走免鉴权 transport —— 挂了 authInterceptor 的话，未登录用户
 * 浏览商品会被判成认证失效而触发退登。
 */
export const useProductDetail = (spuCode: string) => {
  return useQuery(ProductService.method.getProductDetail, spuCode ? { spuCode } : skipToken, {
    transport: getPublicTransport(),
    staleTime: 1000 * 60 * 5, // 数据5分钟内被认为是新鲜的，减少不必要的后端压力
  });
};
