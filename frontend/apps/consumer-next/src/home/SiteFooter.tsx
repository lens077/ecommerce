import { BrandMark } from "@ecommerce/lantern";
import type { HomeCopy } from "./copy";

/**
 * 页脚(服务端渲染)。栏目条目目前没有落地页,渲染成纯文本而不是 `href="#"`——
 * 假链接对爬虫和读屏都是噪音;等页面存在时再换成 <a>。只有 robots / llms.txt 是真实目标。
 */
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
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <p>{copy.footer.copyright(year)}</p>
          <p>
            <a href="/robots.txt">robots.txt</a> · <a href="/llms.txt">llms.txt</a> ·{" "}
            {copy.footer.icp}
          </p>
        </div>
      </div>
    </footer>
  );
}
