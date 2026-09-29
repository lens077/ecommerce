import type { Metadata } from "next";
import type { ReactNode } from "react";
import { UmamiAnalytics } from "@/analytics/umami";
import { homeCopy, isLanguage } from "@/home/copy";

const SUPPORTED_LANGUAGES = ["zh", "en"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const copy = homeCopy[isLanguage(lang) ? lang : "zh"];
  return {
    // 子页面标题 →「页面标题 - 站点名」：百度《网页标题规范》内容页格式要求站点名放最末，
    // 间隔符按该规范的建议统一用 `-`（`|` `_` `——` 都在它的改用清单里）。站点名随语言走，
    // 英文页不能挂中文品牌。
    title: { default: copy.brand, template: `%s - ${copy.brand}` },
    description: copy.description,
  };
}

// 路径段 zh → 页面声明 zh-CN(与 SPA 的 <html lang> 一致,搜索引擎按 BCP 47 识别)
const HTML_LANG: Record<string, string> = { zh: "zh-CN", en: "en" };

export function generateStaticParams() {
  return SUPPORTED_LANGUAGES.map((lang) => ({ lang }));
}

export default async function LanguageLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;

  return (
    <html lang={HTML_LANG[lang] ?? lang}>
      <body>
        {children}
        {/* 两个 NEXT_PUBLIC_UMAMI_* 缺任一即不渲染。放 root layout 里,
            Next 保证跨路由只加载一次(见 next/dist/docs 01-app/02-guides/scripts.md)。 */}
        <UmamiAnalytics />
      </body>
    </html>
  );
}
