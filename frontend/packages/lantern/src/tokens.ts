/**
 * 「灯市」视觉世界 — 纸灯工坊(Akari 语法)
 *
 * 纸为场、竹为架、墨为字、朱砂只给要紧的动作与价格。
 * 这份 token 是两个前端(consumer SPA 与 consumer-next SSR)共用的唯一真相源:
 * 首页由 consumer-next 服务端渲染,其他 surface 仍在 SPA;颜色改这里,两边一起变。
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
