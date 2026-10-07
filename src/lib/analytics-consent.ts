/**
 * Analytics consent (ADR 0045): whether Google Tag Manager may load. Pure, so
 * the rules - which pages never load it, what the stored choice means - are
 * unit tests rather than a reading of a component.
 */

export const GTM_CONTAINER_ID = "GTM-P9PZ5883";

/** Strictly necessary: it records the choice itself, for 12 months. */
export const CONSENT_COOKIE = "kclub_consent";
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Dispatched by "Cookie settings" to show the banner again. */
export const OPEN_CONSENT_EVENT = "kclub:open-consent";

export type ConsentChoice = "granted" | "denied";

export function parseConsent(
  value: string | undefined | null,
): ConsentChoice | null {
  return value === "granted" || value === "denied" ? value : null;
}

/**
 * Pages where no third-party script runs, whatever the visitor chose: the
 * account, the console, payment, sign-up and sign-in, the card, and every
 * form that carries personal data or a secret in its URL. Locale-prefixed
 * paths, so the second segment is the one that matters.
 */
const PRIVATE_SECTIONS = new Set([
  "dashboard",
  "membership",
  "login",
  "register",
  "partner",
  "forgot-password",
  "reset-password",
  "verify-email",
  "card",
  "join",
  "r",
]);

export function analyticsAllowedOn(pathname: string): boolean {
  const section = pathname.split("/").filter(Boolean)[1];
  return section === undefined || !PRIVATE_SECTIONS.has(section);
}
