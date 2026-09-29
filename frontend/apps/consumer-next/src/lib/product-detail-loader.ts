/**
 * 商品详情的服务端加载入口：`generateMetadata` 与页面组件共用同一次 GetProductDetail。
 *
 * 两者在同一次渲染里各自调用它。Next 的请求记忆只作用于 fetch，而 connect-node 直接走
 * node:http / http2，根本不经过 fetch，所以用 React `cache` 在单次请求内按 spuCode 去重
 * （node_modules/next/dist/docs 的 generate-metadata 一节：fetch 不可用时用 React cache）。
 * 不去重的话，每次 ISR 生成都会对网关打两次同一个请求。
 *
 * 只能在服务端用：依赖 connect-node 的匿名 transport。
 */
import { cache } from "react";
import { QueryClient } from "@tanstack/react-query";
import { productDetailQueryOptions } from "./product-query";
import { createAnonymousServerTransport } from "./server-transport";

export const loadProductDetail = cache(async (spuCode: string) => {
  const queryClient = new QueryClient();
  const queryOptions = productDetailQueryOptions(createAnonymousServerTransport(), spuCode);
  // prefetchQuery 不抛错：失败时查询状态为 error，由调用方按状态分支
  await queryClient.prefetchQuery(queryOptions);
  return { queryClient, queryOptions };
});
