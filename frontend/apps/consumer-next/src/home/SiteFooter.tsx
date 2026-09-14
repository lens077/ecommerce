import { BrandMark } from "@ecommerce/lantern";
import type { HomeCopy } from "./copy";

/** 页脚(服务端渲染)。链接目标与 SPA Footer 一致:目前均为占位 `#`。 */
export function SiteFooter({ copy }: { copy: HomeCopy }) {
  const year = new Date().getFullYear();
  const cols = [
    {
      title: copy.footer.about.title,
      items: [copy.footer.about.company, copy.footer.about.contact, copy.footer.about.careers],
    },
    {
      title: copy.footer.help.title,
      items: [copy.footer.help.faq, copy.footer.help.guide, copy.footer.help.afterSales],
    },
    {
      title: copy.footer.legal.title,
      items: [copy.footer.legal.privacy, copy.footer.legal.terms, copy.footer.legal.cookie],
    },
  ];
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <span className="brand">
              <span className="brand-seal">
                <BrandMark size={20} />
              </span>
              <span className="brand-name">{copy.brand}</span>
            </span>
            <p>{copy.footer.tagline}</p>
          </div>
          {cols.map((col) => (
            <div className="footer-col" key={col.title}>
              <h3>{col.title}</h3>
              <ul>
                {col.items.map((item) => (
                  <li key={item}>
                    <a href="#">{item}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <p>{copy.footer.copyright(year)}</p>
          <p>
            <a href="#">{copy.footer.sitemap}</a> · <a href="#">{copy.footer.icp}</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
