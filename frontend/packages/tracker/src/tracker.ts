import { anonId, sessionId } from "./identity";
import { beaconTrack, postRecommend, postSimilarItems, postTrack } from "./transport";
import type { EventType, RecommendResult, TrackedEvent, TrackerOptions, WireEvent } from "./types";
import { toWire } from "./types";

/** sendBeacon 的载荷上限普遍是 64KB，留点余量避免整批被浏览器丢掉。 */
const BEACON_MAX_EVENTS = 200;

interface ImpressionState {
  itemId: string;
  source: string;
  timer: number | null;
}

/**
 * Tracker 负责把"用户在逛什么"变成事件流。
 *
 * 所有上报都是尽力而为：任何一步失败都只是丢几条埋点，绝不向调用方抛错，
 * 更不该让一个推荐位的数据采集拖累页面本身。
 */
export class Tracker {
  private readonly gatewayUrl: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly impressionDwellMs: number;
  private readonly impressionRatio: number;
  private readonly dwellHeartbeatSeconds: number;
  private readonly disabled: boolean;

  private queue: WireEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private observer: IntersectionObserver | null = null;
  private readonly observed = new WeakMap<Element, ImpressionState>();
  /** 本会话内已上报过的曝光。服务端也会去重，这里挡一道纯粹是省网络往返。 */
  private readonly seenImpressions = new Set<string>();
  private disposed = false;

  constructor(options: TrackerOptions) {
    this.gatewayUrl = options.gatewayUrl;
    this.batchSize = options.batchSize ?? 20;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.impressionDwellMs = options.impressionDwellMs ?? 1000;
    this.impressionRatio = options.impressionRatio ?? 0.5;
    this.dwellHeartbeatSeconds = options.dwellHeartbeatSeconds ?? 15;
    this.disabled = options.disabled ?? false;

    if (!this.disabled && typeof window !== "undefined") {
      this.start();
    }
  }

  // ---------- 显式事件 ----------

  /** 点进商品详情。累计到 3 次会被 gorse 的 read>=3 提升为正样本。 */
  read(itemId: string, source?: string): void {
    this.push({ type: "read", itemId, source });
  }

  cart(itemId: string, source?: string): void {
    this.push({ type: "cart", itemId, source });
    void this.flush();
  }

  favorite(itemId: string, source?: string): void {
    this.push({ type: "favorite", itemId, source });
    void this.flush();
  }

  purchase(itemId: string, source?: string): void {
    this.push({ type: "purchase", itemId, source });
    void this.flush();
  }

  /**
   * 明确不感兴趣。
   * 当前 gorse 版本没有 negative_feedback_types，这条只会落到 behaviors.events，
   * 由服务端在返回推荐结果前把命中的商品剔掉。
   */
  dislike(itemId: string, source?: string): void {
    this.push({ type: "dislike", itemId, source });
    void this.flush();
  }

  /** 任意事件的逃生口，给上面没覆盖到的场景用。 */
  track(event: TrackedEvent): void {
    this.push(event);
  }

  // ---------- 曝光 ----------

  /**
   * 观察一个商品卡片元素，露出 impressionRatio 并连续停留 impressionDwellMs 后
   * 记一次曝光。返回停止观察的函数。
   *
   * 加这个门槛是因为快速滚过屏幕的卡片并不代表用户看见了它 ——
   * 把它们全当曝光，等于告诉 gorse 用户对整个列表一视同仁，画像就废了。
   */
  observeImpression(el: Element | null, itemId: string, source?: string): () => void {
    if (this.disabled || !el || !this.observer) return () => {};

    this.observed.set(el, { itemId, source: source ?? "", timer: null });
    this.observer.observe(el);

    return () => {
      const state = this.observed.get(el);
      if (state?.timer !== null && state?.timer !== undefined) {
        clearTimeout(state.timer);
      }
      this.observed.delete(el);
      this.observer?.unobserve(el);
    };
  }

  // ---------- 停留时长 ----------

  /**
   * 开始计一个商品详情页的停留时长，返回结束计时的函数。
   *
   * 只统计页面可见的时间：标签页切到后台不算停留。
   * 每 dwellHeartbeatSeconds 秒上报一次累计值，最后结束时再报一次终值。
   * 之所以要心跳而不是只在结束时报一次，是因为用户直接杀掉标签页时
   * 最后那次上报有可能送不出去，心跳保证至少留下一个下界。
   *
   * 服务端对 dwell 走 PUT（覆盖）而不是 POST（累加），所以这里每次都报累计值，
   * 后一次覆盖前一次，不会把心跳叠加成一个荒谬的数字。
   */
  startDwell(itemId: string, source?: string): () => void {
    if (this.disabled || typeof document === "undefined") return () => {};

    let accumulatedMs = 0;
    let segmentStart = document.visibilityState === "visible" ? Date.now() : null;

    const elapsed = () => {
      const live = segmentStart === null ? 0 : Date.now() - segmentStart;
      return accumulatedMs + live;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        segmentStart = Date.now();
      } else if (segmentStart !== null) {
        accumulatedMs += Date.now() - segmentStart;
        segmentStart = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const heartbeat = setInterval(() => {
      this.reportDwell(itemId, source, elapsed());
    }, this.dwellHeartbeatSeconds * 1000);

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      this.reportDwell(itemId, source, elapsed());
    };
  }

