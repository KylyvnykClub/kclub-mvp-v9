"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";

/**
 * Any page under a locale that throws while rendering lands here instead of
 * Next's bare "Application error" screen - which has no title, and which is
 * what search engines indexed as "Untitled". A titled page with a way to try
 * again, in the reader's language; the error goes to Sentry like the global
 * boundary's.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");
  const locale = useLocale();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <title>{t("metaTitle")}</title>
      <h1 className="max-w-xl text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground sm:text-4xl">
        {t("title")}
      </h1>
      <p className="max-w-md text-sm font-light leading-6 text-muted-foreground">
        {t("body")}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex h-12 items-center justify-center bg-accent px-8 text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
        >
          {t("retry")}
        </button>
        <a
          href={`/${locale}`}
          className="flex h-12 items-center justify-center border border-border px-8 text-xs font-black uppercase tracking-[0.16em] text-foreground hover:bg-muted"
        >
          {t("home")}
        </a>
      </div>
    </main>
  );
}
