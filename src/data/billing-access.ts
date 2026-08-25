/**
 * Pure billing access and dunning rules, deliberately free of any database or
 * environment import so they can be unit-tested without a connection.
 * data/billing.ts re-exports these, so the public import path stays
 * `@/data/billing`.
 */

/**
 * The subscription statuses that grant access. `active` is the paid steady
 * state; `past_due` is kept deliberately while Stripe retries a failed payment
 * across the dunning window (FR-056). Every other status - `unpaid`,
 * `canceled`, `incomplete`, `incomplete_expired`, `paused`, and the
 * projection's terminal `deleted` - is a loss of entitlement.
 *
 * This is the single definition of "a subscription that grants access". The
 * entitlement projection reads it to set a member's card tier, and
 * `listActiveSubscriptionsForDeletion` reads it to decide which subscriptions a
 * member still holds. Money and access must never disagree (ADR 0004), so the
 * rule lives in one place with a test rather than being copied per call site.
 */
export const ACCESS_GRANTING_SUBSCRIPTION_STATUSES: readonly string[] = [
  "active",
  "past_due",
];

/**
 * VIP while the subscription status grants access, free for every terminal or
 * lapsed status. Whichever end-of-dunning action Stripe is configured with -
 * `cancel the subscription` (→ `deleted`) or `mark as unpaid` (→ `unpaid`) -
 * resolves to `free` here, so a failed payment always loses access.
 */
export function tierForSubscriptionStatus(status: string): "vip" | "free" {
  return ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(status)
    ? "vip"
    : "free";
}

/**
 * FR-056: the dunning window Stripe retries a failed payment across. This MUST
 * match the Stripe Smart Retries schedule in the dashboard (Settings → Billing →
 * Manage failed payments): today "retry up to 8 times within 2 weeks", with the
 * end-of-retries action set to cancel the subscription. If that schedule
 * changes, change this too - a shorter Stripe window cancels access before the
 * grace warning fires; a longer one warns and then keeps access past the window.
 * The coupling is not enforceable from code (it is a dashboard setting), so it
 * is pinned by a test and documented in docs/integration.md. See the backlog
 * item stripe-dunning-settings-are-config-not-code.
 */
export const GRACE_PERIOD_DAYS = 14;
