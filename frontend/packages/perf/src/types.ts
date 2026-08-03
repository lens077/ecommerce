/** 与 telemetry.v1.WebVitalName 对齐的线格式名(proto3 JSON 用枚举全名)。 */
export type WireVitalName =
  | "WEB_VITAL_NAME_LCP"
  | "WEB_VITAL_NAME_CLS"
  | "WEB_VITAL_NAME_INP"
  | "WEB_VITAL_NAME_FCP"
  | "WEB_VITAL_NAME_TTFB"
  | "WEB_VITAL_NAME_LONG_TASK";

/** telemetry.v1.WebVital 的线格式。 */
export interface WireVital {
  name: WireVitalName;
  value: number;
  rating: string;
  page: string;
  attribution: string;
  tsMs: number;
  navType: string;
}

/** telemetry.v1.ApiTiming 的线格式。 */
export interface WireApiTiming {
  path: string;
  durationMs: number;
  ttfbMs: number;
  dnsMs: number;
  tcpMs: number;
  transferSize: number;
  tsMs: number;
}

/** telemetry.v1.CollectWebVitalsRequest 的线格式。 */
export interface CollectPayload {
  anonId: string;
  sessionId: string;
  vitals: WireVital[];
  apiTimings: WireApiTiming[];
}

export interface PerfOptions {
  /** 网关地址,如 http://localhost:8080 */
  gatewayUrl: string;
  /**
   * 当前路由的**模式**(如 /product/$spuCode),不是具体 URL。
   * 它会成为 VictoriaMetrics 的 label,必须低基数 —— 传具体 URL 会让序列数
   * 跟着商品数走。不传则退化为 location.pathname(有基数风险,仅限本地调试)。
   */
  getRoute?: () => string;
  /** 采样率 0~1,默认 1(全采)。按会话决定:同一次会话要么全采要么全不采,不然指标之间对不上。 */
  sampleRate?: number;
  /** LongTask 上报阈值(ms),默认 100 —— 50ms 的标准线在移动端太吵。 */
  longTaskThresholdMs?: number;
  /** API 耗时低于该值(ms)不上报明细,默认 0(全报,量不大:只采 fetch/xhr)。 */
  slowApiThresholdMs?: number;
  disabled?: boolean;
}
