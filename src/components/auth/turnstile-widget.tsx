"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  classifyTurnstileError,
  type TurnstileFailure,
} from "./turnstile-error";

/**
 * Cloudflare Turnstile, rendered explicitly (ADR 0012).
 *
 * Implicit rendering — a `.cf-turnstile` div and a `<Script>` left for api.js to
 * discover — is one-shot: api.js scans the document when it loads and never
 * again. Any div that mounts after that scan is simply ignored, with no iframe,
 * no `cf-turnstile-response` input and nothing logged, so the Server Action
 * rejects the registration for a challenge the member was never shown. React
 * reaches that state on its own: StrictMode mounts, unmounts and remounts this
 * component in development, and the step it lives on can remount at any time.
 *
 * Rendering explicitly ties the widget to this component's lifecycle instead of
 * to a document scan, and gives us the callbacks the implicit form has nowhere
 * to put — in particular `error-callback`, which carries the only copy of
 * Cloudflare's failure code.
 *
 * The widget must stay inside the form it protects: Turnstile injects the
 * hidden `cf-turnstile-response` input into this container, and that input is
 * what the Server Action reads out of the FormData.
 *
 * Renders nothing when no site key is configured, which is the local and
 * preview case; the server refuses to boot production without the secret.
 */

interface TurnstileRenderOptions {
  sitekey: string;
  language?: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "error-callback"?: (code: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ) => string | undefined;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Shared across mounts: api.js must be fetched once per document. */
let scriptLoad: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoad) return scriptLoad;

  scriptLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Forget the rejection so a later mount can retry rather than inheriting
      // a failure that may have been one flaky request.
      scriptLoad = null;
      reject(new Error("Turnstile api.js failed to load"));
    };
    document.head.appendChild(script);
  });

  return scriptLoad;
}

/**
 * A configuration failure is an outage of registration itself, so it is logged
 * at error level. Nobody was watching for 110200 because nothing emitted it.
 */
function reportFailure(failure: TurnstileFailure): void {
  const detail = `Turnstile ${failure.kind} failure (${failure.code})`;

  if (failure.operatorActionRequired) {
    console.error(detail);
  } else {
    console.warn(detail);
  }

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.captureMessage(
      detail,
      failure.operatorActionRequired ? "error" : "warning",
    );
  });
}

export function TurnstileWidget({
  siteKey,
  locale,
}: {
  siteKey: string | null;
  locale?: string;
}) {
  const t = useTranslations("register");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState<TurnstileFailure | null>(null);

  useEffect(() => {
    if (!siteKey) return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let widgetId: string | undefined;

    const fail = (code: string | null) => {
      if (cancelled) return;
      const classified = classifyTurnstileError(code);
      setFailure(classified);
      reportFailure(classified);
    };

    loadTurnstile()
      .then(() => {
        // The container can be detached between requesting api.js and getting
        // it — a StrictMode remount, or the member stepping backwards.
        if (cancelled || !container.isConnected || !window.turnstile) return;

        widgetId = window.turnstile.render(container, {
          sitekey: siteKey,
          language: locale,
          theme: "auto",
          callback: () => {
            if (!cancelled) setFailure(null);
          },
          "error-callback": (code) => fail(code),
          // A solved challenge expires after five minutes, and this form is
          // long enough that a member can reach the button after it does.
          "expired-callback": () => {
            if (widgetId) window.turnstile?.reset(widgetId);
          },
          "timeout-callback": () => {
            if (widgetId) window.turnstile?.reset(widgetId);
          },
        });
      })
      .catch(() => fail(null));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        // An explicit widget outlives its container unless it is removed, and a
        // leaked one leaves a stale token in the form it was rendered into.
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Already gone; nothing to release.
        }
      }
    };
  }, [siteKey, locale]);

  if (!siteKey) return null;

  return (
    <div className="space-y-2">
      <div ref={containerRef} />
      {failure && (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
        >
          {t(`turnstileError.${failure.kind}`, { code: failure.code })}
        </p>
      )}
    </div>
  );
}
