import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { LOCALE_COOKIE_NAME, locales, routing } from "@/i18n/routing";

import "./globals.css";

/**
 * Every 404 on the site (ux.md §2).
 *
 * App Router uses the *root* not-found for a URL that matches no route at all;
 * the one under `[locale]` only answers a `notFound()` thrown inside that
 * subtree. So this page renders for `/ru/no-such-page` as much as for a stray
 * `/dashbord`, and it renders **outside** `[locale]/layout.tsx` — which is
 * where `globals.css` is imported and where next-intl learns the locale. Both
 * have to be arranged here by hand, or the page comes out as unstyled English
 * on a white ground, which is what it did.
 */
async function preferredLocale(): Promise<string> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (saved && locales.includes(saved as (typeof locales)[number])) {
    return saved;
  }

  // The same order the middleware uses: a stated preference first, then what
  // the browser asks for (FR-091).
  const accepted =
    (await headers()).get("accept-language")?.toLowerCase() ?? "";
  return (
    locales.find((locale) => accepted.startsWith(locale)) ??
    routing.defaultLocale
  );
}

export default async function RootNotFound() {
  const locale = await preferredLocale();
  const t = await getTranslations({ locale, namespace: "notFound" });

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            404
          </p>
          <h1 className="max-w-xl text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground sm:text-4xl">
            {t("title")}
          </h1>
          <p className="max-w-md text-sm font-light leading-6 text-muted-foreground">
            {t("body")}
          </p>
          <Link
            href={`/${locale}`}
            className="mt-2 flex h-12 items-center justify-center bg-accent px-8 text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
          >
            {t("home")}
          </Link>
        </main>
      </body>
    </html>
  );
}
