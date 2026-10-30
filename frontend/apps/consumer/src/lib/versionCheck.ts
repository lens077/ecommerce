/**
 * 标签页过期检测：发现服务器上出现新构建时通知订阅者（UpdateBanner 渲染提示条）。
 *
 * 触发事故：用户把商城标签页放在后台数天后再切回来，此时服务器上可能已经发过好几版，
 * 老标签页内存里的懒加载 chunk 文件名与新部署的产物对不上——点导航直接 `import()` 404。
 *
 * 机制（三件事，缺一不可）：
 * 1. build 端 versionManifest 插件把每次构建的唯一 buildId 一份编进 JS、一份写进
 *    dist/version.json（见 vite.config.ts）；
 * 2. 本模块在「标签页变为可见」和低频定时器（5 分钟）两个时机 fetch version.json
 *    （带 no-store + 时间戳参数绕过 HTTP 缓存），与内存里的 __BUILD_ID__ 比对；
 * 3. 不一致 → 通知 UI 弹「发现新版本」提示条，由用户点刷新（不打断正在填的表单）。
 *
 * 兜底：老标签页引用的 chunk 已被新部署删除时，动态 import 会先于检测失败，
 * bootstrap.tsx 监听 vite:preloadError 立即触发一次检查，不等用户切走再切回。
 *
 * dev 下不运行（version.json 不存在）；Tauri 桌面端不走 HTTP 静态服务，也不运行。
 * 检测到一次后即停止轮询——用户看到的提示条只对应一个「需要刷新」的事实。
 */

import { isTauri } from "@ecommerce/tauri";

/** 由 vite.config.ts 的 versionManifest 插件 define 注入，本文件必须保持全局声明。 */
declare const __BUILD_ID__: string;

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
// 可见性切换可能高频触发（用户来回切窗口），节流防止对静态资源打点式请求
const MIN_CHECK_GAP_MS = 30 * 1000;

let latestId = __BUILD_ID__;
let started = false;
let stopped = false;
let lastCheckAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;

const listeners = new Set<() => void>();

export function subscribeUpdateAvailable(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** UpdateBanner 的快照：检测到新版本后恒为 true（无回退路径——刷新才解决）。 */
export function isUpdateAvailable(): boolean {
  return latestId !== __BUILD_ID__;
}

function notifyIfNew(remoteId: string): void {
  if (remoteId === latestId || remoteId === __BUILD_ID__) return;
  latestId = remoteId;
  stop();
  for (const listener of listeners) listener();
}

export async function checkNow(): Promise<void> {
  if (stopped) return;
  lastCheckAt = Date.now();
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: string };
    if (typeof data.buildId === "string") notifyIfNew(data.buildId);
  } catch {
    // 离线/网络失败时静默：过期检测不能比内容本身更吵
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  // 节流：30s 内刚查过就不重复
  if (Date.now() - lastCheckAt < MIN_CHECK_GAP_MS) return;
  void checkNow();
}

/** 幂等；dev / Tauri 下直接跳过（调用方判断条件写在这里，防止散落多处）。 */
export function startVersionCheck(): void {
  if (started || import.meta.env.DEV) return;
  if (isTauri()) return;
  started = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  timer = setInterval(() => void checkNow(), CHECK_INTERVAL_MS);
}

function stop(): void {
  stopped = true;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}
