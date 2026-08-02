import { useQuery } from "@tanstack/react-query";
import { listRegions } from "@/api";

/**
 * 按上级列出行政区划。
 *
 * parentId 传 0 拿省级；传 undefined 表示「上级还没选」，此时不发请求。
 * 全国区划一年也变不了几次，进程内永不失效：切换省市来回点不会重复打后端。
 */
export const useRegions = (parentId: number | undefined) =>
  useQuery({
    queryKey: ["regions", parentId],
    queryFn: (context) => listRegions(parentId!, context.signal),
    enabled: parentId !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  });
