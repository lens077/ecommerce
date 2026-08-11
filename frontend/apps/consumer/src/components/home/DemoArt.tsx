/**
 * 墨线商品插画与类目图标(演示资产,authored)
 *
 * 「灯市」世界的商品图语法:炭墨线稿 + 纸灰垫 + 一点竹金/朱砂。
 * 统一笔画:商品图 stroke 2 / 类目图标 stroke 1.6,round cap/join。
 * 真实商品图(ListProduct)接通后,这套插画退役为兜底占位。
 */

import { lantern } from "@/styles/tokens";

export type ArtKind =
  | "humidifier"
  | "earbuds"
  | "canvasShoe"
  | "thermos"
  | "deskLamp"
  | "pan"
  | "scarf"
  | "keyboard"
  | "plant"
  | "candle"
  | "backpack"
  | "teaSet"
  | "rice";

export type CategoryKind =
  | "digital"
  | "appliance"
  | "fashion"
  | "beauty"
  | "food"
  | "home"
  | "sports"
  | "books";

const INK = lantern.ink;
const ASH = lantern.paperAsh;
const BAMBOO = lantern.bamboo;
const RED = lantern.vermilion;

const strokeProps = {
  fill: "none",
  stroke: INK,
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** 商品墨线插画,viewBox 96×96 */
export function ProductArt({ kind, title }: { kind: ArtKind; title?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      role="img"
      aria-label={title ?? ""}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      {ART[kind]}
    </svg>
  );
}

const ART: Record<ArtKind, React.ReactNode> = {
  humidifier: (
    <g {...strokeProps}>
      <ellipse cx="48" cy="76" rx="20" ry="5" fill={ASH} stroke="none" />
      <path d="M34 74 C30 60 30 46 38 38 C42 34 54 34 58 38 C66 46 66 60 62 74 Z" />
      <path d="M40 38 C40 32 44 28 48 28 C52 28 56 32 56 38" />
      <circle cx="48" cy="56" r="4" fill={RED} stroke="none" />
      <path d="M44 22 C44 18 47 17 47 13" strokeWidth="1.6" stroke={BAMBOO} />
      <path d="M52 20 C52 16 55 15 55 11" strokeWidth="1.6" stroke={BAMBOO} />
    </g>
  ),
  earbuds: (
    <g {...strokeProps}>
      <path d="M26 64 C22 44 34 30 48 30 C62 30 74 44 70 64" />
      <rect x="20" y="58" width="12" height="18" rx="6" fill={ASH} />
      <rect x="64" y="58" width="12" height="18" rx="6" fill={ASH} />
      <circle cx="26" cy="64" r="2.5" fill={RED} stroke="none" />
      <circle cx="70" cy="64" r="2.5" fill={RED} stroke="none" />
    </g>
  ),
  canvasShoe: (
    <g {...strokeProps}>
      <path d="M16 62 C16 54 22 50 30 48 L44 40 C48 38 52 40 56 44 L72 56 C78 58 80 62 80 66 L80 70 L16 70 Z" />
      <path d="M16 70 L80 70 L80 66 C60 70 36 70 16 66 Z" fill={ASH} />
      <path d="M44 44 L50 52 M50 42 L56 50" strokeWidth="1.6" />
      <circle cx="34" cy="52" r="1.6" fill={INK} stroke="none" />
      <circle cx="40" cy="49" r="1.6" fill={INK} stroke="none" />
      <path d="M20 60 C24 58 28 57 32 58" strokeWidth="1.6" stroke={RED} />
    </g>
  ),
  thermos: (
    <g {...strokeProps}>
      <rect x="36" y="30" width="24" height="46" rx="8" />
      <path d="M36 44 L60 44" strokeWidth="1.6" stroke={BAMBOO} />
      <rect x="40" y="20" width="16" height="10" rx="3" fill={ASH} />
      <path d="M42 58 C44 54 52 54 54 58" strokeWidth="1.6" stroke={RED} />
    </g>
  ),
  deskLamp: (
    <g {...strokeProps}>
      <path d="M30 78 L66 78" />
      <path d="M44 78 L44 56 L58 40" />
      <path d="M50 34 L66 46 L58 56 L44 46 Z" fill={ASH} />
      <path d="M48 50 C50 56 46 62 40 66" strokeWidth="1.6" stroke={BAMBOO} />
      <circle cx="56" cy="46" r="2.5" fill={RED} stroke="none" />
    </g>
  ),
  pan: (
    <g {...strokeProps}>
      <path d="M24 48 C24 62 36 70 48 70 C60 70 72 62 72 48 Z" fill={ASH} />
      <path d="M24 48 L14 42" />
      <path d="M72 48 L84 44 L86 48 L74 52" />
      <path d="M36 40 C36 36 39 35 39 31" strokeWidth="1.6" stroke={BAMBOO} />
      <path d="M50 38 C50 34 53 33 53 29" strokeWidth="1.6" stroke={BAMBOO} />
    </g>
  ),
  scarf: (
    <g {...strokeProps}>
      <path
        d="M30 26 C46 20 50 20 66 26 C70 40 70 52 66 64 L58 60 C60 48 60 40 58 32 C50 28 46 28 38 32 C36 44 36 56 38 68 L30 64 C26 50 26 38 30 26 Z"
        fill={ASH}
      />
      <path d="M38 68 L36 80 M44 70 L43 82 M50 70 L50 82" strokeWidth="1.6" />
      <path d="M30 44 L66 40" strokeWidth="1.6" stroke={RED} />
    </g>
  ),
  keyboard: (
    <g {...strokeProps}>
      <rect x="16" y="36" width="64" height="28" rx="4" fill={ASH} />
      <path
        d="M24 44 H30 M36 44 H42 M48 44 H54 M60 44 H66 M24 52 H30 M36 52 H42 M48 52 H60"
        strokeWidth="1.6"
      />
      <rect x="30" y="56" width="30" height="4" rx="2" fill={INK} stroke="none" />
      <circle cx="70" cy="53" r="2.5" fill={RED} stroke="none" />
    </g>
  ),
  plant: (
    <g {...strokeProps}>
      <path d="M38 60 L58 60 L55 76 L41 76 Z" fill={ASH} />
      <path d="M48 60 C48 48 48 42 48 36" />
      <path d="M48 48 C40 46 36 40 36 32 C44 32 48 38 48 44" />
      <path d="M48 44 C56 42 60 36 60 28 C52 28 48 34 48 40" />
      <path d="M42 66 L54 66" strokeWidth="1.6" stroke={RED} />
    </g>
  ),
  candle: (
    <g {...strokeProps}>
      <rect x="34" y="42" width="28" height="34" rx="4" fill={ASH} />
      <path d="M48 42 L48 34" />
      <path d="M48 32 C45 28 46 24 48 21 C50 24 51 28 48 32 Z" fill={RED} stroke={RED} />
      <path d="M38 54 C42 52 54 52 58 54" strokeWidth="1.6" stroke={BAMBOO} />
    </g>
  ),
  backpack: (
    <g {...strokeProps}>
      <path
        d="M32 40 C32 28 40 22 48 22 C56 22 64 28 64 40 L64 70 C64 74 60 76 56 76 L40 76 C36 76 32 74 32 70 Z"
        fill={ASH}
      />
      <path d="M40 22 C40 16 56 16 56 22" />
      <path d="M36 52 L60 52 L60 68 L36 68 Z" />
      <path d="M48 52 L48 60" strokeWidth="1.6" stroke={RED} />
    </g>
  ),
  teaSet: (
    <g {...strokeProps}>
      <path d="M30 44 C30 56 38 62 48 62 C58 62 64 56 64 46 L64 42 L30 42 Z" fill={ASH} />
      <path d="M64 44 C70 44 72 48 70 52 C68 55 66 55 63 54" />
      <path d="M40 36 C40 32 44 30 48 30 C52 30 56 32 56 36" />
      <path d="M26 70 L70 70" />
      <path d="M34 66 L38 66 M56 66 L62 66" strokeWidth="1.6" stroke={BAMBOO} />
    </g>
  ),
  rice: (
    <g {...strokeProps}>
      <path d="M30 30 L66 30 L62 78 L34 78 Z" fill={ASH} />
      <path d="M30 30 C38 34 58 34 66 30" />
      <path
        d="M48 44 C44 50 44 58 48 64 C52 58 52 50 48 44 Z"
        fill="none"
        stroke={RED}
        strokeWidth="1.6"
      />
      <path
        d="M40 50 C38 54 38 58 40 62 M56 50 C58 54 58 58 56 62"
        strokeWidth="1.6"
        stroke={BAMBOO}
      />
    </g>
  ),
};

/**
 * 品牌章面:朱砂方章内的白描纸灯(authored,替代 stock 图标)。
 * 用于 AppBar / Footer 的品牌印,白线随 currentColor。
 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: "block", width: size, height: size }}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* 提梁 */}
        <path d="M9 4 C9 2.6 15 2.6 15 4" />
        {/* 灯身:拱顶纸罩 */}
        <path d="M6.5 12 C6.5 7.6 9 5.4 12 5.4 C15 5.4 17.5 7.6 17.5 12 C17.5 15.4 15.6 17.4 12 17.4 C8.4 17.4 6.5 15.4 6.5 12 Z" />
        {/* 竹肋两根 */}
        <path
          d="M6.9 9.6 C9.4 8.9 14.6 8.9 17.1 9.6 M6.7 13.4 C9.3 14.1 14.7 14.1 17.3 13.4"
          strokeWidth="1.2"
        />
        {/* 底座与穗 */}
        <path d="M10 17.4 L10 19.2 M14 17.4 L14 19.2 M12 17.4 L12 20.6" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

const catStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** 类目墨线图标,viewBox 24×24,颜色随 currentColor */
export function CategoryIcon({ kind }: { kind: CategoryKind }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block", width: 22, height: 22 }}>
      {CATS[kind]}
    </svg>
  );
}

const CATS: Record<CategoryKind, React.ReactNode> = {
  digital: (
    <g {...catStroke}>
      <path d="M6 15 C5 10 8 6 12 6 C16 6 19 10 18 15" />
      <rect x="4" y="13" width="4" height="6" rx="2" />
      <rect x="16" y="13" width="4" height="6" rx="2" />
    </g>
  ),
  appliance: (
    <g {...catStroke}>
      <circle cx="12" cy="11" r="7" />
      <path d="M12 11 C13 8 15 7 17 8 M12 11 C9 10 7 11 7 14 M12 11 C14 14 13 16 10 17" />
      <path d="M9 21 L15 21" />
    </g>
  ),
  fashion: (
    <g {...catStroke}>
      <path d="M9 4 C10 5 14 5 15 4 L20 8 L17 11 L17 20 L7 20 L7 11 L4 8 Z" />
    </g>
  ),
  beauty: (
    <g {...catStroke}>
      <rect x="9" y="9" width="6" height="11" rx="2" />
      <rect x="10.5" y="4" width="3" height="5" rx="1" />
      <path d="M9 13 L15 13" />
    </g>
  ),
  food: (
    <g {...catStroke}>
      <path d="M4 12 L20 12 C20 17 16 20 12 20 C8 20 4 17 4 12 Z" />
      <path d="M9 8 C9 6 10 6 10 4 M14 8 C14 6 15 6 15 4" />
    </g>
  ),
  home: (
    <g {...catStroke}>
      <path d="M6 10 L6 19 M18 10 L18 19" />
      <path d="M6 14 L18 14" />
      <path d="M6 10 C6 7 8 6 12 6 C16 6 18 7 18 10" />
    </g>
  ),
  sports: (
    <g {...catStroke}>
      <path d="M4 15 C8 15 10 11 13 11 C16 12 19 13 20 15 L20 18 L4 18 Z" />
      <path d="M12 12 L14 14 M14.5 11.5 L16.5 13.5" />
    </g>
  ),
  books: (
    <g {...catStroke}>
      <path d="M12 6 C10 4.5 7 4.5 5 5.5 L5 18.5 C7 17.5 10 17.5 12 19 C14 17.5 17 17.5 19 18.5 L19 5.5 C17 4.5 14 4.5 12 6 Z" />
      <path d="M12 6 L12 19" />
    </g>
  ),
};
