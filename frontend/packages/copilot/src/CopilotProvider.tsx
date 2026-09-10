/**
 * 助手入口：持有 store、意图匹配、执行器生命周期与 Esc 中断；渲染 Panel 与 Overlay。
 * 放在各 app 的 __root 里：`<CopilotProvider role="customer" navigate={...}>`。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "@ecommerce/i18n";
import { CopilotOverlay } from "./CopilotOverlay";
import { CopilotPanel } from "./CopilotPanel";
import { findAnchor, findAnchors, prefersReducedMotion } from "./dom";
import { CopilotAbortError, CopilotRunError, runSteps, sleep } from "./executor";
import { COPILOT_NS, ensureCopilotBundle } from "./locales";
import { examplesFor, matchIntent } from "./matcher";
import { createCopilotStore, type CopilotStore } from "./store";
import type { ActionContext, CopilotAction, CopilotRole, Step } from "./types";

export interface CopilotProviderProps {
  /** 当前 app 的角色；叫 copilotRole 而不是 role，避开 jsx-a11y 对 `role=` 的 ARIA 检查 */
  copilotRole: CopilotRole;
  /** 路由跳转，必须走 Router（location 跳转会整页刷新丢状态） */
  navigate: (path: string) => void | Promise<void>;
  children: React.ReactNode;
  /** 单步超时，默认 8000 ms */
  timeoutMs?: number;
  /** 强制减弱动效（测试用）；不传则跟随系统 prefers-reduced-motion */
  reducedMotion?: boolean;
  /** 执行完成后视觉层保留多久再清掉，默认 2000 ms */
  lingerMs?: number;
  /** 是否渲染面板与视觉层，默认 true；测试 hook 时可关 */
  renderUi?: boolean;
}

export interface CopilotApi {
  store: CopilotStore;
  role: CopilotRole;
  /** 提交一句输入：匹配 → 执行 */
  submit: (text: string) => Promise<void>;
  /** 中断当前执行 */
  abort: () => void;
}

const CopilotContext = createContext<CopilotApi | null>(null);

export function CopilotProvider({
  copilotRole: role,
  navigate,
  children,
  timeoutMs,
  reducedMotion,
  lingerMs = 2000,
  renderUi = true,
}: CopilotProviderProps) {
  const [store] = useState(() => {
    ensureCopilotBundle();
    return createCopilotStore();
  });
  const { t } = useTranslation(COPILOT_NS);
  const abortRef = useRef<AbortController | null>(null);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });

  const describe = useCallback(
    (step: Step): string => {
      switch (step.kind) {
        case "navigate":
          return t("step.navigate", { path: step.path });
        case "highlight":
          return step.text;
        case "type":
          return t("step.type", { value: step.value });
        case "press":
          return t("step.press", { key: step.key });
        case "say":
          return step.text;
        case "confirm":
          return step.text;
        default:
          return t(`step.${step.kind}`);
      }
    },
    [t],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const s = store.getState();
      if (s.status !== "idle") return;
      s.pushMessage({ from: "user", text });

      const match = matchIntent(s.actions, role, text);
      if (!match) {
        s.pushMessage({
          from: "assistant",
          text: t("unmatched"),
          examples: examplesFor(s.actions, role),
        });
        return;
      }
      const ctx = buildActionContext(role);
      const planned = match.action.plan(match.params, ctx);
      const steps: Step[] = match.action.sensitive
        ? [
            {
              kind: "confirm",
              text: describe(planned[0] ?? { kind: "say", text: match.action.name }),
            },
            ...planned,
          ]
        : planned;

      if (!s.uiMode) {
        const outline = steps
          .filter((st) => st.kind !== "waitFor" && st.kind !== "moveCursor")
          .map((st, i) => `${i + 1}. ${describe(st)}`)
          .join("\n");
        s.pushMessage({ from: "assistant", text: `${t("uiModeOff")}\n${outline}` });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      s.setStatus("running");
      const reduced = reducedMotion ?? prefersReducedMotion();
      try {
        await runSteps(steps, {
          store,
          navigate: (p) => navigateRef.current(p),
          signal: controller.signal,
          timeoutMs,
          reducedMotion: reduced,
          describe,
        });
        const summary = match.action.summarize?.(match.params, ctx);
        store.getState().pushMessage({ from: "assistant", text: summary || t("done") });
        store.getState().setStatus("idle");
        store.getState().setCurrentStep(null);
        // 让用户看清最后一步停在哪里，再收视觉层；期间 Esc 可立即收
        await sleep(reduced ? 0 : lingerMs, controller.signal).catch(() => undefined);
      } catch (e) {
        if (e instanceof CopilotAbortError) {
          store.getState().pushMessage({ from: "assistant", text: t("interrupted") });
        } else if (e instanceof CopilotRunError) {
          store.getState().pushMessage({
            from: "assistant",
            text: t("failed", { index: e.index + 1, text: describe(e.step) }),
          });
        } else {
          throw e;
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        store.getState().resetRun();
      }
    },
    [describe, lingerMs, reducedMotion, role, store, t, timeoutMs],
  );

  // Esc 在任意步之间停止（设计 §4.4）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && store.getState().status !== "idle") abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abort, store]);

  const api = useMemo<CopilotApi>(
    () => ({ store, role, submit, abort }),
    [store, role, submit, abort],
  );

  return (
    <CopilotContext.Provider value={api}>
      {children}
      {renderUi && (
        <>
          <CopilotPanel api={api} />
          <CopilotOverlay store={store} />
        </>
      )}
    </CopilotContext.Provider>
  );
}

export function useCopilot(): CopilotApi {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot 必须在 CopilotProvider 内使用");
  return ctx;
}

/** 注册一个动作；组件卸载即注销。传模块级常量或 useMemo 过的对象，否则每次渲染都会重注册。 */
export function useCopilotAction(action: CopilotAction): void {
  const { store } = useCopilot();
  useEffect(() => store.getState().register(action), [store, action]);
}

function buildActionContext(role: CopilotRole): ActionContext {
  return {
    role,
    get pathname() {
      return window.location.pathname;
    },
    find: (a) => findAnchor(a),
    count: (a) => findAnchors(a).length,
    texts: (a) =>
      findAnchors(a)
        .map((el) => (el.innerText || el.textContent || "").trim())
        .filter(Boolean),
  };
}
