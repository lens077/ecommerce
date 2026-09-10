/**
 * 大指针的移动路径：三次贝塞尔，控制点在起终点连线两侧随机偏移，看起来像人手在动
 * （思路来自 ghost-cursor 的 path()，这里只要一个函数，不引依赖）。
 */

export interface Point {
  x: number;
  y: number;
}

export function bezierPath(from: Point, to: Point, steps: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  // 偏移量随距离缩放，短距离几乎直线，长距离有明显弧度
  const spread = Math.min(dist * 0.25, 120);
  const c1: Point = {
    x: from.x + dx * 0.3 + (Math.random() - 0.5) * spread,
    y: from.y + dy * 0.3 + (Math.random() - 0.5) * spread,
  };
  const c2: Point = {
    x: from.x + dx * 0.7 + (Math.random() - 0.5) * spread,
    y: from.y + dy * 0.7 + (Math.random() - 0.5) * spread,
  };
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = easeInOut(i / steps);
    pts.push(cubic(from, c1, c2, to, t));
  }
  return pts;
}

/** 移动用时：随距离 300–700 ms（设计 §4.4） */
export function durationFor(from: Point, to: Point): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.round(300 + Math.min(dist / 1200, 1) * 400);
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
