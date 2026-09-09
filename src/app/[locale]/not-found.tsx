import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * A 404 with a way out (ux.md §2).
 *
 * Next's built-in page is a dead end: it says the page does not exist and
 * offers nothing, which members report as "the site broke". One button home,
 * in the reader's language.
 */
export default async function LocaleNotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "notFound" });

  return (
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
  );
}
