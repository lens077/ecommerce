/**
 * 登出重置身份的回归测试。
 *
 * 服务端会把「登录请求里带的 anonId」之前的匿名行为并进该用户画像，
 * 所以登出时既要换掉 anonId（防共享设备串号），又不能把登出前还没发出去的事件
 * 记到新身份头上。这两条错了都不会报错，只会让画像悄悄变脏。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { anonId, sessionId } from "./identity";
import { Tracker } from "./tracker";

interface SentPayload {
  anonId: string;
  sessionId: string;
  events: { itemId: string }[];
}

/** 最小的内存版 Storage，只实现 identity.ts 用到的方法。 */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("Tracker.resetIdentity", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let tracker: Tracker | null = null;

  beforeEach(() => {
    // Node 22+ 自带一个全局 localStorage getter，没配 --localstorage-file 时返回 undefined，
    // 会把 jsdom 的实现整个遮住（window.localStorage 也一样）。不注入的话 identity.ts
    // 会降级成「每次调用都生成新 id」，下面「重置后换了 id」的断言就成了假绿。
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    tracker?.dispose();
    tracker = null;
    vi.unstubAllGlobals();
  });

  function sentPayloads(): SentPayload[] {
    return fetchMock.mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string) as SentPayload,
    );
  }

  it("登出后生成新的 anonId 与 sessionId", () => {
    tracker = new Tracker({ gatewayUrl: "http://gw" });
    const oldAnon = anonId();
    const oldSession = sessionId();
    // 前提：存储可用时标识是稳定的。这条不成立，下面的「换了」就没有意义。
    expect(anonId()).toBe(oldAnon);
    expect(sessionId()).toBe(oldSession);

    tracker.resetIdentity();

    expect(anonId(), "共享设备上的下一个人不能沿用上一个人的匿名标识").not.toBe(oldAnon);
    expect(sessionId(), "会话标识同样要换，曝光去重按会话划窗").not.toBe(oldSession);
  });

  it("登出前积压的事件仍以旧身份发出", () => {
    tracker = new Tracker({ gatewayUrl: "http://gw" });
    const oldAnon = anonId();
    tracker.read("SPU-1");

    tracker.resetIdentity();

    const payloads = sentPayloads();
    expect(payloads, "积压事件应在清身份前立即发出，而不是等下一个 flush 周期").toHaveLength(1);
    expect(payloads[0].anonId, "登出前的行为属于登出前的身份").toBe(oldAnon);
    expect(payloads[0].events.map((e) => e.itemId)).toEqual(["SPU-1"]);
    expect(anonId()).not.toBe(oldAnon);
  });

  it("认证失效时丢弃积压事件，下一身份只能发送自己的事件", async () => {
    tracker = new Tracker({ gatewayUrl: "http://gw" });
    const oldAnon = anonId();
    const oldSession = sessionId();
    tracker.read("OLD-USER-ITEM");

    tracker.resetIdentity({ discardQueuedEvents: true });

    expect(fetchMock, "失效会话不再发送旧事件").not.toHaveBeenCalled();
    expect(anonId()).not.toBe(oldAnon);
    expect(sessionId()).not.toBe(oldSession);
    tracker.read("NEW-USER-ITEM");
    await tracker.flush();
    expect(sentPayloads()).toEqual([
      expect.objectContaining({
        anonId: anonId(),
        sessionId: sessionId(),
        events: [expect.objectContaining({ itemId: "NEW-USER-ITEM" })],
      }),
    ]);
  });

  it("埋点被禁用时不发请求，但照样清掉存储里的旧标识", () => {
    const oldAnon = anonId();
    tracker = new Tracker({ gatewayUrl: "", disabled: true });

    tracker.resetIdentity();

    expect(fetchMock, "禁用态不能有任何网络请求").not.toHaveBeenCalled();
    expect(anonId(), "用户可能先同意后拒绝，存储里残留的标识也要换掉").not.toBe(oldAnon);
  });
});
