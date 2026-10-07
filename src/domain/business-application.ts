/**
 * What a business agrees to when it applies, and which way its money goes
 * (ADR 0044). Pure: the rules here decide whether Stripe may be opened at all,
 * so every combination is a unit test rather than a manual check.
 */

/**
 * How the application came in. `invite` - through a member's partner invite
 * link, with an unspent invitation: one free month from publication. `public`
 * - everyone else: the price is due from publication.
 */
export type ApplicationRoute = "public" | "invite";

/**
 * How the card is taken.
 *
 * - `hold` - ADR 0037: the price is authorised at application and captured on
 *   approval.
 * - `setup` - the card is saved with no charge, and the subscription starts at
 *   publication. Used for the invite route (the first month is free), and for
 *   an EU/EEA consumer who did not ask for an early start: their service may
 *   not begin for 14 days, and a hold would lapse long before that.
 */
export type CardCollection =
  | "hold"
  | "setup"
  /**
   * Nothing to collect: the club's own partner link waived the listing
   * (ADR 0040). The owner decided to list this business free.
   */
  | "none";

export type ConsentKind =
  | "terms"
  | "payment_authority"
  | "publication"
  | "marketing"
  | "eu_early_start";

/** The boxes that must be ticked before anything is filed or charged. */
export const REQUIRED_CONSENTS: readonly ConsentKind[] = [
  "terms",
  "payment_authority",
  "publication",
];

export const CONSENT_KINDS: readonly ConsentKind[] = [
  ...REQUIRED_CONSENTS,
  "marketing",
  "eu_early_start",
];

/**
 * The version of the consent wording. The full text is stored with every
 * record anyway; this names the generation, so "everyone who agreed before the
 * wording changed" is one query. Bump it whenever a consent string changes in
 * any locale.
 */
export const CONSENT_TEXT_VERSION = "2026-10-07";

/** The statutory withdrawal period for an EU/EEA distance contract. */
export const EU_WITHDRAWAL_DAYS = 14;

/**
 * EU member states and the three further EEA states (Iceland, Liechtenstein,
 * Norway), whose consumer law carries the 14-day right of withdrawal. Switzerland
 * is not in the EEA and has no such general right; the specification asks for
 * its rules to be checked separately, which is a lawyer's question, not a
 * list's.
 */
const EU_EEA_COUNTRIES: ReadonlySet<string> = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
]);

export function isEuEeaResident(countryCode: string | null | undefined) {
  return (
    Boolean(countryCode) && EU_EEA_COUNTRIES.has(countryCode!.toUpperCase())
  );
}

/**
 * Which consents are missing, or `[]` when the application may proceed.
 * `eu_early_start` and `marketing` are never required: an EU consumer may
 * decline an early start, which defers the start instead of refusing it.
 * Payment authority is required whenever there is anything to pay - which is
 * every application but one the club's partner link made free.
 */
export function missingConsents(
  ticked: ReadonlySet<ConsentKind>,
  paymentRequired = true,
): ConsentKind[] {
  return REQUIRED_CONSENTS.filter(
    (kind) =>
      !ticked.has(kind) && (kind !== "payment_authority" || paymentRequired),
  );
}

/**
 * The application's terms, decided once, on the server, from facts the
 * browser cannot set: the invitation recorded at registration and the
 * member's own country of residence.
 */
export interface ApplicationTerms {
  route: ApplicationRoute;
  collection: CardCollection;
  /** Nothing may be published, captured or started before this. */
  startNotBefore: Date | null;
  /** An EU/EEA consumer - shown the withdrawal right and the button. */
  euConsumer: boolean;
}

export function applicationTerms(input: {
  invited: boolean;
  /** The club's own partner link is on this browser (ADR 0040). */
  clubLinkWaiver?: boolean;
  residenceCountry: string | null;
  earlyStartRequested: boolean;
  now: Date;
}): ApplicationTerms {
  const euConsumer = isEuEeaResident(input.residenceCountry);

  // The owner's free listing outranks an invitation's free month, and the
  // invitation is left unspent for the next application.
  if (input.clubLinkWaiver) {
    return {
      route: "public",
      collection: "none",
      startNotBefore: null,
      euConsumer,
    };
  }

  const route: ApplicationRoute = input.invited ? "invite" : "public";
  const deferred = euConsumer && !input.earlyStartRequested;

  return {
    route,
    collection: route === "invite" || deferred ? "setup" : "hold",
    startNotBefore: deferred
      ? new Date(input.now.getTime() + EU_WITHDRAWAL_DAYS * 86_400_000)
      : null,
    euConsumer,
  };
}

/**
 * Which payment-authority wording the applicant must have agreed to. The
 * three differ in substance - a free month, a reservation now, or a saved card
 * charged later - so a record of one is never accepted for another.
 */
export type PaymentAuthorityWording = "invite" | "public_hold" | "public_setup";

export function paymentAuthorityWording(
  terms: Pick<ApplicationTerms, "route" | "collection">,
): PaymentAuthorityWording | null {
  if (terms.collection === "none") return null;
  if (terms.route === "invite") return "invite";
  return terms.collection === "hold" ? "public_hold" : "public_setup";
}

/** Whether the EU withdrawal button is still offered (ADR 0044 §5). */
export function withdrawalWindowOpen(contractAt: Date, now: Date): boolean {
  return now.getTime() - contractAt.getTime() < EU_WITHDRAWAL_DAYS * 86_400_000;
}
