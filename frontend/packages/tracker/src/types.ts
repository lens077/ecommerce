/**
 * 事件类型。取值和 backend/api/behavior/v1/behavior.proto 的 EventType 一一对应，
 * 也和 gorse config.toml [recommend.data_source] 里声明的 feedback 类型一致。
 * 改这里必须同时改那两处，否则信号会被 gorse 静默忽略。
 */
export type EventType =
  | "impression" // 商品卡片进入视口
  | "read" // 点进商品详情
  | "dwell" // 详情页停留时长（value 为秒）
  | "cart" // 加入购物车
  | "favorite" // 收藏
  | "purchase" // 支付成功
  | "dislike"; // 明确不感兴趣

/** proto3 JSON 用枚举名而不是数字，这里做一次映射 */
const ENUM_NAME: Record<EventType, string> = {
  impression: "EVENT_TYPE_IMPRESSION",
  read: "EVENT_TYPE_READ",
  dwell: "EVENT_TYPE_DWELL",
  cart: "EVENT_TYPE_CART",
  favorite: "EVENT_TYPE_FAVORITE",
  purchase: "EVENT_TYPE_PURCHASE",
  dislike: "EVENT_TYPE_DISLIKE",
};

export interface TrackedEvent {
  type: EventType;
  /** 商品标识，统一用 spu_code，和 gorse 的 ItemId 对齐 */
  itemId: string;
  /** dwell 为停留秒数，其余事件恒为 1 */
  value?: number;
  /** 事件来源，用于渠道归因：search:关键词 / category:3 / home_feed / neighbors */
  source?: string;
  /** 客户端事件时间（毫秒）。服务端会拿自己的时钟纠偏。 */
  tsMs?: number;
}

/** Connect 的 unary JSON 线格式。int64 在 proto3 JSON 里必须是字符串。 */
export interface WireEvent {
  type: string;
  itemId: string;
  value: number;
  source: string;
  tsMs: string;
}

export function toWire(e: TrackedEvent, now: number): WireEvent {
  return {
    type: ENUM_NAME[e.type],
    itemId: e.itemId,
    value: e.value && e.value > 0 ? e.value : 1,
    source: e.source ?? "",
    tsMs: String(e.tsMs ?? now),
  };
}

export interface RecommendItem {
  itemId: string;
  score: number;
}

export interface RecommendResult {
  items: RecommendItem[];
  /** 实际命中的召回策略：personalized / session / latest / empty */
  strategy: string;
}

export interface TrackerOptions {
  /** 网关地址，例如 http://localhost:8080 */
  gatewayUrl: string;
  /** 攒够多少条立即上报。默认 20。 */
  batchSize?: number;
  /** 没攒够也上报的兜底间隔（毫秒）。默认 5000。 */
  flushIntervalMs?: number;
  /** 卡片在视口里连续停留多久才算一次曝光（毫秒）。默认 1000。 */
  impressionDwellMs?: number;
  /** 卡片露出多少比例才开始计时。默认 0.5。 */
  impressionRatio?: number;
  /** 详情页停留满多少秒才上报一次心跳。默认 15。 */
  dwellHeartbeatSeconds?: number;
  /** 关掉埋点。用于隐私偏好或本地调试。 */
  disabled?: boolean;
}
