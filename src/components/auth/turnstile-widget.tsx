"use client";

import Script from "next/script";

/**
 * Cloudflare Turnstile, rendered implicitly (ADR 0012).
 *
 * The widget must sit inside the form it protects: Cloudflare injects a hidden
 * `cf-turnstile-response` input next to this div, and that input is what the
 * Server Action reads out of the FormData.
 *
 * Renders nothing when no site key is configured, which is the local and
 * preview case; the server refuses to boot production without the secret.
 */
export function TurnstileWidget({
  siteKey,
  locale,
}: {
  siteKey: string | null;
  locale?: string;
}) {
  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-language={locale}
        data-theme="auto"
      />
    </>
  );
}
