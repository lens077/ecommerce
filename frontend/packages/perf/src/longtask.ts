/**
 * 主线程长任务,手写 PerformanceObserver —— web-vitals 不覆盖这块。
 *
 * Long Task API 的归因只能到"宏观容器"(是主页面卡了还是某个 iframe 卡了),
 * 给不出具体函数堆栈,那是 DevTools 的事。这里要的就是这个粗粒度:
 * 区分"自己写的代码慢"还是"第三方内容慢"。
 */
import type { WireVital } from "./types";

interface TaskAttributionTiming extends PerformanceEntry {
  containerType?: string;
  containerSrc?: string;
}

interface PerformanceLongTaskTiming extends PerformanceEntry {
  attribution?: TaskAttributionTiming[];
}

export function startLongTask(
  thresholdMs: number,
  getPage: () => string,
  emit: (v: WireVital) => void,
): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};
  // longtask 不是所有浏览器都支持(Safari 较新版本才有),不支持就静默不采
  if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return () => {};

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceLongTaskTiming[]) {
      // 标准线 50ms,但那在移动端太吵;只报真正让人感到卡的
      if (entry.duration < thresholdMs) continue;

      const source = entry.attribution?.[0];
      const container =
        source?.containerType && source.containerType !== "window"
          ? `${source.containerType}:${source.containerSrc ?? ""}`
          : "self";

      emit({
        name: "WEB_VITAL_NAME_LONG_TASK",
        value: Math.round(entry.duration),
        rating: "",
        page: getPage(),
        attribution: container.slice(0, 256),
        tsMs: Date.now(),
        navType: "",
      });
    }
  });

  // buffered:SDK 初始化晚于页面加载,补发之前已发生的长任务
  observer.observe({ type: "longtask", buffered: true });
  return () => observer.disconnect();
}
