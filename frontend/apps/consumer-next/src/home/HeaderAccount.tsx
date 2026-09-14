"use client";

import { useEffect, useState } from "react";
import { bffBaseUrl } from "./gateway";

interface Props {
  signIn: string;
  account: string;
}

/**
 * 顶栏登录态:服务端先渲染「登录」链接(匿名态),水合后问一次 /auth/me,
 * 已登录则换成「个人中心」。cookie 是 httpOnly,前端只能这样拿登录态。
 * 登录/个人中心都是整页跳转:登录去网关 BFF,个人中心在 SPA。
 */
export function HeaderAccount({ signIn, account }: Props) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loginHref, setLoginHref] = useState("/profile");

  useEffect(() => {
    const base = bffBaseUrl();
    setLoginHref(`${base}/auth/login?redirect=${encodeURIComponent(window.location.href)}`);
    const ac = new AbortController();
    fetch(`${base}/auth/me`, { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { authenticated?: boolean } | null) => {
        if (me?.authenticated) setAuthenticated(true);
      })
      .catch(() => {
        /* 匿名态保持「登录」 */
      });
    return () => ac.abort();
  }, []);

  if (authenticated) {
    return (
      <a className="header-link" href="/profile" aria-label={account}>
        <AccountGlyph />
        <span>{account}</span>
      </a>
    );
  }
  return (
    <a className="header-link header-link--seal" href={loginHref}>
      {signIn}
    </a>
  );
}

function AccountGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 19.5 C6 15.5 9 14 12 14 C15 14 18 15.5 19 19.5" />
      </g>
    </svg>
  );
}
