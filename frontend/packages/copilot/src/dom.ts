/**
 * 直接操作 DOM 的三个已知坑（设计 §4.4）都收在这里，执行器不直接碰 DOM API：
 *  - 受控 <input>：React 追踪的是原型 setter，`el.value = x` 不触发 onChange；
 *  - MUI Select：监听 mousedown 不是 click，派发 click 打不开菜单；
 *  - 页面跳转：只走 Router navigate，本文件不提供 location 跳转。
 */

export const ANCHOR_ATTR = "data-copilot";

export function anchorSelector(anchor: string): string {
  return `[${ANCHOR_ATTR}="${anchor}"]`;
}

export function findAnchor(anchor: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(anchorSelector(anchor));
}

export function findAnchors(anchor: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(anchorSelector(anchor)));
}

/** 元素是否在文档流里可见（display:none / 已卸载都算不可见） */
export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  const rects = el.getClientRects();
  // jsdom 没有布局，getClientRects 恒为空；退化为「在文档里」
  if (
    typeof rects.length === "number" &&
    rects.length === 0 &&
    el.getBoundingClientRect().width === 0
  ) {
    return el.ownerDocument.defaultView?.getComputedStyle(el).display !== "none";
  }
  return true;
}

export interface WaitOptions {
  timeoutMs: number;
  signal: AbortSignal;
  intervalMs?: number;
}

/** 轮询等锚点出现并可见；超时或被中断都 reject */
export function waitForAnchor(anchor: string, opts: WaitOptions): Promise<HTMLElement> {
  const interval = opts.intervalMs ?? 50;
  const deadline = Date.now() + opts.timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (opts.signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      const el = findAnchor(anchor);
      if (el && isVisible(el)) return resolve(el);
      if (Date.now() >= deadline) return reject(new Error(`anchor-timeout:${anchor}`));
      setTimeout(tick, interval);
    };
    tick();
  });
}

/** 不在视口内才滚动，避免每步都跳一下 */
export function ensureInViewport(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const inside = r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw;
  if (!inside && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant" as ScrollBehavior,
    });
  }
}

/** 受控输入框赋值：走原型 setter 再派发 input，React 的 onChange 才会被调用 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) descriptor.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 找到锚点下真正的输入元素（锚点可能标在包装 div 上） */
export function resolveInput(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  return el.querySelector("input, textarea");
}

export function pressKey(el: HTMLElement, key: string): void {
  const init: KeyboardEventInit = { key, code: key, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
}

/** 与用户点击等价的一次点击：pointer/mouse 序列 + click，React 与 MUI 都能收到 */
export function clickElement(el: HTMLElement): void {
  const base = { bubbles: true, cancelable: true, button: 0 };
  el.dispatchEvent(new MouseEvent("mousedown", base));
  el.dispatchEvent(new MouseEvent("mouseup", base));
  el.dispatchEvent(new MouseEvent("click", base));
}

/**
 * MUI Select 的可见部分是 role="combobox" 的 div，它在 onMouseDown 里开菜单
 * （并且要求 button === 0）。锚点可能标在 combobox 本身或其包装上。
 */
export function openMuiSelect(el: HTMLElement): void {
  const combobox =
    el.getAttribute("role") === "combobox"
      ? el
      : el.querySelector<HTMLElement>('[role="combobox"]');
  const target = combobox ?? el;
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
}

export function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}
