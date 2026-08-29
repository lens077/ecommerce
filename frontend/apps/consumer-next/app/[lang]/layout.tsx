import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "../providers";
import "../styles.css";

const SUPPORTED_LANGUAGES = ["zh", "en"] as const;

export const metadata: Metadata = {
  title: {
    default: "Consumer Next POC",
    template: "%s | Consumer Next POC",
  },
  description: "Throwaway Next.js product detail vertical-slice POC",
};

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
    <html lang={lang}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
