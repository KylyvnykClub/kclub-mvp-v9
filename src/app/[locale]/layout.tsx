import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { env } from "@/env";

import { fontBody, fontHeading } from "@/app/fonts";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "../globals.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    // Absolute base for canonical/hreflang/OG URLs; without it relative
    // metadata URLs never resolve and social/canonical links break.
    metadataBase: new URL(env.server.NEXT_PUBLIC_APP_URL),
    title: t("title"),
    description: t("description"),
    applicationName: "KYLYVNYK CLUB",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "KCLUB",
      statusBarStyle: "black-translucent",
    },
    openGraph: {
      type: "website",
      siteName: "KYLYVNYK CLUB",
      locale,
      title: t("title"),
      description: t("description"),
    },
    // NOTE: the whole locale subtree is noindex while in pre-launch beta. At
    // launch this must move to the (auth) and (dashboard) subtrees only, so the
    // public marketing, catalogue and legal pages become indexable. Tracked as
    // seo-public-pages-are-noindex.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090909",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${fontHeading.variable} ${fontBody.variable} font-sans antialiased`}
      >
        <NextIntlClientProvider>
          <ThemeProvider>
            {children}
            {/* Mounted once for the whole app: toast() is called from four
                client components (member and staff alike) and every one of
                them was a silent no-op without a Toaster in the tree. */}
            <Toaster />
            <PwaRegister />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
