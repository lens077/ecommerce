import { useQuery } from "@tanstack/react-query";
import { productApi } from "@/api";

export const useProductDetail = (spuCode: string) => {
  return useQuery({
    queryKey: ["product", spuCode], // 自动缓存，spuCode变了才刷
    queryFn: ({ signal }) => productApi.getProductDetail(spuCode, signal),
    enabled: !!spuCode, // 只有当spuCode存在时才发起请求
    staleTime: 1000 * 60 * 5, // 数据5分钟内被认为是新鲜的，减少不必要的后端压力
  });
};
