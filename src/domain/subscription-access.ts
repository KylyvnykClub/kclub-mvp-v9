/**
 * The one definition of "a subscription that grants access" (ADR 0004).
 *
 * It lived in `src/data/billing-access.ts`, which is a pure module in a layer
 * that is not. Membership dues need the same list (ADR 0033) and the rule that
 * reads it is domain code, which may not import from `src/data` at all — so the
 * constant moves here and the data layer re-exports it. One definition, two
 * import paths, no second copy to drift.
 *
 * `active` is the paid steady state; `past_due` is kept deliberately while
 * Stripe retries a failed payment across the dunning window (FR-056). Every
 * other status — `unpaid`, `canceled`, `incomplete`, `incomplete_expired`,
 * `paused`, and the projection's terminal `deleted` — is a loss of entitlement.
 */
export const ACCESS_GRANTING_SUBSCRIPTION_STATUSES: readonly string[] = [
  "active",
  "past_due",
];

/**
 * Statuses that publish a **listing** (ADR 0044): everything that grants
 * access, plus `trialing` - the free month an invited business gets from
 * publication. Only listings: a trial never opens dues, VIP or a card tier,
 * and it is never "a listing paid for with money" for the invite matrix
 * (ADR 0042 §3), which keeps reading `ACCESS_GRANTING_SUBSCRIPTION_STATUSES`.
 */
export const LISTING_PUBLISHABLE_STATUSES: readonly string[] = [
  ...ACCESS_GRANTING_SUBSCRIPTION_STATUSES,
  "trialing",
];
