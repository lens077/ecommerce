"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 灯阵容器:进入视口才次第点亮(否则动画在折叠线下无人看见时就放完了)。
 * 卡片本身由服务端渲染并作为 children 传入,这个岛只负责加一个 class;
 * 不支持 IntersectionObserver 时直接点亮,永不隐形。
 */
export function LitGrid({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setLit(true);
      return;
    }
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLit(true);
          ob.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  return (
    <div ref={ref} className={lit ? "lantern-grid lantern-grid-lit" : "lantern-grid"}>
      {children}
    </div>
  );
}
