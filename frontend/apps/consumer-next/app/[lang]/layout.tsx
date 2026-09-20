import type { Metadata } from "next";
import type { ReactNode } from "react";
import { UmamiAnalytics } from "@/analytics/umami";

const SUPPORTED_LANGUAGES = ["zh", "en"] as const;

export const metadata: Metadata = {
  title: {
    default: "灯市",
    template: "%s | 灯市",
  },
  description: "灯市——每件好物是一盏灯。数码、服饰、食百的综合商城。",
};

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
