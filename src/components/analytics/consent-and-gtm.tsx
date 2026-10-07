"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import Link from "next/link";

import {
  analyticsAllowedOn,
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  GTM_CONTAINER_ID,
  OPEN_CONSENT_EVENT,
  parseConsent,
  type ConsentChoice,
} from "@/lib/analytics-consent";

/**
 * The cookie banner and Google Tag Manager (ADR 0045).
 *
 * Nothing from Google loads until the visitor presses "Accept". Before that
 * the page sets no cookie but the one that will remember the choice. Accept
 * and Reject are equal buttons, and "Cookie settings" in the footer brings
 * the banner back. GTM never loads on the account, the console, payment or
 * any form (`analyticsAllowedOn`), whatever was chosen.
 *
 * Consent Mode v2 defaults are pushed before the container, and granted
 * explicitly, so tags inside GTM read the same answer the banner gave.
 */
function readChoice(): ConsentChoice | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.split("=")[1]);
}

function storeChoice(choice: ConsentChoice) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

export function ConsentAndGtm() {
  const t = useTranslations("cookieConsent");
  const locale = useLocale();
  const pathname = usePathname();
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = readChoice();
    setChoice(stored);
    setOpen(stored === null);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  const decide = (next: ConsentChoice) => {
    storeChoice(next);
    setOpen(false);
    // Withdrawing consent after GTM has loaded: tags stop at once, and the
    // page reloads so nothing already running keeps going.
    if (choice === "granted" && next === "denied") {
      window.location.reload();
      return;
    }
    setChoice(next);
  };

  const load = choice === "granted" && analyticsAllowedOn(pathname);

  return (
    <>
      {load && (
        <Script id="gtm" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});
gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`}
        </Script>
      )}

      {open && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label={t("title")}
          className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-background/95 p-4 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md sm:rounded-lg sm:border"
        >
          <p className="text-sm font-semibold text-foreground">{t("title")}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("body")}{" "}
            <Link
              href={`/${locale}/legal/cookie-policy`}
              className="font-medium underline hover:text-foreground"
            >
              {t("policy")}
            </Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => decide("denied")}
              className="h-10 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("reject")}
            </button>
            <button
              type="button"
              onClick={() => decide("granted")}
              className="h-10 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("accept")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** "Cookie settings" - for the footers. */
export function CookieSettingsLink({ className }: { className?: string }) {
  const t = useTranslations("cookieConsent");
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      {t("settings")}
    </button>
  );
}
