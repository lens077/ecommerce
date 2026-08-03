/**
 * 五大核心指标走 web-vitals/attribution,不手写 PerformanceObserver。
 *
 * 不是偷懒:LCP 的定格时机(首次交互/页面隐藏取最后候选)、CLS 的 Session Window
 * 算法(5s 窗口 + 1s 间隔取最大窗)、INP 的高分位选值、bfcache 恢复后的重置,
 * 这四块手写极易出错且错了**不报错只出错数**。attribution 构建还顺带给出
 * 我们要的归因(哪个元素/哪次交互/哪块偏移),正是手写版里最难的部分。
 */
import {
  onCLS,
  onFCP,
  onINP,
  onLCP,
  onTTFB,
  type CLSMetricWithAttribution,
  type FCPMetricWithAttribution,
  type INPMetricWithAttribution,
  type LCPMetricWithAttribution,
  type MetricWithAttribution,
  type TTFBMetricWithAttribution,
} from "web-vitals/attribution";
import type { WireVital, WireVitalName } from "./types";

/** 把 web-vitals 的 Metric 归一化成 telemetry.v1.WebVital 线格式。 */
export function toWireVital(
  name: WireVitalName,
  metric: MetricWithAttribution,
  page: string,
  attribution: string,
): WireVital {
  return {
    name,
    // CLS 是分数,其余 ms;proto 上限 36e5,客户端先夹住,别让一条脏数据拖垮整批
    value: Math.min(Math.max(metric.value, 0), 3_600_000),
    rating: metric.rating,
    page,
    attribution: attribution.slice(0, 256),
    tsMs: Date.now(),
    navType: metric.navigationType,
  };
}

/**
 * 注册五个指标的回调。web-vitals 的语义:每个指标在其"定格"时刻回调一次
 * (LCP 在首次交互或页面隐藏,CLS/INP 在页面隐藏,FCP/TTFB 在发生时),
 * bfcache 恢复后会以 navigationType=back-forward-cache 再来一轮。
 * 所以这里只管收,发出时机交给 Reporter.flushFinal。
 */
export function startVitals(getPage: () => string, emit: (v: WireVital) => void): void {
  onLCP((m: LCPMetricWithAttribution) => {
    emit(toWireVital("WEB_VITAL_NAME_LCP", m, getPage(), m.attribution.target ?? ""));
  });
  onCLS((m: CLSMetricWithAttribution) => {
    emit(toWireVital("WEB_VITAL_NAME_CLS", m, getPage(), m.attribution.largestShiftTarget ?? ""));
  });
  onINP((m: INPMetricWithAttribution) => {
    const a = m.attribution;
    emit(
      toWireVital(
        "WEB_VITAL_NAME_INP",
        m,
        getPage(),
        `${a.interactionType}:${a.interactionTarget}`,
      ),
    );
  });
  onFCP((m: FCPMetricWithAttribution) => {
    emit(toWireVital("WEB_VITAL_NAME_FCP", m, getPage(), ""));
  });
  onTTFB((m: TTFBMetricWithAttribution) => {
    emit(toWireVital("WEB_VITAL_NAME_TTFB", m, getPage(), ""));
  });
}