  // ---------- 读取 ----------

  /**
   * 拉推荐列表。会把本次会话最近的几条行为一起带上 ——
   * 匿名用户刚打开站点时，这是 gorse 唯一能用的信号。
   */
  async recommend(params?: {
    category?: string;
    n?: number;
    offset?: number;
    sessionEvents?: TrackedEvent[];
  }): Promise<RecommendResult> {
    const now = Date.now();
    return postRecommend(this.gatewayUrl, {
      anonId: anonId(),
      category: params?.category,
      n: params?.n,
      offset: params?.offset,
      sessionEvents: (params?.sessionEvents ?? []).map((e) => toWire(e, now)),
    });
  }

  /** 商品详情页的"相似商品"。不依赖用户画像，冷启动可用。 */
  async similarItems(
    itemId: string,
    params?: { category?: string; n?: number },
  ): Promise<RecommendResult> {
    return postSimilarItems(this.gatewayUrl, {
      itemId,
      category: params?.category,
      n: params?.n,
    });
  }

  // ---------- 生命周期 ----------

  /** 立刻上报队列里的事件。 */
  async flush(): Promise<void> {
    const batch = this.take();
    if (batch.length === 0) return;
    try {
      await postTrack(this.gatewayUrl, {
        anonId: anonId(),
        sessionId: sessionId(),
        events: batch,
      });
    } catch {
      // 埋点是旁路，失败就算了。重新排队反而会在后端故障时越堆越多。
    }
  }

  /** 解绑所有监听，用于热重载或单元测试收尾。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.flushTimer !== null) clearInterval(this.flushTimer);
    this.observer?.disconnect();
    this.observer = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onPageHidden);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onPageHidden);
    }
  }

  // ---------- 内部 ----------

  private start(): void {
    this.flushTimer = setInterval(() => void this.flush(), this.flushIntervalMs);

    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
        threshold: this.impressionRatio,
      });
    }

    // pagehide 覆盖了 bfcache 和真正的卸载，比 unload 可靠；
    // visibilitychange→hidden 覆盖了手机上切走应用（此时 pagehide 未必触发）。
    window.addEventListener("pagehide", this.onPageHidden);
    document.addEventListener("visibilitychange", this.onPageHidden);
  }

  private readonly onPageHidden = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") return;
    this.flushWithBeacon();
  };

  private flushWithBeacon(): void {
    const batch = this.take();
    if (batch.length === 0) return;

    // 超量就切片发，单个 beacon 太大浏览器会整包拒收
    for (let i = 0; i < batch.length; i += BEACON_MAX_EVENTS) {
      const slice = batch.slice(i, i + BEACON_MAX_EVENTS);
      const sent = beaconTrack(this.gatewayUrl, {
        anonId: anonId(),
        sessionId: sessionId(),
        events: slice,
      });
      if (!sent) {
        // beacon 被拒时退回 keepalive fetch。页面正在卸载的话它多半也送不出去，
        // 但 visibilitychange 触发时页面往往还活着，这一步是有意义的。
        void postTrack(this.gatewayUrl, {
          anonId: anonId(),
          sessionId: sessionId(),
          events: slice,
        }).catch(() => {});
      }
    }
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const state = this.observed.get(entry.target);
      if (!state) continue;

      if (entry.isIntersecting && entry.intersectionRatio >= this.impressionRatio) {
        if (state.timer !== null) continue;
        state.timer = window.setTimeout(() => {
          state.timer = null;
          this.recordImpression(state.itemId, state.source);
          // 记过就不用再盯着了，省下后续的回调开销
          this.observed.delete(entry.target);
          this.observer?.unobserve(entry.target);
        }, this.impressionDwellMs);
      } else if (state.timer !== null) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    }
  }

  private recordImpression(itemId: string, source: string): void {
    const key = `${itemId}|${source}`;
    if (this.seenImpressions.has(key)) return;
    this.seenImpressions.add(key);
    this.push({ type: "impression", itemId, source });
  }

  private reportDwell(itemId: string, source: string | undefined, elapsedMs: number): void {
    const seconds = Math.round(elapsedMs / 1000);
    // 不足 1 秒的停留是误触，报上去只会稀释信号
    if (seconds < 1) return;
    this.push({ type: "dwell", itemId, source, value: seconds });
  }

  private push(event: TrackedEvent): void {
    if (this.disabled || this.disposed) return;
    this.queue.push(toWire(event, Date.now()));
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  private take(): WireEvent[] {
    const batch = this.queue;
    this.queue = [];
    return batch;
  }
}

let singleton: Tracker | null = null;

/** 在应用入口调用一次。重复调用会先释放上一个实例。 */
export function initTracker(options: TrackerOptions): Tracker {
  singleton?.dispose();
  singleton = new Tracker(options);
  return singleton;
}

/**
 * 取全局实例。没初始化过就返回一个禁用态的空壳，
 * 这样组件里可以无脑调用，不用到处判空。
 */
export function tracker(): Tracker {
  if (!singleton) {
    singleton = new Tracker({ gatewayUrl: "", disabled: true });
  }
  return singleton;
}

export type { EventType };
