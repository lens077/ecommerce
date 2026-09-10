/**
 * 执行器：串行状态机，每步有超时，任一步失败整体停止（设计 §4.4）。
 * 视觉层通过 store 驱动（Overlay 订阅 overlay/cursor），DOM 操作全部经 dom.ts。
 */
import { bezierPath, durationFor, type Point } from "./cursor";
import {
  centerOf,
  clickElement,
  ensureInViewport,
  findAnchor,
  openMuiSelect,
  pressKey,
  resolveInput,
  setNativeValue,
  waitForAnchor,
} from "./dom";
import type { CopilotStore } from "./store";
import type { Step } from "./types";

export interface ExecutorContext {
  store: CopilotStore;
  navigate: (path: string) => void | Promise<void>;
  signal: AbortSignal;
  /** 单步超时（含等锚点），默认 8000 */
  timeoutMs?: number;
  /** 用户开了减弱动效，或测试环境：指针瞬移、逐字输入改为一次写入 */
  reducedMotion?: boolean;
  /** 逐字输入的每字延迟范围，默认 30–60 ms */
  typingDelayMs?: [number, number];
  /** 步骤的展示文案（i18n 在 Provider 里做，执行器不依赖 i18next） */
  describe: (step: Step) => string;
}

export class CopilotRunError extends Error {
  constructor(
    public readonly step: Step,
    public readonly index: number,
    public readonly reason: string,
  ) {
    super(`copilot step ${index} (${step.kind}) failed: ${reason}`);
    this.name = "CopilotRunError";
  }
}

export class CopilotAbortError extends Error {
  constructor() {
    super("copilot run aborted");
    this.name = "CopilotAbortError";
  }
}

export async function runSteps(steps: Step[], ctx: ExecutorContext): Promise<void> {
  const { store } = ctx;
  const timeout = ctx.timeoutMs ?? 8000;
  for (let i = 0; i < steps.length; i++) {
    throwIfAborted(ctx.signal);
    const step = steps[i];
    store.getState().setCurrentStep({ index: i, total: steps.length, text: ctx.describe(step) });
    try {
      await withTimeout(runOne(step, ctx), timeout, ctx.signal);
    } catch (e) {
      if (isAbort(e)) throw new CopilotAbortError();
      throw new CopilotRunError(step, i, e instanceof Error ? e.message : String(e));
    }
  }
}

async function runOne(step: Step, ctx: ExecutorContext): Promise<void> {
  const { store, signal } = ctx;
  const s = store.getState();
  switch (step.kind) {
    case "navigate": {
      await ctx.navigate(step.path);
      // 路由切换后让 React 提交一帧，后续 waitFor 才能看到新页面
      await sleep(0, signal);
      return;
    }
    case "waitFor": {
      const el = await waitForAnchor(step.anchor, { timeoutMs: ctx.timeoutMs ?? 8000, signal });
      ensureInViewport(el);
      return;
    }
    case "moveCursor": {
      const el = await waitForAnchor(step.anchor, { timeoutMs: ctx.timeoutMs ?? 8000, signal });
      ensureInViewport(el);
      await moveCursorTo(centerOf(el), ctx);
      return;
    }
    case "highlight": {
      const el = await waitForAnchor(step.anchor, { timeoutMs: ctx.timeoutMs ?? 8000, signal });
      ensureInViewport(el);
      s.setOverlay({ visible: true, anchor: step.anchor, text: step.text });
      // 停一拍让用户看清聚焦到了哪里
      await sleep(ctx.reducedMotion ? 0 : 500, signal);
      return;
    }
    case "type": {
      const el = await waitForAnchor(step.anchor, { timeoutMs: ctx.timeoutMs ?? 8000, signal });
      const input = resolveInput(el);
      if (!input) throw new Error(`not-an-input:${step.anchor}`);
      input.focus();
      if (ctx.reducedMotion) {
        setNativeValue(input, step.value);
        return;
      }
      const [lo, hi] = ctx.typingDelayMs ?? [30, 60];
      for (let i = 1; i <= step.value.length; i++) {
        throwIfAborted(signal);
        setNativeValue(input, step.value.slice(0, i));
        await sleep(lo + Math.random() * (hi - lo), signal);
      }
      return;
    }
    case "press": {
      const el = await waitForAnchor(step.anchor, { timeoutMs: ctx.timeoutMs ?? 8000, signal });
      const input = resolveInput(el) ?? el;
      pressKey(input, step.key);
      return;
    }
    case "click": {
      const el = await waitForAnchor(step.anchor, { timeoutMs: ctx.timeoutMs ?? 8000, signal });
      ensureInViewport(el);
      await moveCursorTo(centerOf(el), ctx);
      await pressAnimation(ctx);
      clickElement(el);
      return;
    }
    case "select": {
      const el = await waitForAnchor(step.anchor, { timeoutMs: ctx.timeoutMs ?? 8000, signal });
      ensureInViewport(el);
      await moveCursorTo(centerOf(el), ctx);
      await pressAnimation(ctx);
      openMuiSelect(el);
      const option = await waitForAnchor(step.optionAnchor, {
        timeoutMs: ctx.timeoutMs ?? 8000,
        signal,
      });
      await moveCursorTo(centerOf(option), ctx);
      await pressAnimation(ctx);
      clickElement(option);
      return;
    }
    case "say": {
      s.pushMessage({ from: "assistant", text: step.text });
      return;
    }
    case "confirm": {
      s.setStatus("awaiting-confirm");
      const ok = await new Promise<boolean>((resolve) => {
        s.setPendingConfirm({ text: step.text, resolve });
        signal.addEventListener("abort", () => resolve(false), { once: true });
      });
      s.setPendingConfirm(null);
      s.setStatus("running");
      if (!ok) throw new DOMException("aborted", "AbortError");
      return;
    }
  }
}

async function moveCursorTo(to: Point, ctx: ExecutorContext): Promise<void> {
  const { store, signal } = ctx;
  const cur = store.getState().cursor;
  const from: Point = cur.visible
    ? { x: cur.x, y: cur.y }
    : { x: window.innerWidth - 80, y: window.innerHeight - 80 };
  if (ctx.reducedMotion) {
    store.getState().setCursor({ x: to.x, y: to.y, visible: true });
    return;
  }
  const duration = durationFor(from, to);
  const frames = Math.max(8, Math.round(duration / 16));
  const path = bezierPath(from, to, frames);
  store.getState().setCursor({ x: from.x, y: from.y, visible: true });
  for (const p of path) {
    throwIfAborted(signal);
    store.getState().setCursor({ x: p.x, y: p.y });
    await nextFrame(signal);
  }
  store.getState().setCursor({ x: to.x, y: to.y });
}

async function pressAnimation(ctx: ExecutorContext): Promise<void> {
  const { store, signal } = ctx;
  store.getState().setCursor({ pressed: true });
  await sleep(ctx.reducedMotion ? 0 : 120, signal);
  store.getState().setCursor({ pressed: false });
}

/* ---------- 小工具 ---------- */

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function nextFrame(signal: AbortSignal): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return sleep(16, signal);
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    requestAnimationFrame(() => resolve());
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`step-timeout:${ms}ms`)), ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        clearTimeout(id);
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
}

function isAbort(e: unknown): boolean {
  return (e instanceof DOMException && e.name === "AbortError") || e instanceof CopilotAbortError;
}

/** 给 summarize 用的只读页面上下文 */
export function readAnchor(anchor: string): HTMLElement | null {
  return findAnchor(anchor);
}
