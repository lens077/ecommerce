/**
 * API 请求耗时,手写 PerformanceObserver('resource') —— web-vitals 不覆盖这块。
 *
 * 只采 fetch/xhr(接口),不采图片/脚本:资源加载归 CDN/构建管,接口耗时才是
 * 后端要看的。用 Resource Timing 而不是包一层 axios 拦截器,因为它算的是
 * 浏览器底层的真实时间(含排队、DNS、TCP)。
 *
 * 跨域资源没有 Timing-Allow-Origin 时 dns/tcp/ttfb 全是 0 —— 浏览器隐私保护,
 * 不是数据错了。本仓网关与前端同源部署时不受影响。
 */
import type { WireApiTiming } from "./types";

export interface NetworkFilter {
  /** 命中即丢弃(自身上报端点必须在内,否则每次上报都催生下一次上报)。 */
  excludePaths: string[];
  /** 低于该耗时不采,默认 0。 */
  thresholdMs: number;
}

/** 去掉 origin 与 query,只留路径 —— query 常带 token/关键词,不该进任何存储。 */
export function toPath(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname.slice(0, 256);
  } catch {
    return rawUrl.split("?")[0].slice(0, 256);
  }
}

export function shouldCollect(
  entry: { initiatorType: string; name: string; duration: number },
  filter: NetworkFilter,
): boolean {
  if (entry.initiatorType !== "fetch" && entry.initiatorType !== "xmlhttprequest") {
    return false;
  }
  if (entry.duration < filter.thresholdMs) return false;
  const path = toPath(entry.name);
  return !filter.excludePaths.some((p) => path.startsWith(p));
}

export function toWireApiTiming(entry: PerformanceResourceTiming): WireApiTiming {
  return {
    path: toPath(entry.name),
    durationMs: Math.round(entry.duration),
    // responseStart 为 0(跨域无 TAO)时 ttfb 会算成负数,夹到 0
    ttfbMs: Math.max(0, Math.round(entry.responseStart - entry.requestStart)),
    dnsMs: Math.max(0, Math.round(entry.domainLookupEnd - entry.domainLookupStart)),
    tcpMs: Math.max(0, Math.round(entry.connectEnd - entry.connectStart)),
    transferSize: entry.transferSize ?? 0,
    tsMs: Date.now(),
  };
}

export function startNetwork(filter: NetworkFilter, emit: (t: WireApiTiming) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      if (!shouldCollect(entry, filter)) continue;
      emit(toWireApiTiming(entry));
    }
  });

  observer.observe({ type: "resource", buffered: true });
  return () => observer.disconnect();
}
