import { skipToken, useQuery } from "@connectrpc/connect-query";
import { RegionService } from "@/gen/api";

/**
 * 按上级列出行政区划。
 *
 * parentId 传 0 拿省级；传 undefined 表示「上级还没选」，此时用 skipToken 不发请求
 * （key 里的 input 会记成 "skipped"，不会和真实查询串味）。
 * 全国区划一年也变不了几次，进程内永不失效：切换省市来回点不会重复打后端。
 */
export const useRegions = (parentId: number | undefined) =>
  useQuery(RegionService.method.listRegions, parentId === undefined ? skipToken : { parentId }, {
    select: (res) => res.regions,
    staleTime: Infinity,
    gcTime: Infinity,
  });
