/**
 * 纯函数层的单测。jsdom 没有 PerformanceObserver,采集器的 observe 路径
 * 只能靠端到端验证;这里锁的是所有"错了不报错只出错数"的转换逻辑。
 */
import { describe, expect, it, vi, afterEach } from "vite-plus/test";
import { clamp, MAX_API_TIMINGS, MAX_VITALS, Reporter, telemetryEndpoint } from "./report";
import { shouldCollect, toPath } from "./network";
import { shouldSample } from "./sample";
import type { WireApiTiming, WireVital } from "./types";

function vital(over: Partial<WireVital> = {}): WireVital {
  return {
    name: "WEB_VITAL_NAME_LCP",
    value: 1000,
    rating: "good",
    page: "/",
    attribution: "",
    tsMs: 1,
    navType: "navigate",
    ...over,
  };
}

function timing(over: Partial<WireApiTiming> = {}): WireApiTiming {
  return {
    path: "/cart.v1.CartService/GetCart",
    durationMs: 100,
    ttfbMs: 50,
    dnsMs: 0,
    tcpMs: 0,
    transferSize: 1024,
    tsMs: 1,
    ...over,
  };
}

describe("telemetryEndpoint", () => {
  it("拼出 Connect 方法路径,gatewayUrl 尾部斜杠被归一", () => {
    expect(telemetryEndpoint("http://localhost:8080/")).toBe(
      "http://localhost:8080/telemetry.v1.TelemetryService/CollectWebVitals",
    );
  });
});

describe("clamp 对齐 proto 的 repeated.max_items", () => {
  it("超限截断而不是拒发 —— 服务端会拒收超限批次,截断才能保住其余数据", () => {
    const p = clamp({
      anonId: "a",
      sessionId: "s",
      vitals: Array.from({ length: MAX_VITALS + 10 }, () => vital()),
      apiTimings: Array.from({ length: MAX_API_TIMINGS + 10 }, () => timing()),
    });
    expect(p.vitals).toHaveLength(MAX_VITALS);
    expect(p.apiTimings).toHaveLength(MAX_API_TIMINGS);
  });
});

describe("toPath:query 必须被剥掉", () => {
  it("绝对 URL 只留路径", () => {
    expect(toPath("http://localhost:8080/search.v1.SearchService/Search?q=secret")).toBe(
      "/search.v1.SearchService/Search",
    );
  });
  it("解析不了的字符串也要把 ? 之后砍掉", () => {
    expect(toPath("weird?token=x")).toBe("weird");
  });
});

describe("shouldCollect:自循环排除是这套系统成立的前提", () => {
  const filter = {
    excludePaths: ["/telemetry.v1.", "/behavior.v1.BehaviorService/Track"],
    thresholdMs: 0,
  };

  it("自身上报端点被排除 —— 不排除的话每次上报都会催生下一次上报", () => {
    expect(
      shouldCollect(
        {
          initiatorType: "fetch",
          name: "http://localhost:8080/telemetry.v1.TelemetryService/CollectWebVitals",
          duration: 30,
        },
        filter,
      ),
    ).toBe(false);
  });

  it("业务接口正常采集", () => {
    expect(
      shouldCollect(
        {
          initiatorType: "fetch",
          name: "http://localhost:8080/cart.v1.CartService/GetCart",
          duration: 30,
        },
        filter,
      ),
    ).toBe(true);
  });

  it("图片/脚本不采,那是 CDN 的事", () => {
    expect(
      shouldCollect({ initiatorType: "img", name: "http://x/a.png", duration: 500 }, filter),
    ).toBe(false);
  });

  it("低于阈值不采", () => {
    expect(
      shouldCollect(
        { initiatorType: "fetch", name: "http://x/api", duration: 10 },
        { ...filter, thresholdMs: 50 },
      ),
    ).toBe(false);
  });
});

describe("shouldSample", () => {
  it("边界:rate 0 全不采,rate 1 全采,越界值被夹住", () => {
    expect(shouldSample(0, 0)).toBe(false);
    expect(shouldSample(1, 0.999)).toBe(true);
    expect(shouldSample(2, 0.999)).toBe(true);
    expect(shouldSample(-1, 0)).toBe(false);
  });
});

describe("Reporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("apiTimings 攒够 batchSize 立即发,vitals 不随批次走", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const r = new Reporter("http://gw", { anonId: "a", sessionId: "s" }, 3, 60_000);
    r.addVital(vital());
    r.addApiTiming(timing());
    r.addApiTiming(timing());
    expect(fetchMock).not.toHaveBeenCalled();

    r.addApiTiming(timing()); // 第 3 条,达到 batchSize
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.apiTimings).toHaveLength(3);
    expect(body.vitals).toHaveLength(0); // vitals 必须留到页面结束
    r.dispose();
  });

  it("flushFinal:beacon 失败降级 keepalive fetch,批次含 vitals", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    // jsdom 的 navigator 没有 sendBeacon → beaconCollect 返回 false → 走降级
    const r = new Reporter("http://gw", { anonId: "a", sessionId: "s" });
    r.addVital(vital());
    r.addApiTiming(timing());
    r.flushFinal();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body as string);
    expect(body.vitals).toHaveLength(1);
    expect(body.apiTimings).toHaveLength(1);
    r.dispose();
  });

  it("空 flushFinal 不发请求 —— 服务端会拒收空请求", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = new Reporter("http://gw", { anonId: "a", sessionId: "s" });
    r.flushFinal();
    expect(fetchMock).not.toHaveBeenCalled();
    r.dispose();
  });
});
