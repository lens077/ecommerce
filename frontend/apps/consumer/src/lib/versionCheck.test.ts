import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * versionCheck 的回归测试：只测检测逻辑本身（比对、通知、检测到即停），
 * 可见性/定时器接线属于浏览器行为，不镜像实现。
 */

const FRESH_BUILD_ID = "currentbuild";

describe("versionCheck", () => {
  let checkNow: typeof import("./versionCheck").checkNow;
  let isUpdateAvailable: typeof import("./versionCheck").isUpdateAvailable;
  let subscribe: typeof import("./versionCheck").subscribeUpdateAvailable;

  beforeEach(async () => {
    vi.resetModules();
    // versionManifest 插件只在 build 时 define，测试里手动注入同一个全局
    vi.stubGlobal("__BUILD_ID__", FRESH_BUILD_ID);
    const mod = await import("./versionCheck");
    checkNow = mod.checkNow;
    isUpdateAvailable = mod.isUpdateAvailable;
    subscribe = mod.subscribeUpdateAvailable;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("version.json 与当前构建一致时不通知", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ buildId: FRESH_BUILD_ID }))),
    );
    const listener = vi.fn();
    subscribe(listener);

    await checkNow();

    expect(listener).not.toHaveBeenCalled();
    expect(isUpdateAvailable()).toBe(false);
  });

  it("发现新 buildId 时通知订阅者，快照翻转为 true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ buildId: "deployed-later" }))),
    );
    const listener = vi.fn();
    subscribe(listener);

    await checkNow();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(isUpdateAvailable()).toBe(true);
  });

  it("检测到一次后停止：不再发请求，也不重复通知", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ buildId: "deployed-later" })));
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    subscribe(listener);

    await checkNow();
    await checkNow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("请求失败时静默：不通知、快照不变", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const listener = vi.fn();
    subscribe(listener);

    await expect(checkNow()).resolves.toBeUndefined();

    expect(listener).not.toHaveBeenCalled();
    expect(isUpdateAvailable()).toBe(false);
  });
});
