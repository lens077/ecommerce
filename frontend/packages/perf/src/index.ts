/**
 * 前端性能监控入口。
 *
 * 采集:五大 Web Vitals(web-vitals/attribution)+ 长任务 + fetch/xhr 耗时拆解。
 * 上报:经网关打 telemetry.v1(免鉴权白名单),服务端转成 OTel histogram(→VM)
 * 与结构化日志(→Loki)。与 @ecommerce/tracker 分工:tracker 采"用户对内容的行为"
 * (投喂推荐),这里采"页面本身的表现"(投喂可观测性)。
 */
import { anonId, sessionId } from "@ecommerce/tracker";
import { shouldSample } from "./sample";
import { startLongTask } from "./longtask";
import { startNetwork } from "./network";
import { Reporter } from "./report";
import { startVitals } from "./vitals";
import type { PerfOptions } from "./types";

export type { PerfOptions, WireApiTiming, WireVital, WireVitalName } from "./types";
export { shouldSample } from "./sample";

let cleanup: (() => void) | undefined;

export function initPerf(options: PerfOptions): void {
  disposePerf();

  if (options.disabled) return;
  if (typeof window === "undefined") return;
  if (!options.gatewayUrl) return;

  // 采样按会话定:同一会话要么全采要么全不采,否则同一页面的 LCP 和 INP
  // 会来自不同的用户群,指标之间对不上
  if (!shouldSampleSession(options.sampleRate ?? 1)) return;

  const getPage = () => {
    try {
      return (options.getRoute?.() ?? window.location.pathname).slice(0, 128);
    } catch {
      return window.location.pathname.slice(0, 128);
    }
  };

  const reporter = new Reporter(options.gatewayUrl, {
    anonId: anonId(),
    sessionId: sessionId(),
  });

  startVitals(getPage, (v) => reporter.addVital(v));
  const stopLongTask = startLongTask(options.longTaskThresholdMs ?? 100, getPage, (v) =>
    reporter.addVital(v),
  );
  const stopNetwork = startNetwork(
    {
      // 自身上报端点必须排除 —— 否则每次上报都会催生下一次上报;
      // 埋点通道同理,两条旁路都不该出现在业务接口的耗时里
      excludePaths: ["/telemetry.v1.", "/behavior.v1.BehaviorService/Track"],
      thresholdMs: options.slowApiThresholdMs ?? 0,
    },
    (t) => reporter.addApiTiming(t),
  );

  // 终报时机:visibilitychange(hidden) 与 pagehide 双保险(浏览器脾气不同,
  // Safari 偏 pagehide),beforeunload 不用 —— 移动端不可靠且破坏 bfcache
  const onHidden = () => {
    if (document.visibilityState === "hidden") reporter.flushFinal();
  };
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", () => reporter.flushFinal());

  cleanup = () => {
    stopLongTask();
    stopNetwork();
    document.removeEventListener("visibilitychange", onHidden);
    reporter.dispose();
  };
}

export function disposePerf(): void {
  cleanup?.();
  cleanup = undefined;
}

const SAMPLE_KEY = "perf:sampled";

/** 会话级采样决定,存 sessionStorage 保证同会话内稳定。 */
function shouldSampleSession(rate: number): boolean {
  try {
    const cached = sessionStorage.getItem(SAMPLE_KEY);
    if (cached !== null) return cached === "1";
    const sampled = shouldSample(rate, Math.random());
    sessionStorage.setItem(SAMPLE_KEY, sampled ? "1" : "0");
    return sampled;
  } catch {
    return shouldSample(rate, Math.random());
  }
}
