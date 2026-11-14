"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 关闭必须连带 abort 在途请求:响应迟到时 onSubmit 里的 setState 会把刚关掉的下拉
  // 重新拉起来(点外关闭原有此问题,Esc 关闭同样会踩)。
  const close = useCallback(() => {
    abortRef.current?.abort();
    setState({ kind: "idle" });
  }, []);

  // 点到外面就收起下拉
  useEffect(() => {
    if (state.kind === "idle") return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [state.kind, close]);

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
    <div
      className="header-search"
      ref={rootRef}
      onKeyDown={(e) => {
        // Esc 收起下拉(键盘可达性):事件沿 DOM 冒泡,焦点在输入框或结果链接上都生效。
        // 组合态(IME 选字)的 Escape 不拦——那是取消当前拼音,不是关下拉,与 AppBar 的
        // isComposing 守卫同理。结果链接随卸载失焦,焦点送回输入框。
        if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
        close();
        inputRef.current?.focus();
      }}
    >
      <form role="search" onSubmit={onSubmit}>
        <input
          ref={inputRef}
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
