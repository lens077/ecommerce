import { BrandMark } from "@ecommerce/lantern";
import type { HomeCopy, Language } from "./copy";
import { HeaderAccount } from "./HeaderAccount";
import { HeaderSearch } from "./HeaderSearch";

/**
 * 站点顶栏(服务端渲染)。购物车、个人中心仍在 SPA,这里是整页跳转的普通链接;
 * 搜索与登录态是两个小岛,首屏 HTML 先出,水合后才有行为。
 */
export function SiteHeader({ lang, copy }: { lang: Language; copy: HomeCopy }) {
  return (
    <header className="site-header">
      <div className="container">
        <a className="brand" href={lang === "zh" ? "/" : `/${lang}`} aria-label={copy.brand}>
          <span className="brand-seal">
            <BrandMark size={20} />
          </span>
          <span className="brand-name">{copy.brand}</span>
        </a>
        <HeaderSearch
          lang={lang}
          placeholder={copy.nav.searchPlaceholder}
          label={copy.nav.searchLabel}
          emptyText={copy.nav.searchEmpty}
          errorText={copy.nav.searchError}
        />
        <nav className="header-actions" aria-label={copy.brand}>
          <a
            className="header-link"
            href={copy.nav.languageHref}
            hrefLang={lang === "zh" ? "en" : "zh"}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 6 H13 M8 4 V6 M5 9 C6 12 9 14.5 12 15.5 M11 9 C10 12 7 14.5 4 15.5 M13 20 L17 10 L21 20 M14.5 17 H19.5" />
              </g>
            </svg>
            <span>{copy.nav.language}</span>
          </a>
          <a className="header-link" href="/cart">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 4 H5.5 L7.5 15 H18 L20.5 8 H6.5" />
                <circle cx="9" cy="19" r="1.4" />
                <circle cx="17" cy="19" r="1.4" />
              </g>
            </svg>
            <span>{copy.nav.cart}</span>
          </a>
          <HeaderAccount signIn={copy.nav.signIn} account={copy.nav.account} />
        </nav>
      </div>
    </header>
  );
}
