"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Language } from "./copy";
import type { SearchProduct } from "./search-client";

interface Props {
  lang: Language;
  placeholder: string;
  label: string;
  emptyText: string;
  errorText: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; items: SearchProduct[] }
  | { kind: "error" };

/**
 * 顶栏搜索:提交后调用搜索服务,下拉列出结果,点击进商品 SSR 页。
 * RPC 客户端在首次提交时才动态加载,避免首屏 JS 携带 protobuf 运行时。
 */
export function HeaderSearch({ lang, placeholder, label, emptyText, errorText }: Props) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 点到外面就收起下拉
  useEffect(() => {
    if (state.kind === "idle") return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setState({ kind: "idle" });
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [state.kind]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ kind: "loading" });
    try {
      const { searchProducts } = await import("./search-client");
      const items = await searchProducts(name, ac.signal);
      if (!ac.signal.aborted) setState({ kind: "results", items });
    } catch {
      if (!ac.signal.aborted) setState({ kind: "error" });
    }
  }

  return (
    <div className="header-search" ref={rootRef}>
      <form role="search" onSubmit={onSubmit}>
        <input
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" aria-label={label}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="6" />
              <path d="M15.5 15.5 L20 20" />
            </g>
          </svg>
        </button>
      </form>
      {state.kind !== "idle" && (
        <ul className="header-search-results" aria-live="polite">
          {state.kind === "loading" && (
            <li>
              <p>…</p>
            </li>
          )}
          {state.kind === "error" && (
            <li>
              <p role="alert">{errorText}</p>
            </li>
          )}
          {state.kind === "results" && state.items.length === 0 && (
            <li>
              <p>{emptyText}</p>
            </li>
          )}
          {state.kind === "results" &&
            state.items.map((p) => (
              <li key={p.spuCode}>
                <a href={`/${lang}/product/${encodeURIComponent(p.spuCode)}`}>
                  {p.name}
                  <span className="price">¥{p.price}</span>
                </a>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
