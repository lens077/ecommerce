/**
 * Design System - Design Tokens
 *
 * 核心设计原则：极简主义 + 高端质感
 * - 扁平化设计，细边框
 * - 充足的空间感和呼吸感
 * - 深炭黑文本 + 红色强调
 */

export const tokens = {
  // 颜色系统
  colors: {
    // 背景色
    background: {
      primary: "#f9fafb", // 极浅灰白
      card: "#ffffff", // 纯白卡片
      overlay: "rgba(0, 0, 0, 0.5)", // 遮罩层
    },
    // 文本色
    text: {
      primary: "#111827", // 深炭黑（主文本）
      secondary: "#6b7280", // 克制灰色（次要文本）
      disabled: "#d1d5db", // 禁用灰色
      inverse: "#ffffff", // 反色文本
    },
    // 边框色
    border: {
      default: "#e5e7eb", // 极细浅灰边框
      hover: "#d1d5db", // 悬停边框
      focus: "#000000", // 聚焦边框
    },
    // 功能色
    accent: {
      black: "#000000", // 纯黑（主按钮）
      darkGray: "#374151", // 深灰（次要按钮）
      red: "#ef4444", // 红色（价格/警告）
      green: "#10b981", // 绿色（成功）
      blue: "#3b82f6", // 蓝色（链接）
    },
  },

  // 间距系统 (4px base)
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },

  // 圆角系统
  radius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },

  // 阴影系统 (扁平化设计，减少阴影使用)
  shadows: {
    none: "none",
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },

  // 过渡动画
  transitions: {
    fast: "150ms ease",
    normal: "250ms ease",
    slow: "350ms ease",
  },

  // Z-Index 层级
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
} as const;

/**
 * MUI sx 专用的间距（像素字符串）
 *
 * 注意：MUI 的 sx 会把 `p/m/gap/py` 等间距属性的「数字」按主题系数(默认 8px)换算，
 * 直接写 `p: tokens.spacing[4]`(=16) 会变成 128px。这里预先转成 "16px" 字符串，
 * MUI 会当作字面值使用，从而与设计系统的像素间距保持一致。
 * 用法：`sx={{ p: sp[4], gap: sp[2] }}`
 */
export const sp = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

// 便捷的间距常量
export const space = {
  xs: tokens.spacing[1], // 4px
  sm: tokens.spacing[2], // 8px
  md: tokens.spacing[4], // 16px
  lg: tokens.spacing[6], // 24px
  xl: tokens.spacing[8], // 32px
} as const;

// 圆角常量
export const radius = {
  sm: tokens.radius.sm, // 4px
  md: tokens.radius.md, // 8px
  lg: tokens.radius.lg, // 12px
  xl: tokens.radius.xl, // 16px
  full: tokens.radius.full, // 全圆角
} as const;

export type Tokens = typeof tokens;

/**
 * 「灯市」视觉世界 — 纸灯工坊(Akari 语法)
 *
 * 纸为场、竹为架、墨为字、朱砂只给要紧的动作与价格。
 * 首页先行启用;其他 surface 按 DESIGN.md 的迁移路径逐个切换。
 */
export const lantern = {
  // 纸(场)
  paper: "#F6EFE1", // 和纸象牙 — 页面底
  paperAsh: "#EDE5D4", // 纸灰 — 分隔面/图区垫底
  paperLit: "#FFF7E0", // 点灯后的纸 — 卡片亮态
  glow: "#FFE9B8", // 灯心光晕(仅用于内阴影/发光)
  // 墨(字)
  ink: "#2A2A28", // 炭墨 — 主文本
  inkSoft: "#6B6357", // 暖调次级墨 — 次要文本(纸面上 ≥4.5:1)
  // 竹(架)
  bamboo: "#D8B48A", // 竹金 — 结构线/边框(仅装饰,不承载文字)
  bambooDeep: "#77592F", // 深竹 — hover 线/小标(#F6EFE1 纸面上实测 ≥4.5:1)
  // 朱砂(动作)
  vermilion: "#C2372B", // 印章红 — 主动作/价格强调
  vermilionDeep: "#A82D22", // 按下态
  // 字面
  serif: '"Noto Serif SC", "Songti SC", "SimSun", serif',
  // 结构线
  line: "1px solid #D8B48A",
  lineSoft: "1px solid #E5D7BE",
} as const;

export type Lantern = typeof lantern;
