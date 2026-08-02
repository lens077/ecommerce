// 行政区划API服务 — 调用后端 RegionService（Connect-Go）
// 数据是只读静态字典，后端已在网关放行，未登录也能查。
import { createClient } from "@connectrpc/connect";
import { RegionService } from "@/gen/api";
import { createAppTransport } from "@ecommerce/api";
import type { Region } from "@/gen/api";

const transport = createAppTransport();

const client = createClient(RegionService, transport);

/** 按上级列出行政区划。parentId 传 0 返回省级 */
export const listRegions = async (parentId: number, signal?: AbortSignal): Promise<Region[]> => {
  const response = await client.listRegions({ parentId }, { signal });
  return response.regions;
};
