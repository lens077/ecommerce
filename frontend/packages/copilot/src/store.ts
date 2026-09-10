/**
 * 助手状态：每个 CopilotProvider 一份 vanilla store（不是模块单例——测试里要能建多份）。
 * 注册表、消息、执行进度、视觉层状态都在这里，Panel / Overlay 各自用 selector 订阅。
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  CopilotAction,
  CopilotMessage,
  CopilotStatus,
  CurrentStep,
  CursorState,
  OverlayState,
} from "./types";

export interface PendingConfirm {
  text: string;
  resolve: (ok: boolean) => void;
}

export interface CopilotState {
  open: boolean;
  /** 「界面模式」开关：关掉后只在面板里回复，不动页面 */
  uiMode: boolean;
  actions: CopilotAction[];
  messages: CopilotMessage[];
  status: CopilotStatus;
  currentStep: CurrentStep | null;
  overlay: OverlayState;
  cursor: CursorState;
  pendingConfirm: PendingConfirm | null;

  setOpen(open: boolean): void;
  setUiMode(on: boolean): void;
  register(action: CopilotAction): () => void;
  pushMessage(m: Omit<CopilotMessage, "id">): void;
  setStatus(s: CopilotStatus): void;
  setCurrentStep(s: CurrentStep | null): void;
  setOverlay(o: Partial<OverlayState>): void;
  setCursor(c: Partial<CursorState>): void;
  setPendingConfirm(p: PendingConfirm | null): void;
  /** 执行结束（完成/中断/失败）统一收尾：清视觉层与进度 */
  resetRun(): void;
}

export type CopilotStore = StoreApi<CopilotState>;

const INITIAL_OVERLAY: OverlayState = { visible: false, anchor: null, text: null };
const INITIAL_CURSOR: CursorState = { x: -100, y: -100, pressed: false, visible: false };

let messageSeq = 0;

export function createCopilotStore(): CopilotStore {
  return createStore<CopilotState>((set) => ({
    open: false,
    uiMode: true,
    actions: [],
    messages: [],
    status: "idle",
    currentStep: null,
    overlay: INITIAL_OVERLAY,
    cursor: INITIAL_CURSOR,
    pendingConfirm: null,

    setOpen: (open) => set({ open }),
    setUiMode: (uiMode) => set({ uiMode }),
    register: (action) => {
      set((s) => {
        if (s.actions.some((a) => a.name === action.name)) {
          throw new Error(`copilot: 动作 ${action.name} 已注册`);
        }
        return { actions: [...s.actions, action] };
      });
      return () => set((s) => ({ actions: s.actions.filter((a) => a !== action) }));
    },
    pushMessage: (m) => set((s) => ({ messages: [...s.messages, { ...m, id: ++messageSeq }] })),
    setStatus: (status) => set({ status }),
    setCurrentStep: (currentStep) => set({ currentStep }),
    setOverlay: (o) => set((s) => ({ overlay: { ...s.overlay, ...o } })),
    setCursor: (c) => set((s) => ({ cursor: { ...s.cursor, ...c } })),
    setPendingConfirm: (pendingConfirm) => set({ pendingConfirm }),
    resetRun: () =>
      set({
        status: "idle",
        currentStep: null,
        overlay: INITIAL_OVERLAY,
        cursor: INITIAL_CURSOR,
        pendingConfirm: null,
      }),
  }));
}
