/**
 * 视觉层（设计 §4.5）：朱红渐变流动描边的全屏蒙层 + 挖洞聚焦 + 元素描边 + 大指针 + 步骤文字。
 * 颜色取灯市 token（DESIGN.md）：蒙层是炭墨 35%，描边 vermilion → glow → vermilion。
 * 全部 pointer-events: none——它只负责「看」，不拦用户的鼠标；停止靠面板按钮或 Esc。
 */
import { useCallback, useSyncExternalStore } from "react";
import { Box } from "@mui/material";
import { keyframes } from "@emotion/react";
import { useStore } from "zustand";
import { findAnchor } from "./dom";
import type { CopilotStore } from "./store";

// 与 DESIGN.md / apps/*/src/styles/tokens.ts 的 lantern 一致；包不依赖 app，所以复制这四个值
export const LANTERN = {
  paper: "#F6EFE1",
  ink: "#2A2A28",
  glow: "#FFE9B8",
  vermilion: "#C2372B",
  vermilionDeep: "#A82D22",
  bamboo: "#D8B48A",
} as const;

const Z_OVERLAY = 1400; // 高于 MUI Modal(1300)，低于面板(1500)
const GRADIENT = `linear-gradient(135deg, ${LANTERN.vermilion}, ${LANTERN.glow}, ${LANTERN.vermilion})`;
const HOLE_PAD = 6;
const HOLE_RADIUS = 8;

const flow = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 300% 50%; }
`;

/** 只保留边框的渐变框：padding 当边宽，mask 把内容区抠掉 */
const gradientFrame = (width: number, animate: boolean) => ({
  padding: `${width}px`,
  background: GRADIENT,
  backgroundSize: "300% 300%",
  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
  WebkitMaskComposite: "xor",
  maskComposite: "exclude",
  animation: animate ? `${flow} 4s linear infinite` : "none",
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
});

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 锚点矩形跟随滚动/缩放：用 useSyncExternalStore 订阅 scroll/resize/ResizeObserver，
 * 快照是一串数字（原始值，比较稳定），不在 effect 里 setState。
 */
function useAnchorRect(anchor: string | null): Rect | null {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!anchor) return () => undefined;
      const el = findAnchor(anchor);
      const ro = el && typeof ResizeObserver === "function" ? new ResizeObserver(notify) : null;
      if (el) ro?.observe(el);
      window.addEventListener("scroll", notify, true);
      window.addEventListener("resize", notify);
      return () => {
        ro?.disconnect();
        window.removeEventListener("scroll", notify, true);
        window.removeEventListener("resize", notify);
      };
    },
    [anchor],
  );
  const snapshot = useCallback((): string => {
    if (!anchor) return "";
    const el = findAnchor(anchor);
    if (!el) return "";
    const r = el.getBoundingClientRect();
    return `${r.top},${r.left},${r.width},${r.height}`;
  }, [anchor]);
  const key = useSyncExternalStore(subscribe, snapshot, () => "");
  if (!key) return null;
  const [top, left, width, height] = key.split(",").map(Number);
  return { top, left, width, height };
}

export function CopilotOverlay({ store }: { store: CopilotStore }) {
  const overlay = useStore(store, (s) => s.overlay);
  const cursor = useStore(store, (s) => s.cursor);
  const rect = useAnchorRect(overlay.visible ? overlay.anchor : null);

  if (!overlay.visible && !cursor.visible) return null;

  const hole = rect
    ? {
        top: rect.top - HOLE_PAD,
        left: rect.left - HOLE_PAD,
        width: rect.width + HOLE_PAD * 2,
        height: rect.height + HOLE_PAD * 2,
      }
    : null;
  // 文字放在目标下方；贴近底边时改放上方
  const labelBelow = hole ? hole.top + hole.height + 56 < window.innerHeight : true;

  return (
    <Box
      data-copilot-ui="overlay"
      aria-hidden
      sx={{ position: "fixed", inset: 0, zIndex: Z_OVERLAY, pointerEvents: "none" }}
    >
      {overlay.visible && (
        <>
          {/* 蒙层：有目标时用挖洞元素的巨大外阴影当蒙层，圆角天然跟着洞走 */}
          {hole ? (
            <Box
              data-copilot-ui="hole"
              sx={{
                position: "fixed",
                ...hole,
                borderRadius: `${HOLE_RADIUS}px`,
                boxShadow: `0 0 0 200vmax rgba(42, 42, 40, 0.35)`,
                transition: "top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease",
              }}
            />
          ) : (
            <Box sx={{ position: "fixed", inset: 0, background: "rgba(42, 42, 40, 0.35)" }} />
          )}
          {/* 四边流动的品牌渐变描边 */}
          <Box
            data-copilot-ui="frame"
            sx={{ position: "fixed", inset: 0, ...gradientFrame(3, true) }}
          />
          {/* 目标元素描边 + 光晕 */}
          {hole && (
            <Box
              data-copilot-ui="ring"
              sx={{
                position: "fixed",
                ...hole,
                borderRadius: `${HOLE_RADIUS}px`,
                boxShadow: `0 0 0 4px rgba(255, 233, 184, 0.4)`,
                ...gradientFrame(2, true),
                transition: "top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease",
              }}
            />
          )}
          {hole && overlay.text && (
            <Box
              data-copilot-ui="label"
              sx={{
                position: "fixed",
                left: Math.max(12, Math.min(hole.left, window.innerWidth - 332)),
                top: labelBelow ? hole.top + hole.height + 12 : undefined,
                bottom: labelBelow ? undefined : window.innerHeight - hole.top + 12,
                maxWidth: 320,
                px: 1.5,
                py: 1,
                bgcolor: LANTERN.paper,
                color: LANTERN.ink,
                borderLeft: `3px solid ${LANTERN.vermilion}`,
                borderRadius: "6px",
                boxShadow: "0 6px 18px rgba(42, 42, 40, 0.18)",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {overlay.text}
            </Box>
          )}
        </>
      )}
      {cursor.visible && (
        <Box
          data-copilot-ui="cursor"
          component="svg"
          viewBox="0 0 32 32"
          sx={{
            position: "fixed",
            left: 0,
            top: 0,
            width: 32,
            height: 32,
            transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${cursor.pressed ? 0.85 : 1})`,
            transformOrigin: "6px 4px",
            transition: "transform 120ms ease",
            filter: "drop-shadow(0 2px 4px rgba(42, 42, 40, 0.35))",
          }}
        >
          <path
            d="M6 4 L6 26 L12 20 L16 29 L20 27 L16 18 L24 18 Z"
            fill={LANTERN.vermilion}
            stroke={LANTERN.paper}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </Box>
      )}
    </Box>
  );
}
