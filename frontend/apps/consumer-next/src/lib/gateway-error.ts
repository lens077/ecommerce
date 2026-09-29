/**
 * 区分「网关自己产生的错误」与「后端服务返回、经网关转发的错误」。
 *
 * control-tower 网关的约定（`../control-tower/services/gateway/internal/gwerrors`）：它自己写出的
 * 错误（路由缺失、无可用节点、超时、鉴权失败等）都带 `X-Error-Reason` 响应头，ErrorInfo 的
 * domain 为 `gateway.control-tower`；转发的后端错误两者都没有。读法与 `@ecommerce/api` 的
 * errors.ts 一致：头从 `metadata` 取，ErrorInfo 走 Connect 错误体里可选的 `debug` 字段。
 *
 * 触发它的场景：网关路由表缺 GetProductDetail 时返回 `not_found` + `ROUTE_NOT_FOUND`。
 * 只看错误码的话，路由配置出错期间生成的每个商品页都会被当成「商品不存在」打上 noindex。
 */
import type { ConnectError } from "@connectrpc/connect";

const GATEWAY_ERROR_DOMAIN = "gateway.control-tower";
const GATEWAY_REASON_HEADER = "x-error-reason";

export function isGatewayError(error: ConnectError): boolean {
  if (error.metadata.has(GATEWAY_REASON_HEADER)) return true;
  return error.details.some((detail) => {
    const debug = (detail as { debug?: unknown }).debug;
    return (
      typeof debug === "object" &&
      debug !== null &&
      (debug as { domain?: unknown }).domain === GATEWAY_ERROR_DOMAIN
    );
  });
}
