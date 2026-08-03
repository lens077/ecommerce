import type { CollectPayload, WireApiTiming, WireVital } from "./types";

const METHOD = "/telemetry.v1.TelemetryService/CollectWebVitals";

/** 与 proto 的 repeated.max_items 对齐;超出的静默截断(旁路数据,拒收没意义)。 */
export const MAX_VITALS = 50;
export const MAX_API_TIMINGS = 200;

export function telemetryEndpoint(gatewayUrl: string): string {
  return `${gatewayUrl.replace(/\/+$/, "")}${METHOD}`;
}

/**
 * 手写 Connect unary JSON,不用生成的客户端 —— 理由与 tracker/transport.ts 相同:
 * 页面卸载时只有 sendBeacon 能把最后一批送出去,而 sendBeacon 不允许自定义请求头,
 * 生成的客户端一定会带 Connect-Protocol-Version。connect-go 默认不强制校验该头。
 */
export function beaconCollect(gatewayUrl: string, payload: CollectPayload): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }
  const blob = new Blob([JSON.stringify(clamp(payload))], { type: "application/json" });
  try {
    return navigator.sendBeacon(telemetryEndpoint(gatewayUrl), blob);
  } catch {
    return false;
  }
}

/** 页面存活时的常规上报;失败不重试(旁路数据,后端故障时重试只会越堆越多)。 */
export async function postCollect(gatewayUrl: string, payload: CollectPayload): Promise<void> {
  await fetch(telemetryEndpoint(gatewayUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(clamp(payload)),
    credentials: "include",
    keepalive: true,
  });
}

/** 对齐 proto 上限,超出截断。 */
export function clamp(payload: CollectPayload): CollectPayload {
  return {
    ...payload,
    vitals: payload.vitals.slice(0, MAX_VITALS),
    apiTimings: payload.apiTimings.slice(0, MAX_API_TIMINGS),
  };
}

/**
 * 聚合两类数据并决定何时发出:
 * - vitals(每页一份的终值)攒着,页面隐藏/卸载时随最后一批一起 beacon —— LCP/CLS/INP
 *   的语义就是"到页面结束为止的最终值",提前发只会发出中间态
 * - apiTimings 批量:攒够 batchSize 或 flushIntervalMs 到点就用 keepalive fetch 发
 */
export class Reporter {
  private vitals: WireVital[] = [];
  private apiTimings: WireApiTiming[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;

  constructor(
    private readonly gatewayUrl: string,
    private readonly identity: { anonId: string; sessionId: string },
    private readonly batchSize = 20,
    flushIntervalMs = 10_000,
  ) {
    this.timer = setInterval(() => this.flushApiTimings(), flushIntervalMs);
  }

  addVital(v: WireVital): void {
    if (this.disposed) return;
    this.vitals.push(v);
  }

  addApiTiming(t: WireApiTiming): void {
    if (this.disposed) return;
    this.apiTimings.push(t);
    if (this.apiTimings.length >= this.batchSize) {
      this.flushApiTimings();
    }
  }

  /** 只发 API 批次;vitals 留到页面结束。 */
  flushApiTimings(): void {
    if (this.apiTimings.length === 0) return;
    const batch = this.apiTimings;
    this.apiTimings = [];
    void postCollect(this.gatewayUrl, this.payload([], batch)).catch(() => {
      // 旁路数据,失败就算了
    });
  }

  /** 页面隐藏/卸载:vitals + 剩余 API 批次一次性 beacon,失败降级 keepalive fetch。 */
  flushFinal(): void {
    if (this.vitals.length === 0 && this.apiTimings.length === 0) return;
    const payload = this.payload(this.vitals, this.apiTimings);
    this.vitals = [];
    this.apiTimings = [];
    if (!beaconCollect(this.gatewayUrl, payload)) {
      void postCollect(this.gatewayUrl, payload).catch(() => {});
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private payload(vitals: WireVital[], apiTimings: WireApiTiming[]): CollectPayload {
    return { ...this.identity, vitals, apiTimings };
  }
}
