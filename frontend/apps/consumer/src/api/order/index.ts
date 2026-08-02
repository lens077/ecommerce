// 订单API服务 — 调用后端 orderService（Connect-Go）
import { createClient } from "@connectrpc/connect";
import { orderService } from "@/gen/api";
import { createAppTransport } from "@ecommerce/api";

const transport = createAppTransport();

const client = createClient(orderService, transport);

export interface CreateOrderRequest {
  /** 用户勾选的购物车项ID列表 */
  cartItemIds: string[];
  /** 收货地址ID（后端据此取地址快照） */
  addressId: string;
  /** 用户备注（可选） */
  remark: string;
  /**
   * 幂等键（防重令牌）：进结算页时生成，提交时携带。
   * 后端应在 order.proto 的 CreateOrderRequest 增加 `string requestId = 4;`
   * 并重新 `make api` 生成前端代码。字段就绪后，此值即随请求体发出，
   * 后端用它做「同一次结算只建一单」的去重。
   */
  requestId: string;
}

export interface CreateOrderResult {
  /**
   * 子订单号列表。后端 CreateOrderResponse 目前为空，待补
   * `orderNo` / `payAmount` / `payDeadline` 字段后再回填真实值。
   */
  orderNos: string[];
}

export class OrderApiClient {
  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResult> {
    // requestId 为待补的 proto 字段，先随消息体带上（proto 未含该字段时运行时会被忽略，
    // 不影响其余字段；后端补字段并重新生成后即真正发送）。
    const message = {
      // 仅纯数字的ID才转 BigInt；当前购物车本地存储会生成非数字的临时ID
      // （见结算页报告中的 cart_item_id 缺口），此处容错以免提交时抛错。
      CartItemIds: request.cartItemIds
        .filter((id) => /^\d+$/.test(id))
        .map((id) => BigInt(id)),
      addressId: request.addressId,
      remark: request.remark,
      requestId: request.requestId,
    };

    await client.createOrder(message as Parameters<typeof client.createOrder>[0]);

    // 响应体待后端补 orderNo 等字段，暂返回空列表。
    return { orderNos: [] };
  }
}

export const orderApi = new OrderApiClient();
