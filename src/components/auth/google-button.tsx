"use client";

import { useLocale, useTranslations } from "next-intl";

/**
 * "Continue with Google" (ADR 0029).
 *
 * A plain link, not a button in a form: the flow starts with a GET to a Route
 * Handler that redirects to Google, and a Server Action cannot redirect
 * off-site with the cookies this needs set.
 *
 * The locale rides along so the member comes back to the language they left,
 * and the mark is inline SVG — Google's own asset would be a third-party
 * request on the sign-in page, which is exactly what the flags in this
 * codebase already avoid.
 */
export function GoogleButton() {
  const t = useTranslations("auth");
  const locale = useLocale();

  return (
    <a
      href={`/api/auth/google/start?locale=${locale}`}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-md border border-input bg-background text-xs font-bold uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <GoogleMark />
      {t("googleContinue")}
    </a>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

/** The rule above the button, so it reads as an alternative rather than a step. */
export function AuthDivider() {
  const t = useTranslations("auth");

  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {t("orDivider")}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
